// The rig's state folder: dev-env/state in the main checkout. Every worktree's rig, seed and journeys
// resolve to this one folder, so a rig started anywhere is the rig they all seed and read.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const stateDir = () => {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: here, encoding: 'utf8' }).trim();
  return path.join(path.dirname(common), 'dev-env', 'state');
};
