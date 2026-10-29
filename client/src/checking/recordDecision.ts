// Copied from unfoldingWord/translationCore4 src/state.jsx at b1911407b00577bf04c4bed1499bd5ac45423b0b. Changes: only recordDecision's merge of a patch over the item (lines 5958-5970) as a pure function, typed; the scheduler and dispatch stay in tC4.
import type { Decision } from './types';

/** What a Check button records (tC4 Check.jsx markValid/markInvalid). */
export type DecisionPatch = Partial<Pick<Decision, 'selections' | 'nothingToSelect' | 'status'>>;

/** The item with the patch merged in and a new modifiedTimestamp. On a check already invalidated
 * (a draft edit, a change of language), the user's own Invalid is marked as theirs, so a later
 * re-attach keeps it; any other status the user records removes the mark (#580, §5.2 1.19). */
export const recordDecision = (item: Decision, patch: DecisionPatch, now: string): Decision => {
  const next: Decision = {
    ...item,
    ...patch,
    modifiedTimestamp: now,
  };
  if (item.invalidated === true && 'status' in patch) {
    if (patch.status === 'invalid') next.userInvalid = true;
    else delete next.userInvalid;
  }
  return next;
};
