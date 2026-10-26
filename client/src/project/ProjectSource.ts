// The only module that talks to the server about projects and installed resources.
// A change of project format or of server touches this folder only.
import type { ResourcesFile } from '../checking/types';
import type { DecisionFile } from '../checking/types';
import type { Tool } from '../checking/resolve';

export interface ProjectSource {
  /** The platform's network gate starts off; clone, pull and catalog calls need it on. */
  enableNet(): Promise<void>;
  /** Repo paths on this device, like `git.door43.org/<org>/<repo>` or `_local_/_sideloaded_/<owner>--<repo>`. */
  listLocal(): Promise<string[]>;
  /** Clone a Door43 repository; returns its local repo path. */
  clone(host: string, org: string, repo: string): Promise<string>;
  /** Pull Door43 main into the local copy (remote `origin`). */
  pull(repoPath: string): Promise<void>;
  readText(repoPath: string, ipath: string): Promise<string>;
  readMetadata(repoPath: string): Promise<Record<string, unknown>>;
  /** `ingredients/checking/resources.json`, or null when the repo is not a tC4 project. */
  readResources(repoPath: string): Promise<ResourcesFile | null>;
  /** The §5.2 decision file of (tool, book), or null when nothing was decided. */
  readDecisions(repoPath: string, tool: Tool, book: string): Promise<DecisionFile | null>;
  /** Install an unwrapped burrito zip at a `_local_/_sideloaded_/` path. */
  installResourceZip(localRepoPath: string, zip: Uint8Array): Promise<void>;
}

/** A refusal from the server: the route, the status, and the server's own reason. Never the request body. */
export class ServerError extends Error {
  constructor(readonly route: string, readonly status: number, readonly reason: string) {
    super(`${route} → ${status}: ${reason}`);
    this.name = 'ServerError';
  }
}
