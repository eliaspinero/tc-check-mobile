// Issue #44, slice 44a: in one run of the app nothing is read twice. Back to a screen already seen shows it at once,
// with no skeleton and no request for what it holds; a project whose resources are installed opens on its books
// without the resources screen; a decision or a Sync replaces what was kept, so the new progress shows after Back.
import { test, expect, type Page } from '@playwright/test';
import { NEEDS_RIG, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';
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
 * (Door43's list may be, behind the kept one). Reads of what was never read yet are fine. */
const repeated = (all: string[], from: number) => all.slice(from).filter((r) => !r.startsWith('GET door43') && all.slice(0, from).includes(r));
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
