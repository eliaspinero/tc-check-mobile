// A decision applied to the session in memory (#59), so the screen shows it as soon as the store has it, without
// reading and deriving the book again. It is what the Rust tC4's store does with the same change (tc-journal
// `DecisionEdit::apply`): the words and "nothing to select" replace the old ones, a button's status replaces the
// status (none keeps it), and a judgement made on the list's own pin clears an invalidation. The decision file says
// the same after the project's next checkpoint.
import type { CheckingEngine, DecisionPatch } from '../engine/CheckingEngine';
import type { Session } from './loadSession';

export const withDecision = (session: Session, at: number, patch: DecisionPatch, engine: CheckingEngine): Session => {
  const items = session.items.map((item, i) =>
    i === at
      ? { ...item, selections: patch.selections, nothingToSelect: patch.nothingToSelect, invalidated: false, ...(patch.status && { status: patch.status }) }
      : item,
  );
  return { ...session, items, progress: engine.progress(items) };
};
