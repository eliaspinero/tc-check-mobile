// The journeys test the server the phone ships: the rig and the shell pin the same pankosmia_web.
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { NEEDS_RIG, RIG_REPOS_DIR, SAMPLE_PROJECT, listLocal, rigUp } from './helpers/rig';

const pinIn = (manifest: string): string | null => {
  const text = readFileSync(new URL(`../${manifest}`, import.meta.url), 'utf8');
  return text.match(/^pankosmia_web\s*=\s*"([^"]+)"/m)?.[1] ?? null;
};

test('j35: the rig and the shell pin the same pankosmia_web', () => {
  const shell = pinIn('shell/src-tauri/Cargo.toml');
  const rig = pinIn('dev-env/rig/Cargo.toml');
  expect(shell, 'shell/src-tauri/Cargo.toml pins pankosmia_web exactly').toMatch(/^=\d+\.\d+\.\d+$/);
  expect(rig, `dev-env/rig/Cargo.toml must pin pankosmia_web = "${shell}", as the shell does`).toBe(shell);
});

// From any checkout or worktree, the journeys find on disk the repos the running rig lists (j3 Sync makes a
// file:// origin from them), whichever checkout started the rig.
test('j35: the journeys read the repos folder of the running rig', async () => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  expect(await listLocal()).toContain(SAMPLE_PROJECT);
  expect(existsSync(`${RIG_REPOS_DIR}/${SAMPLE_PROJECT}/metadata.json`), `${RIG_REPOS_DIR} holds the rig's ${SAMPLE_PROJECT}`).toBe(true);
});
