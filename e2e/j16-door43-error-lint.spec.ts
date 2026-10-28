// Issue #16: lint rejects a screen showing a Door43 error's .message, in every shape a screen
// can catch it, and leaves other errors alone. No browser: ESLint runs on source text.
import { test, expect } from '@playwright/test';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });
const header = `import { Door43ApiError } from '../door43/door43Api';
declare const api: { listRepos(): Promise<string[]>; signIn(): Promise<string> };
declare const source: { clone(): Promise<string> };
declare const setError: (s: string) => void;
`;
const door43Errors = async (code: string): Promise<string[]> => {
  const [result] = await eslint.lintText(header + code, { filePath: 'client/src/screens/lintProbe.ts' });
  return result.messages.filter((m) => m.message.includes('door43ErrorText')).map((m) => m.message);
};

const rejected: Record<string, string> = {
  'the rejection handler of then': 'api.listRepos().then(() => undefined, (e: Error) => setError(e.message));',
  'catch on the api call': 'api.listRepos().catch((e: Error) => setError(e.message));',
  'catch after then': 'api.listRepos().then(() => undefined).catch((e: Error) => setError(e.message));',
  'catch on an async block that awaits api': '(async () => { await api.listRepos(); })().catch((e: Error) => setError(e.message));',
  'the catch of a try that awaits api': 'export const f = async () => { try { await api.signIn(); } catch (err) { setError((err as Error).message); } };',
  'a cast to Door43ApiError': 'export const g = (e: unknown) => setError((e as Door43ApiError).message);',
};

for (const [shape, code] of Object.entries(rejected)) {
  test(`j16: lint rejects a Door43 error's .message in ${shape}, naming door43ErrorText`, async () => {
    expect(await door43Errors(code)).toEqual(['Show a Door43 error with door43ErrorText(e) from screens/door43Error.ts, not its .message']);
  });
}

test('j16: lint leaves the .message of an error that is not from Door43 alone', async () => {
  expect(await door43Errors('export const h = async () => { try { await source.clone(); } catch (e) { setError((e as Error).message); } };')).toEqual([]);
  expect(await door43Errors('source.clone().catch((e: Error) => setError(e.message));')).toEqual([]);
});
