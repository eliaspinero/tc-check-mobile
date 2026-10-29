// The journal half of tsEngine: tC4's §8 journal code, copied in client/src/checking/journal/.
import { fold as foldEvents } from '../checking/journal/fold.mjs';
import { projectDecisions } from '../checking/journal/checkpoint.mjs';
import { makeClock } from '../checking/journal/hlc.mjs';
import { sealAction, segmentName, validateSegment, type JournalEvent } from '../checking/journal/seal';
import { deriveActorId, newInstallationSecret } from '../checking/journal/identity';
import { decisionEvent, type DecisionFold } from '../checking/journal/decisionEvent';
import { recordDecision } from '../checking/recordDecision';
import { selectionsFromTokens } from '../checking/selections';
import type { Decision } from '../checking/types';
import type { CheckItem, JournalEngine, JournalFold } from './CheckingEngine';

type Folded = Omit<DecisionFold, 'decisions'> & { decisions: Record<string, Decision[]> };
const folded = (f: JournalFold): Folded => f.fold as Folded;

// tC4 journalStore DEFAULT_DEVICE_LABEL: non-identifying, never a user or device name (PRD FR-33, D7).
const DEVICE_LABEL = 'translation device';

export const tsJournal: JournalEngine = {
  readSegment: validateSegment,
  fold: (events) => ({ fold: foldEvents(events) }),
  hasBook: (f, book) => book.toUpperCase() in folded(f).books,
  decisions: (f, tool, book) =>
    (folded(f).decisions[tool] ?? []).filter((d) => String(d.contextId.reference.bookId).toUpperCase() === book.toUpperCase()) as unknown as CheckItem[],
  actorId: deriveActorId,
  newSecret: newInstallationSecret,
  actorDoc: (actorId, now) => JSON.stringify({ schemaVersion: 1, actorId, createdAt: now, device: DEVICE_LABEL }, null, 2),
  decide: async ({ fold, events, actor, tool, book, item, patch, now }) => {
    const clock = makeClock(actor, now);
    for (const e of events) clock.ratchet((e as JournalEvent).ts);
    const decision = recordDecision(item as unknown as Decision, patch, new Date(now()).toISOString());
    const event = decisionEvent(tool, book.toUpperCase(), decision, folded(fold), actor, clock.issue);
    if (!event) return null;
    const written = [event as unknown as JournalEvent];
    return { name: segmentName(event.ts), bytes: await sealAction(written), events: written };
  },
  decisionFile: (f, tool, book, resource) => {
    const code = book.toUpperCase();
    const mine = tsJournal.decisions(f, tool, code);
    if (mine.length === 0) return null;
    // projectDecisions over this one (tool, book): the bytes tC4 regenerates for the file.
    const files = projectDecisions({ decisions: { [tool]: mine } }, { [tool]: { [code]: resource } }) as Record<string, string>;
    return files[`checking/${tool}/${code}.json`] ?? null;
  },
  patch: (button, verseText, tapped) => {
    if (button === 'invalid') return { selections: false, nothingToSelect: false, status: 'invalid' };
    const selections = selectionsFromTokens(verseText, [...tapped].sort((a, b) => a - b));
    return { selections: selections.length ? selections : false, nothingToSelect: selections.length === 0, status: 'valid' };
  },
};
