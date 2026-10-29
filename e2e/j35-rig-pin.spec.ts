// The journeys test the server the phone ships: the rig and the shell pin the same pankosmia_web.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

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
