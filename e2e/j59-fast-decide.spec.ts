// Issue #59: Valid and Invalid feel instant and lose nothing. A decision shows once the Rust tC4's store has it in the
// project's pending log, with nothing read again; the heavier work (the pack, the decision file, the commit) is the
// project's checkpoint, which runs when the checker leaves the project or opens it, before a Sync, and when the app
// goes to the background. Sync is at the top right of every screen of a project, and on each project's row.
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, checkpoint, readIngredient, rigUp } from './helpers/rig';
import { USER, openProject } from './helpers/session';
import { fakeDoor43 } from './helpers/fakeDoor43';
import { changesOf, placeTcProject } from './helpers/journal';

// Its own copy on the shared rig, so a sibling worktree's journeys never replace it under these.
const NAME = 'sample_j59';
const PROJECT = `qa.door43.org/checker1/${NAME}`;
type Decision = { contextId: { checkId: string }; status?: string; selections: unknown[] | false; nothingToSelect?: boolean };
type Change = { device: string; record: { check?: { key: { checkId: string } } } };

let seeded: Set<string>;
let requests: string[];
test.beforeEach(async ({ page }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeTcProject(PROJECT);
  seeded = new Set(((await changesOf(PROJECT)) as unknown as Change[]).map((c) => c.device));
  requests = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith('/api/')) requests.push(`${r.method()} ${decodeURIComponent(url.pathname + url.search)}`);
  });
});

/** The checks the phone's sealed packs hold. */
const sealedCheckIds = async (): Promise<string[]> =>
  ((await changesOf(PROJECT)) as unknown as Change[]).filter((c) => !seeded.has(c.device) && c.record.check).map((c) => c.record.check!.key.checkId);
const decisionFile = async () => JSON.parse(await readIngredient(PROJECT, 'checking/translationWords/TIT.json')) as { decisions: Decision[] };

/** Open Titus Words and its first check not decided yet. */
const openUndecided = async (page: Page, context: BrowserContext) => {
  await openProject(page, context, NAME);
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await page.getByTestId('check-row').filter({ hasNotText: 'Checked' }).first().click();
  await expect(page.getByTestId('check-screen')).toBeVisible();
};

test('j59: Valid shows from memory: nothing is read again, and the list and the books count it', async ({ page, context }) => {
  // The books are all counted first: their reads in the background are not the decision's.
  await openProject(page, context, NAME);
  await expect.poll(async () => {
    const shown = await page.getByTestId('book-progress').allTextContents();
    return shown.length > 0 && !shown.includes('…');
  }).toBe(true);
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await page.getByTestId('check-row').filter({ hasNotText: 'Checked' }).first().click();
  await page.getByRole('button', { name: 'Back' }).click();
  const before = Number(((await page.getByTestId('progress').textContent()) ?? '').match(/\d+/)![0]);
  await page.getByTestId('check-row').filter({ hasNotText: 'Checked' }).first().click();
  requests.length = 0;
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  // Only the decision went to the shell: no check list, decision file or project file was read for it.
  expect(requests.filter((r) => !r.startsWith('POST /api/tc/decide/'))).toEqual([]);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('progress')).toHaveText(new RegExp(`^${before + 1} of`));
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: /^Titus Words/ }).getByTestId('book-progress')).toHaveText(new RegExp(`^${before + 1} /`));
  expect(requests.filter((r) => r.includes('TIT.json') || r.includes('.tsv'))).toEqual([]);
});

test('j59: the decision waits in the pending log, and leaving the project seals it into a pack and the decision file', async ({ page, context }) => {
  await openUndecided(page, context);
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  expect(await sealedCheckIds()).toEqual([]);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${NAME}`) })).toBeVisible();
  await expect.poll(sealedCheckIds).toHaveLength(1);
  const [checkId] = await sealedCheckIds();
  // The pack is sealed first, then the decision file is written from it.
  await expect.poll(async () => (await decisionFile()).decisions.find((d) => d.contextId.checkId === checkId)?.status).toBe('valid');
});

test('j59: going to the background checkpoints the open project', async ({ page, context }) => {
  await openUndecided(page, context);
  await page.getByRole('button', { name: 'Invalid' }).click();
  await expect(page.getByTestId('decided')).toHaveText('Invalid');
  expect(await sealedCheckIds()).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await expect.poll(() => requests.some((r) => r === `POST /api/tc/checkpoint/${PROJECT}`)).toBe(true);
  await expect.poll(sealedCheckIds).toHaveLength(1);
});

test('j59: a decision left pending when the app closed is sealed when the project opens again', async ({ page, context }) => {
  await openUndecided(page, context);
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  // The app closes at once, before any checkpoint (the page's own closing would ask for one).
  await page.route('**/api/tc/checkpoint/**', (route) => route.abort());
  await page.reload();
  expect(await sealedCheckIds()).toEqual([]);
  await page.unroute('**/api/tc/checkpoint/**');
  await openProject(page, context, NAME);
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await expect(page.getByTestId('progress')).toBeVisible();
  const [checkId] = await sealedCheckIds();
  expect((await decisionFile()).decisions.find((d) => d.contextId.checkId === checkId)).toMatchObject({ status: 'valid' });
  // The list counts what the decision file says.
  const [decided] = ((await page.getByTestId('progress').textContent()) ?? '').match(/\d+/g)!.map(Number);
  expect(decided).toBe((await decisionFile()).decisions.filter((d) => d.selections !== false || d.nothingToSelect || d.status === 'invalid').length);
});

/** True when `el` sits at the top right of the page: in the top bar's band, at its right end. */
const atTopRight = async (page: Page, name: RegExp | string) => {
  const box = (await page.getByRole('banner').getByRole('button', { name, exact: typeof name === 'string' }).boundingBox())!;
  const width = page.viewportSize()!.width;
  return box.y < 120 && box.x + box.width > width - 40;
};

test('j59: Sync is at the top right of the books, the list and the check', async ({ page, context }) => {
  await openProject(page, context, NAME);
  await expect(page.getByRole('button', { name: /^Titus Words/ })).toBeVisible();
  expect(await atTopRight(page, 'Sync')).toBe(true);
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  expect(await atTopRight(page, 'Sync')).toBe(true);
  await page.getByTestId('check-row').first().click();
  await expect(page.getByTestId('check-screen')).toBeVisible();
  expect(await atTopRight(page, 'Sync')).toBe(true);
});

test('j59: a Sync on the check screen syncs after the decision on its way, and keeps the checker on the check', async ({ page, context }) => {
  await openUndecided(page, context);
  const calls: string[] = [];
  await page.route('**/api/tc/decide/**', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
    calls.push('decided');
  });
  await page.route('**/api/tc/sync/**', async (route) => {
    calls.push('sync');
    // As the shell's sync ends: the project is closed, which checkpoints it.
    await checkpoint(PROJECT);
    return route.fulfill({ json: { synced: true, received: false, confirmed: true } });
  });
  const header = await page.getByTestId('check-header').textContent();
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await page.getByRole('banner').getByRole('button', { name: 'Sync', exact: true }).click();
  await expect.poll(() => calls).toEqual(['decided', 'sync']);
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sync', exact: true })).toBeEnabled();
  await expect(page.getByTestId('check-header')).toHaveText(header!);
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('j59 review: Valid tapped while a Sync runs stays shown, and the list counts it', async ({ page, context }) => {
  await openProject(page, context, NAME);
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  const before = Number(((await page.getByTestId('progress').textContent()) ?? '').match(/\d+/)![0]);
  await page.getByTestId('check-row').filter({ hasNotText: 'Checked' }).first().click();
  await expect(page.getByTestId('check-screen')).toBeVisible();
  // As the shell's sync: it closes the project (its checkpoint), then talks to Door43 for a while. A decision tapped
  // meanwhile waits for the sync in the shell, so it reaches the pending log after that checkpoint.
  let synced!: () => void;
  const syncDone = new Promise<void>((r) => (synced = r));
  let closed!: () => void;
  const closedNow = new Promise<void>((r) => (closed = r));
  await page.route('**/api/tc/sync/**', async (route) => {
    await checkpoint(PROJECT);
    closed();
    await new Promise((r) => setTimeout(r, 1000));
    await route.fulfill({ json: { synced: true, received: false, confirmed: true } });
    synced();
  });
  await page.route('**/api/tc/decide/**', async (route) => {
    await syncDone;
    await route.continue();
  });
  await page.getByRole('banner').getByRole('button', { name: 'Sync', exact: true }).click();
  await closedNow;
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sync', exact: true })).toBeEnabled();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('progress')).toHaveText(new RegExp(`^${before + 1} of`));
});

test("j59: a project on this device has Sync on its row, to the right of its name, and syncs without opening; one that is not has none", async ({ page, context }) => {
  await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: NAME }, { owner: USER.username, name: 'not_on_this_phone' }] });
  let synced = '';
  await page.route('**/api/tc/sync/**', (route) => {
    synced = decodeURIComponent(new URL(route.request().url()).pathname);
    return route.fulfill({ json: { synced: true, received: false, confirmed: true } });
  });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const sync = page.getByRole('button', { name: `Sync ${NAME}` });
  await expect(sync).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync not_on_this_phone' })).toHaveCount(0);
  const name = (await page.locator('.project-name', { hasText: new RegExp(`^${NAME}$`) }).boundingBox())!;
  const button = (await sync.boundingBox())!;
  expect(button.x).toBeGreaterThan(name.x + name.width);
  await sync.click();
  await expect.poll(() => synced).toBe(`/api/tc/sync/${PROJECT}`);
  await expect(sync).toBeEnabled();
  await expect(sync).toHaveText('Sync');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: new RegExp(`^${NAME}`) })).toBeVisible();
});
