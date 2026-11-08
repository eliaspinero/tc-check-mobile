// A decision on this phone, recorded by the Rust tC4's store in the shell (shell/src-tauri/src/tc.rs). The
// project's packs are the record; `checking/<tool>/<BOOK>.json` is written again from them, and the list reads it.
import type { CheckItem, DecisionPatch, ResourcePin, Tool } from '../engine/CheckingEngine';
import type { ProjectSource, TcSyncResult } from '../project/ProjectSource';

/** True when the project is in the Rust tC4's format, the only one the phone records decisions in. */
export const isTcProject = (paths: string[]): boolean => paths.includes('tc/project.json');

export interface DecideInput {
  repoPath: string;
  tool: Tool;
  item: CheckItem;
  patch: DecisionPatch;
  /** The pin the list was derived from: the decision's `resource` (STORAGE.md §5.4). */
  pin: ResourcePin;
}

// Decisions sent and not answered yet, by project: a checker can tap Valid, go Back and tap Sync before the decision
// has reached the shell, and the sync must take it.
const inFlight = new Map<string, Set<Promise<void>>>();
// The last decision sent, by project: each waits for the one before, so the words saved a moment after a tap and a
// Valid tapped right then reach the store in the order they were made.
const last = new Map<string, Promise<void>>();

export const decide = ({ repoPath, tool, item, patch, pin }: DecideInput, source: ProjectSource): Promise<void> => {
  const before = last.get(repoPath) ?? Promise.resolve();
  const sent = before.catch(() => undefined).then(() => source.recordDecision(repoPath, {
    tool,
    contextId: item.contextId,
    category: typeof item.category === 'string' ? item.category : '',
    resource: { repoPath: pin.repoPath, sha: pin.sha },
    status: patch.status,
    selections: patch.selections,
    nothingToSelect: patch.nothingToSelect,
  }));
  last.set(repoPath, sent);
  const pending = inFlight.get(repoPath) ?? new Set<Promise<void>>();
  inFlight.set(repoPath, pending);
  pending.add(sent);
  const done = () => void pending.delete(sent);
  sent.then(done, done);
  return sent;
};

/** Sync a project in the Rust tC4's format, once every decision sent before it is recorded. */
export const syncTc = async (repoPath: string, as: { username: string; token: string }, source: ProjectSource): Promise<TcSyncResult> => {
  await Promise.allSettled([...(inFlight.get(repoPath) ?? [])]);
  return source.syncTc(repoPath, as);
};

/** True when the project is in tC4 4.x's format (a journal and no Rust tC4 project file): the team moves it to the
 * new translationCore on a computer, and the phone does not open it (#48). */
export const isTc4xProject = (paths: string[]): boolean => !isTcProject(paths) && paths.some((p) => p.startsWith('checking/journal/'));
