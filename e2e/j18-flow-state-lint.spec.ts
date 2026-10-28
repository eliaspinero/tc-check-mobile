// Issue #18: lint rejects a screen that holds a flow's loading, busy or error in its own flag, next to
// the flow's other flags. Ways it can fail: a flag name it misses (error, busy, syncing, loading,
// restoring), a renamed flag still reset in a finally, App.tsx or a screen .ts file left out, a false
// alarm on an interface toggle (picking, open, armed) or on a finally that resets nothing, or a message
// that does not say what to use. No browser: ESLint runs on source text.
import { test, expect } from '@playwright/test';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });
const MESSAGE = 'Hold a flow in one closed state (Load<T> or Run<R> from screens/load.ts), not a separate loading, busy or error flag';
const header = "import { useState } from 'react';\n";
const flowErrors = async (code: string, filePath = 'client/src/screens/LintProbe.tsx'): Promise<string[]> => {
  const [result] = await eslint.lintText(header + code, { filePath });
  return result.messages.filter((m) => m.message.includes('closed state')).map((m) => m.message);
};

for (const name of ['error', 'busy', 'syncing', 'loading', 'restoring']) {
  test(`j18: lint rejects a separate ${name} useState in a screen, naming the closed state to use`, async () => {
    expect(await flowErrors(`export const f = () => { const [${name}, set] = useState(null); return [${name}, set]; };`)).toEqual([MESSAGE]);
  });
}

test('j18: lint rejects a separate flow flag in App.tsx too', async () => {
  expect(await flowErrors('export const f = () => { const [restoring, set] = useState(true); return [restoring, set]; };', 'client/src/App.tsx')).toEqual([MESSAGE]);
});

test('j18: lint rejects a flag of any name reset in a finally, in a try or on a promise', async () => {
  const declare = 'declare const setPending: (v: boolean) => void; declare const go: () => Promise<void>;\n';
  expect(await flowErrors(`${declare}export const f = async () => { try { await go(); } finally { setPending(false); } };`)).toEqual([MESSAGE]);
  expect(await flowErrors(`${declare}export const g = () => go().finally(() => setPending(false));`)).toEqual([MESSAGE]);
});

test('j18: lint covers a screen .ts file, as a hook', async () => {
  expect(await flowErrors('export const useF = () => { const [busy, set] = useState(false); return [busy, set]; };', 'client/src/screens/useProbe.ts')).toEqual([MESSAGE]);
});

test('j18: lint leaves a finally that resets no flag alone', async () => {
  const declare = 'declare const onCloning: (k: string, v: boolean) => void; declare const setScreen: (s: object) => void; declare const go: () => Promise<void>;\n';
  expect(await flowErrors(`${declare}export const f = async () => { try { await go(); } finally { onCloning('a/b', false); } };`)).toEqual([]);
  expect(await flowErrors(`${declare}export const g = () => go().finally(() => setScreen({ name: 'projects' }));`)).toEqual([]);
});

test('j18: lint leaves interface toggles alone', async () => {
  for (const name of ['picking', 'open', 'armed', 'chapter']) {
    expect(await flowErrors(`export const f = () => { const [${name}, set] = useState(false); return [${name}, set]; };`)).toEqual([]);
  }
});
