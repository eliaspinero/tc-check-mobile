// Sync, the same from every screen that offers it (#59): the books, the list, the check, and a project's row.
import type { ProjectSource } from '../project/ProjectSource';
import type { SyncFailure } from '../screens/syncFailure';
import { isTcProject, syncTc } from './decide';
import { forgetProject } from './kept';

/** A project in the Rust tC4's format syncs as the Rust tC4 does, both ways, after the decisions on their way; any
 * other only brings Door43 main into this copy (it holds nothing the phone wrote). Once synced, the project's kept
 * reads go, so its screens read it again. Returns why a Rust tC4 sync stopped, or null when it synced. */
export const syncProject = async (repoPath: string, as: { username: string; token: string }, source: ProjectSource): Promise<SyncFailure | null> => {
  // The project's own format decides, not a list: Sync may be tapped before any list has loaded.
  if (isTcProject(await source.listPaths(repoPath))) {
    const result = await syncTc(repoPath, as, source);
    if (!result.synced) return result.failure;
  } else {
    await source.enableNet();
    await source.pull(repoPath);
  }
  forgetProject(repoPath);
  return null;
};
