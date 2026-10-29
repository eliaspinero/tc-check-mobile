// A journaled copy of the sample project, as tC4 leaves a project it opened: its sidecars seeded into
// one journal action by tC4's own seeder (journal/reconcile.mjs seedFromSidecars, copied in the client).
import { seedFromSidecars } from '../../client/src/checking/journal/reconcile.mjs';
import { fold } from '../../client/src/checking/journal/fold.mjs';
import { sealAction, segmentName, validateSegment, type JournalEvent } from '../../client/src/checking/journal/seal';
import { tsJournal } from '../../client/src/engine/tsJournal';
import { scopeOf } from '../../client/src/session/loadSession';
import { SAMPLE_PROJECT, listPaths, placeRepo, readIngredient, readMetadata, writeIngredient } from './rig';

/** The actor tC4 desktop is in these journeys. */
export const DESKTOP_ACTOR = 'tc4-desktop-test';
const JOURNAL = 'checking/journal/';

/** Copy the sample project to `target` and seed its journal as tC4 desktop would on first open. */
export const placeJournaledProject = async (target: string): Promise<void> => {
  await placeRepo(SAMPLE_PROJECT, target);
  const read = (ipath: string) => readIngredient(target, ipath);
  const scope = scopeOf(await readMetadata(target));
  const books: Record<string, { usfm: string; scope: string[] }> = {};
  for (const book of Object.keys(scope)) books[book] = { usfm: await read(`${book}.usfm`), scope: scope[book] };
  const events = seedFromSidecars({
    actor: DESKTOP_ACTOR,
    books,
    decisionFiles: {
      translationWords: JSON.parse(await read('checking/translationWords/TIT.json')),
      translationNotes: JSON.parse(await read('checking/translationNotes/TIT.json')),
    },
    resources: JSON.parse(await read('checking/resources.json')),
    settings: JSON.parse(await read('checking/settings.json')),
    vrs: { name: 'unrecorded', bytes: await read('vrs.json') },
  }) as JournalEvent[];
  await writeIngredient(target, `${JOURNAL}${DESKTOP_ACTOR}/actor.json`, tsJournal.actorDoc(DESKTOP_ACTOR, '2020-01-01T00:00:00.000Z'));
  await writeIngredient(target, `${JOURNAL}${DESKTOP_ACTOR}/segments/${segmentName(events[0].ts)}`, await sealAction(events));
};

/** Every journal file of a project, by ingredient path. */
export const journalFiles = async (repoPath: string): Promise<Record<string, string>> => {
  const paths = (await listPaths(repoPath)).filter((p) => p.startsWith(JOURNAL));
  const out: Record<string, string> = {};
  for (const p of paths) out[p] = await readIngredient(repoPath, p);
  return out;
};

/** The project's journal as tC4 reads it: every segment through tC4's validator, then folded. */
export const foldOf = async (repoPath: string): Promise<{ fold: ReturnType<typeof fold>; events: JournalEvent[]; refused: string[] }> => {
  const events: JournalEvent[] = [];
  const refused: string[] = [];
  for (const [ipath, raw] of Object.entries(await journalFiles(repoPath))) {
    if (!ipath.endsWith('.action.json')) continue;
    const verdict = await validateSegment(raw);
    if (verdict.ok) events.push(...verdict.events);
    else refused.push(`${ipath}: ${verdict.reason}`);
  }
  return { fold: fold(events), events, refused };
};
