// Issue #44, slice 44b: what the phone has read stays across an app restart (a reload here, with the fake Tauri
// shell keeping what the real one keeps in its data folder). The checker opens straight into their projects with
// their username, without waiting for Door43; Door43's list is asked once per start and on Refresh; one checker's
// kept list never shows to another; the books' progress shows at once; a damaged kept result is only read again.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, rigUp } from './helpers/rig';
import { USER } from './helpers/session';
import { fakeDoor43, QA_SERVER, type FakeRepo } from './helpers/fakeDoor43';
import { fakeTauri } from './helpers/fakeTauri';
import { placeTcProject } from './helpers/journal';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';
const REPOS: FakeRepo[] = [
  { owner: USER.username, name: 'sample_burrito' },
  // On Door43 only: listed by Door43, never on this device.
  { owner: USER.username, name: 'door43_only' },
];

test.beforeEach(async () => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeTcProject(PROJECT);
});

const signIn = async (page: Page, user = USER) => {
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(user.username);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};
const row = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) });
/** Door43 stops answering: every request to it waits for ever, as on a phone whose data is very slow. */
const door43Hangs = async (context: BrowserContext) => {
  await context.unroute(`${QA_SERVER}/api/v1/**`);
  await context.route(`${QA_SERVER}/**`, () => undefined);
};
/** How many times the app asked Door43 for the checker's repositories. */
const listCalls = (calls: Array<{ method: string; url: string }>) => calls.filter((c) => c.method === 'GET' && new URL(c.url).pathname === '/api/v1/user/repos').length;

test('j44: reopened with a kept token and a Door43 that never answers, the projects show with the kept username', async ({ page, context }) => {
  await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: REPOS });
  await signIn(page);
  await expect(row(page, 'door43_only')).toBeVisible();

  await door43Hangs(context);
  await page.reload();
  // The kept list, with the project only Door43 knows, and the kept username: nothing waited for Door43.
  await expect(row(page, 'door43_only')).toBeVisible({ timeout: 5000 });
  await expect(row(page, 'sample_burrito')).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(USER.username);
  await expect(page.getByLabel('Password')).toHaveCount(0);
});

test('j44: a kept token Door43 refuses (401) signs the checker out behind the projects', async ({ page, context }) => {
  const tauri = await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: REPOS });
  await signIn(page);
  await expect(row(page, 'sample_burrito')).toBeVisible();

  // A new Door43 that knows none of the tokens: the kept one is refused, as when the checker revokes it on Door43.
  await context.unroute(`${QA_SERVER}/api/v1/**`);
  await fakeDoor43(context, { user: USER, repos: REPOS });
  await page.reload();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect.poll(() => tauri.token()).toBeNull();
});

test('j44: Door43 is asked for the list once per start; Back does not ask again, Refresh does', async ({ page, context }) => {
  await fakeTauri(context);
  const door43 = await fakeDoor43(context, { user: USER, repos: REPOS });
  await signIn(page);
  await expect(row(page, 'door43_only')).toBeVisible();
  await expect.poll(() => listCalls(door43.calls)).toBe(1);

  await row(page, 'sample_burrito').click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(row(page, 'door43_only')).toBeVisible();
  await page.waitForTimeout(500);
  expect(listCalls(door43.calls)).toBe(1);

  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(() => listCalls(door43.calls)).toBe(2);
  await expect(row(page, 'door43_only')).toBeVisible();

  await page.reload();
  await expect(row(page, 'door43_only')).toBeVisible();
  await expect.poll(() => listCalls(door43.calls)).toBe(3);
});

test('j44: one checker’s kept list never shows to another checker who signs in on the same phone', async ({ page, context }) => {
  await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: REPOS });
  await signIn(page);
  await expect(row(page, 'door43_only')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page.getByLabel('Password')).toBeVisible();

  // Another checker, whose list never comes: only the projects on this device may show.
  const other = { username: 'checker2', password: 'pass-for-checker2' };
  await context.unroute(`${QA_SERVER}/api/v1/**`);
  await fakeDoor43(context, { user: other, repos: [] });
  await context.route(`${QA_SERVER}/api/v1/user/repos**`, () => undefined);
  await page.getByLabel('Username or email').fill(other.username);
  await page.getByLabel('Password').fill(other.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('banner')).toContainText(other.username);
  await expect(row(page, 'sample_burrito')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(row(page, 'door43_only')).toHaveCount(0);
});

test('j44: with nothing kept, the projects on this device show at once while Door43’s list loads', async ({ page, context }) => {
  await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: REPOS });
  await context.route(`${QA_SERVER}/api/v1/user/repos**`, () => undefined);
  await signIn(page);
  await expect(row(page, 'sample_burrito')).toBeVisible();
  // The skeleton stays for what Door43 has not said yet.
  await expect(page.locator('.bone').first()).toBeVisible();
});

test('j44: the books’ progress survives a restart and shows at once, before the books are counted again', async ({ page, context }) => {
  await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: REPOS });
  await signIn(page);
  await row(page, 'sample_burrito').click();
  await expect.poll(async () => {
    const shown = await page.getByTestId('book-progress').allTextContents();
    return shown.length > 0 && !shown.includes('…');
  }).toBe(true);
  // Each book and tool with its count, as a screen reader hears it (the books' order is not the point here).
  const progress = async () => (await page.locator('button.tool').evaluateAll((all) => all.map((b) => b.getAttribute('aria-label')))).sort();
  const counted = await progress();

  // After the restart the check lists take long to read: the books still show what was counted last.
  await context.route('**/api/burrito/ingredient/raw/**', async (route) => {
    if (/\.tsv/i.test(decodeURIComponent(route.request().url()))) await new Promise((r) => setTimeout(r, 3000));
    await route.fallback();
  });
  await page.reload();
  await row(page, 'sample_burrito').click();
  await expect(page.getByTestId('book-progress').first()).toBeVisible();
  expect(await progress()).toEqual(counted);
});

test('j44: a damaged kept result is only read again', async ({ page, context }) => {
  const tauri = await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: REPOS });
  await signIn(page);
  await row(page, 'sample_burrito').click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
  await expect.poll(() => tauri.kept.size).toBeGreaterThan(0);

  for (const name of tauri.kept.keys()) tauri.kept.set(name, '{"broken');
  await page.reload();
  await expect(row(page, 'door43_only')).toBeVisible();
  await row(page, 'sample_burrito').click();
  await expect(page.getByTestId('book-progress').first()).not.toHaveText('…');
});

test('j44 review: a project opened before every format answer lands still shows after a restart with no Door43', async ({ page, context }) => {
  await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: REPOS });
  // Door43 is slow to say whether door43_only is in the new format; the checker opens their project meanwhile.
  await context.route(`${QA_SERVER}/api/v1/repos/${USER.username}/door43_only/contents/**`, () => undefined);
  await signIn(page);
  await row(page, 'sample_burrito').click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();

  await door43Hangs(context);
  await page.reload();
  await expect(row(page, 'sample_burrito')).toBeVisible({ timeout: 5000 });
});

test('j44 review: a project moved to the new format on a computer moves out of Other projects at the next start', async ({ page, context }) => {
  await fakeTauri(context);
  const moved: FakeRepo = { ...REPOS[1], format: 'other' };
  await fakeDoor43(context, { user: USER, repos: [REPOS[0], moved] });
  await signIn(page);
  await expect(page.getByRole('button', { name: /Other projects/ })).toBeVisible();
  await expect(row(page, 'door43_only')).toHaveCount(0);

  // Its team moves it to the new format; the checker restarts the app, with no Refresh.
  moved.format = 'tc';
  await page.reload();
  await expect(row(page, 'door43_only')).toBeVisible();
});

test('j44 review: a late refusal of the old token does not sign out a checker who signed in again', async ({ page, context }) => {
  const tauri = await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: REPOS });
  await signIn(page);
  await expect(row(page, 'sample_burrito')).toBeVisible();
  // A second sign-in, so the kept token is not the one the next fake Door43 hands out first.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(row(page, 'sample_burrito')).toBeVisible();

  // The checker signed in on another device, which revoked this one's token. On slow data, Door43's answer
  // about the kept token is held; the list's refusal (asked at start) signs them out, and they sign in again.
  await context.unroute(`${QA_SERVER}/api/v1/**`);
  await fakeDoor43(context, { user: USER, repos: REPOS });
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  let first = true;
  await context.route(`${QA_SERVER}/api/v1/user`, async (route) => {
    if (first) {
      first = false;
      await held;
    }
    await route.fallback();
  });
  await page.reload();
  await expect(page.getByLabel('Password')).toBeVisible();
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(row(page, 'sample_burrito')).toBeVisible();
  const token = tauri.token();
  release();
  await page.waitForTimeout(1000);
  expect(tauri.token()).toBe(token);
  await expect(page.getByLabel('Password')).toHaveCount(0);
});
