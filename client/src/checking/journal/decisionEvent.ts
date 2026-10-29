// Copied from unfoldingWord/translationCore4 src/data/journal/journalingStore.ts at b1911407b00577bf04c4bed1499bd5ac45423b0b. Changes: only canonical, decisionRegisterKey and decisionEvent (lines 136-163, 2720-2785) as functions over a fold output; book decisions only (no story form); the actor and its clock are passed in.
import type { Decision } from '../types';
import { normalizeDecision } from '../normalizeDecision';

/** One journal event as the writer builds it (the envelope fields the reference schema validates). */
export interface DecisionEvent {
  v: 1;
  generation: string;
  op: 'check.decision.set';
  actor: string;
  ts: string;
  base: string | null;
  toolId: string;
  decision: Record<string, unknown>;
}

/** The fold output fields this writer reads (journal/fold.mjs). */
export interface DecisionFold {
  books: Record<string, unknown>;
  decisions: Record<string, unknown[]>;
  headsTs: Record<string, string>;
}

/** Canonical (key-sorted) JSON for CONTENT comparison — never for bytes. */
const canonical = (value: unknown): string => {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort())
        out[k] = sort((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value));
};

/** The journal's §5.2 decision register key: dec|toolId|checkId|bookId|chapter|verse|occurrence
 * — the SAME string journal/fold.mjs keys on (identityKeyOf parts). */
export const decisionRegisterKey = (tool: string, decision: Decision): string => {
  const c = decision.contextId;
  const r = c.reference;
  return ['dec', tool, c.checkId, r.bookId, String(r.chapter), String(r.verse), String(c.occurrence)].join('|');
};

/** The check.decision.set event for one decision, or null when the journal already projects it unchanged.
 * Refuses a book the journal does not hold (R-8.5.6) and a decision whose quote changed under it (§5.2, #62). */
export const decisionEvent = (
  tool: string,
  code: string,
  decision: Decision,
  foldOut: DecisionFold,
  actor: string,
  issueTs: () => string,
): DecisionEvent | null => {
  const generation = foldOut.books[code] ? foldOut.headsTs[`book|${code}`] : undefined;
  if (generation === undefined) throw new Error(`upsertDecision(${tool}, ${code}): the journal projects no such book`);
  const incoming = normalizeDecision(decision);
  const key = decisionRegisterKey(tool, incoming);
  const projected = (foldOut.decisions[tool] ?? []).find(
    (candidate) => decisionRegisterKey(tool, candidate as unknown as Decision) === key,
  );
  // An invalidated record is unmatched already (§5.2): a change of checking
  // language leaves the English-quoted record of a check it could not place, and
  // a new decision on the same key replaces it (#448).
  const quoteChanged =
    projected &&
    !(projected as { invalidated?: unknown }).invalidated &&
    (projected as { contextId: { quoteString?: unknown } }).contextId.quoteString !==
      incoming.contextId.quoteString;
  if (quoteChanged)
    throw new Error(
      `upsertDecision(${tool}, ${code}): the stored decision at this §5.2 identity key carries ` +
        `a different quoteString — the resource behind this check changed; re-derive and carry ` +
        `over (a warned update) instead of overwriting (§5.2, issue #62)`,
    );
  if (projected && canonical(projected) === canonical(incoming)) return null;
  return {
    v: 1,
    generation,
    op: 'check.decision.set',
    actor,
    ts: issueTs(),
    base: foldOut.headsTs[key] ?? null,
    toolId: tool,
    decision: incoming as unknown as Record<string, unknown>,
  };
};
