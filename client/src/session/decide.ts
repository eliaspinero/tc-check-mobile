// A decision on this phone, recorded by the Rust tC4's store in the shell (shell/src-tauri/src/tc.rs). The
// project's packs are the record; `checking/<tool>/<BOOK>.json` is written again from them, and the list reads it.
import type { CheckItem, DecisionPatch, ResourcePin, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';

/** True when the project is in the Rust tC4's format, the only one the phone records decisions in. */
export const isTcProject = (paths: string[]): boolean => paths.includes('tc/project.json');

export interface DecideInput {
  repoPath: string;
  tool: Tool;
  item: CheckItem;
  patch: Required<DecisionPatch>;
  /** The pin the list was derived from: the decision's `resource` (STORAGE.md §5.4). */
  pin: ResourcePin;
}

export const decide = ({ repoPath, tool, item, patch, pin }: DecideInput, source: ProjectSource): Promise<void> =>
  source.recordDecision(repoPath, {
    tool,
    contextId: item.contextId,
    category: typeof item.category === 'string' ? item.category : '',
    resource: { repoPath: pin.repoPath, sha: pin.sha },
    status: patch.status,
    selections: patch.selections,
    nothingToSelect: patch.nothingToSelect,
  });
