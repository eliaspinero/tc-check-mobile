// Issue #58: Android's Back (the button or the gesture) does what the screen's own Back does. Tauri's Android shell
// sends Back to the app plugin's `back-button` listeners when there are any, and otherwise goes back in the WebView's
// history or leaves the app. The fake Tauri bridge stands for the shell: pressBack sends the event, and no listener
// means Back leaves the app (the client's first screen is its only history entry, #58).
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { NEEDS_RIG, PLAIN_REPO, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';
import { backListeners, fakeTauri, pressBack } from './helpers/fakeTauri';

// Its own copy of the sample, so journeys of other worktrees on the shared rig do not replace it underneath.
const NAME = 'back_burrito';
const PROJECT = `qa.door43.org/checker1/${NAME}`;

const projects = (page: Page) => page.getByRole('heading', { name: 'Your projects' });
const books = (page: Page) => page.getByRole('heading', { name: 'Choose a book' });
const list = (page: Page) => page.getByTestId('progress');

/** Back on the projects screen leaves the app: the client listens for no Back, so the shell's default runs. */
const backLeavesTheApp = async (page: Page) => {
  await expect.poll(() => backListeners(page)).toBe(0);
};

/** Open the sample's Titus Words list. */
const openTitusWords = async (page: Page, context: BrowserContext) => {
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, NAME);
  await page.getByRole('button', { name: 'Titus Words' }).click();
};

test.beforeEach(async ({ context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await fakeTauri(context);
});

test('j58: Back walks back check → list → books → projects, then leaves the app', async ({ page, context }) => {
  await openTitusWords(page, context);
  const row = page.getByTestId('check-row').nth(1);
  await row.click();
  await expect(page.getByTestId('check-screen')).toBeVisible();

  await pressBack(page);
  await expect(page.getByTestId('check-screen')).toHaveCount(0);
  await expect(list(page)).toBeVisible();
  // As the top bar's Back: the list comes back at the chapter of the check the checker was on.
  await expect(page.getByRole('button', { name: 'Titus 1' })).toBeVisible();
  await expect(row).toBeVisible();

  await pressBack(page);
  await expect(books(page)).toBeVisible();
  await pressBack(page);
  await expect(projects(page)).toBeVisible();
  await backLeavesTheApp(page);
});

test('j58: an open chapter grid closes first; the screen stays', async ({ page, context }) => {
  await openTitusWords(page, context);
  await page.getByRole('button', { name: /^Titus \d+$/ }).click();
  const grid = page.getByRole('dialog', { name: 'Chapters' });
  await expect(grid).toBeVisible();

  await pressBack(page);
  await expect(grid).toBeHidden();
  await expect(list(page)).toBeVisible();

  await pressBack(page);
  await expect(books(page)).toBeVisible();
});

test("j58: after the top bar's Back to the projects, Back leaves the app", async ({ page, context }) => {
  await openTitusWords(page, context);
  await expect(list(page)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(books(page)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(projects(page)).toBeVisible();
  await backLeavesTheApp(page);
});

test("j58: on a project's message (not a project), Back goes back to the projects", async ({ page, context }) => {
  await placeRepo(PLAIN_REPO, 'qa.door43.org/checker1/plain_repo');
  await openProject(page, context, 'plain_repo');
  await expect(page.getByRole('heading', { name: 'Not a project' })).toBeVisible();
  await pressBack(page);
  await expect(projects(page)).toBeVisible();
  await backLeavesTheApp(page);
});
