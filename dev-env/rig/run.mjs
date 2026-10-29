// npm run rig: build this checkout's client into the shell resources (pankosmia-web refuses to start
// without it), then build and start the rig on the shared state folder (dev-env/stateDir.mjs).
import { spawnSync } from 'node:child_process';
import { stateDir } from '../stateDir.mjs';

const run = (cmd, args) => {
  const { status } = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (status !== 0) process.exit(status ?? 1);
};

run('node', ['scripts/build-client-into-shell.mjs', '--qa']);
run('cargo', ['run', '--release', '--manifest-path', 'dev-env/rig/Cargo.toml', '--', stateDir()]);
