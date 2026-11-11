// Issue #44, slice 44a: in one run of the app nothing is read twice. Back to a screen already seen shows it at once,
// with no skeleton and no request for what it holds; a project whose resources are installed opens on its books
// without the resources screen; a decision or a Sync replaces what was kept, so the new progress shows after Back.
import { test, expect, type Page } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, UST_V90_INSTALL, deleteRepoIfPresent, placeProjectMissingUstV90, rigUp } from './helpers/rig';
import { USER, openProject } from './helpers/session';
import { fakeDoor43 } from './helpers/fakeDoor43';
import { placeTcProject } from './helpers/journal';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';

test.beforeEach(async ({ context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeTcProject(PROJECT);
  // Every screen title the app ever draws, in order, so a journey can say a screen never showed, not even for a frame.
  await context.addInitScript(() => {
    const w = window as unknown as { titles: string[] };
    w.titles = [];
    new MutationObserver(() => {
      const h1 = document.querySelector('h1')?.textContent ?? '';
      if (h1 && w.titles[w.titles.length - 1] !== h1) w.titles.push(h1);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
});

/** The app's reads of the project (the local server) and of Door43, from now on. */
const reads = (page: Page) => {
  const seen: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith('/api/') || url.host === 'qa.door43.org') seen.push(`${r.method()} ${url.host === 'qa.door43.org' ? 'door43' : ''}${url.pathname}${url.search}`);
  });
  return seen;
};
/** The reads made from `from` on that were made before it: what the app holds is never asked for again on the way back
 * (Door43's list may be, behind the kept one). Reads of what was never read yet are fine. A checkpoint is not a read:
 * leaving a project checkpoints it (#59). */
const repeated = (all: string[], from: number) =>
  all.slice(from).filter((r) => !r.startsWith('GET door43') && !r.startsWith('POST /api/tc/checkpoint/') && all.slice(0, from).includes(r));
/** Waits until the books screen shows every book and tool counted. */
const allCounted = (page: Page) =>
  expect.poll(async () => {
    const shown = await page.getByTestId('book-progress').allTextContents();
    return shown.length > 0 && !shown.includes('…');
  }).toBe(true);
const titles = (page: Page) => page.evaluate(() => (window as unknown as { titles: string[] }).titles);
const noSkeleton = async (page: Page) => expect(await page.locator('.bone').count()).toBe(0);

test('j44: a project whose resources are installed opens on its books; the resources screen never shows', async ({ page, context }) => {
  await openProject(page, context, 'sample_burrito');
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
  expect(await titles(page)).not.toContain('Getting resources');
});

test('j44: Back through the check, the list, the books and the projects shows each at once and reads nothing again', async ({ page, context }) => {
  const all = reads(page);
  await openProject(page, context, 'sample_burrito');
  // The books screen seen whole: every book and tool counted.
  await allCounted(page);
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  await page.getByTestId('check-row').first().click();
  await expect(page.getByTestId('check-screen')).toBeVisible();
  await page.waitForTimeout(500);
  const from = all.length;
  await page.getByRole('button', { name: 'Back' }).click();
  await noSkeleton(page);
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  await page.getByTestId('check-row').first().click();
  await noSkeleton(page);
  await expect(page.getByTestId('check-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await noSkeleton(page);
  await expect(page.getByTestId('book-progress').first()).not.toHaveText('…');
  await page.getByRole('button', { name: 'Back' }).click();
  await noSkeleton(page);
  await expect(page.getByRole('button', { name: /^sample_burrito/ })).toBeVisible();
  // Back to the projects may ask Door43 for its list again behind the kept one; the project itself is not read again.
  await page.waitForTimeout(500);
  expect(repeated(all, from)).toEqual([]);
});

test('j44: a second open of the project reads nothing of it again and shows no resources screen', async ({ page, context }) => {
  const all = reads(page);
  await openProject(page, context, 'sample_burrito');
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
  await allCounted(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForTimeout(500);
  const from = all.length;
  await page.getByRole('button', { name: /^sample_burrito/ }).click();
  await noSkeleton(page);
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
  await expect(page.getByTestId('book-progress').first()).not.toHaveText('…');
  await page.waitForTimeout(500);
  expect(repeated(all, from)).toEqual([]);
  expect((await titles(page)).filter((t) => t === 'Getting resources')).toEqual([]);
});

test('j44: a decision, then Back: the list and the book show the new progress', async ({ page, context }) => {
  await openProject(page, context, 'sample_burrito');
  const titusWords = page.getByRole('button', { name: /^Titus Words/ }).getByTestId('book-progress');
  await expect(titusWords).not.toHaveText('…');
  const before = Number(((await titusWords.textContent()) ?? '').split('/')[0]);
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await page.getByTestId('check-row').filter({ hasNotText: 'Checked' }).first().click();
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('progress')).toContainText(String(before + 1));
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(titusWords).toHaveText(new RegExp(`^${before + 1} /`));
});

test('j44: a book tapped while the books are still counting does not count it twice', async ({ page, context }) => {
  const all = reads(page);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  await page.waitForTimeout(1000);
  const decisionReads = all.filter((r) => r.includes('checking/translationWords/TIT.json') || r.includes('checking%2FtranslationWords%2FTIT.json'));
  expect(decisionReads).toHaveLength(1);
});

test('j44: a Sync reads the list again', async ({ page, context }) => {
  await page.route((url) => url.pathname.startsWith('/api/tc/sync/'), (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ synced: true, received: true, confirmed: true }) }),
  );
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  await page.waitForTimeout(500);
  const after = reads(page);
  await page.getByRole('button', { name: 'Sync' }).click();
  await expect.poll(() => after.some((r) => r.includes('TIT.json'))).toBe(true);
});

test('j44 review: Valid, then Back at once while the decision saves: the list shows it', async ({ page, context }) => {
  // A slow phone: the decision takes a while to be recorded.
  await page.route((url) => url.pathname.startsWith('/api/tc/decide/'), async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
  });
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  const progress = page.getByTestId('progress');
  await expect(progress).toBeVisible();
  const before = Number(((await progress.textContent()) ?? '').match(/\d+/)![0]);
  await page.getByTestId('check-row').filter({ hasNotText: 'Checked' }).first().click();
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(progress).toContainText(`${before + 1} of`, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: /^Titus Words/ }).getByTestId('book-progress')).toHaveText(new RegExp(`^${before + 1} /`));
});

test('j44 review: a resource another project installs reaches a project that was missing it', async ({ page, context }) => {
  test.setTimeout(240_000);
  const zip = 'https://git.door43.org/unfoldingWord/en_ust/sb/v90.zip';
  await deleteRepoIfPresent(UST_V90_INSTALL);
  await placeProjectMissingUstV90('qa.door43.org/checker1/proj_a');
  await placeProjectMissingUstV90('qa.door43.org/checker1/proj_b');
  await context.route(zip, (route) => route.abort('internetdisconnected'));
  await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: 'proj_a' }, { owner: USER.username, name: 'proj_b' }] });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // B: the download stops; the checker goes on without the UST.
  await page.getByRole('button', { name: /^proj_b/ }).click();
  await expect(page.getByText('Download stopped')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await page.getByTestId('check-row').first().click();
  await expect(page.getByTestId('check-screen')).toBeVisible();
  await expect(page.getByText(/isn't on this device/i).first()).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Back' }).click();
  // Online again: A installs the UST.
  await context.unroute(zip);
  await page.getByRole('button', { name: /^proj_a/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible({ timeout: 200_000 });
  await page.getByRole('button', { name: 'Back' }).click();
  // B again: the UST it pins is on the device now, and its check shows it.
  await page.getByRole('button', { name: /^proj_b/ }).click();
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await page.getByTestId('check-row').first().click();
  await expect(page.getByTestId('check-screen')).toBeVisible();
  await expect(page.getByText(/isn't on this device/i)).toHaveCount(0);
});

test('j44 review: a Door43 list that arrives while a project opens does not move the rows', async ({ page, context }) => {
  await placeTcProject('qa.door43.org/checker1/other_tc');
  const repos = [
    { owner: USER.username, name: 'sample_burrito' },
    { owner: USER.username, name: 'other_tc' },
  ];
  await fakeDoor43(context, { user: USER, repos });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /^sample_burrito/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
  // Back to the kept list. Door43's next answer waits, and so does the next open.
  let answer = () => {};
  const answered = new Promise<void>((r) => (answer = r));
  await page.route('https://qa.door43.org/api/v1/user/repos**', async (route) => {
    await answered;
    await route.fallback();
  });
  let go = () => {};
  const going = new Promise<void>((r) => (go = r));
  await page.route((u) => u.pathname === '/api/git/list-local-repos', async (route) => {
    await going;
    await route.fallback();
  });
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main.screen:not(.leaving *) .project-name')).toHaveText(['sample_burrito', 'other_tc']);
  await page.getByRole('button', { name: /^other_tc/ }).click();
  // While it opens, the checker taps Refresh (Door43 is asked once per start, #44 44b), and a teammate's new
  // project arrives first in Door43's list. The opening goes on: the other rows stay disabled.
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('button', { name: /^sample_burrito/ })).toBeDisabled();
  repos.unshift({ owner: USER.username, name: 'aaa_new' });
  answer();
  await page.waitForTimeout(500);
  await expect(page.locator('main.screen:not(.leaving *) .project-name')).toHaveText(['sample_burrito', 'other_tc']);
  go();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
});
