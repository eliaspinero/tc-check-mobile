// Copied from unfoldingWord/translationCore4 src/data/httpStore.ts at b1911407b00577bf04c4bed1499bd5ac45423b0b. Changes: only toIntegerOccurrence, normalizeContextId and normalizeDecision (lines 259-309); types from ./types.
import type { Decision, DecisionContextId } from './types';

/** INVARIANT I-2 (BURRITO-SPEC §5): every occurrence/occurrences field is an
 * integer on disk. Parser-shaped inputs arrive as strings ("1"); coerce them,
 * and REJECT anything that is not an integer rather than persist a `NaN`/string
 * (a bare `Number("x")` would silently write `null`). Applied at every decision
 * write boundary — the single upsert AND the whole-file rewrite. */
const toIntegerOccurrence = (value: unknown, field: string): number => {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value);
  throw new RangeError(
    `I-2: ${field} must be an integer occurrence, got ${JSON.stringify(value)}`,
  );
};

/** Normalize the occurrence-bearing fields of a decision's contextId: its own
 * `occurrence`, and (for a tN array quote) each quote word's `occurrence`. */
const normalizeContextId = (contextId: DecisionContextId): DecisionContextId => ({
  ...contextId,
  occurrence: toIntegerOccurrence(contextId.occurrence, 'contextId.occurrence'),
  ...(Array.isArray(contextId.quote)
    ? {
        quote: contextId.quote.map((word) => ({
          ...word,
          occurrence: toIntegerOccurrence(word.occurrence, 'quote.occurrence'),
        })),
      }
    : {}),
});

export const normalizeDecision = (decision: Decision): Decision => {
  // PLATFORM-NOTES #14: empty selections coerce to false — [] is not used.
  const selections = Array.isArray(decision.selections)
    ? decision.selections.length === 0
      ? false
      : decision.selections.map((selection) => ({
          ...selection,
          occurrence: toIntegerOccurrence(selection.occurrence, 'selection.occurrence'),
          occurrences: toIntegerOccurrence(selection.occurrences, 'selection.occurrences'),
        }))
    : decision.selections;
  return {
    ...decision,
    contextId: normalizeContextId(decision.contextId),
    selections,
    // §5.2: a writer that sets invalidated MUST NOT leave status:"valid" in place.
    ...(decision.invalidated && decision.status === 'valid'
      ? { status: 'invalid' as const }
      : {}),
    // §5.2: modifiedTimestamp is REQUIRED (Phase-2 forward-compat).
    modifiedTimestamp: decision.modifiedTimestamp ?? new Date().toISOString(),
  };
};
