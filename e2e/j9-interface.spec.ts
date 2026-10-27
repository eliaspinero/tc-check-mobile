import { test, expect, type Page } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { USER, openProject } from './helpers/session';
import { fakeDoor43 } from './helpers/fakeDoor43';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';
const counts = (text: string | null) => (text ?? '').match(/\d+/g)!.map(Number);

const openTitusWords = async (page: Page, context: Parameters<typeof openProject>[1]) => {
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await expect(page.getByRole('heading', { name: 'Titus 1' })).toBeVisible();
};

test('j9: every screen has a top bar with Back, and no Back button at the bottom', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  for (const screen of ['books', 'list', 'check']) {
    if (screen === 'list') await page.getByRole('button', { name: 'Titus Words' }).click();
    if (screen === 'check') await page.getByTestId('check-row').first().click();
    const back = page.getByRole('banner').getByRole('button', { name: 'Back' });
    await expect(back).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(1);
  }
  for (const heading of ['Titus 1', 'Choose a book', 'Your projects']) {
    await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(page.getByRole('banner').getByRole('button', { name: 'Back' })).toHaveCount(0);
});

test('j9: the list shows one chapter as verse accordions with progress, and coming back from a check opens its verse', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitusWords(page, context);
  const verses = page.getByTestId('verse');
  await expect(verses.first()).toBeVisible();
  // Every verse summary is in chapter 1, with its own progress.
  for (const text of await verses.locator('summary').allTextContents()) expect(text).toMatch(/^1:\d+ · \d+ of \d+/);
  // The chapter line adds up the verses.
  let decided = 0;
  let total = 0;
  for (const text of await verses.locator('summary').allTextContents()) {
    const [, , d, t] = counts(text);
    decided += d;
    total += t;
  }
  expect(counts(await page.getByTestId('chapter-progress').textContent())).toEqual([1, decided, total]);
  // Only the first verse is open; the others hide their checks.
  await expect(verses.nth(1)).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  // Open verse 1:3, its second check, and come back: 1:3 is open.
  const third = verses.filter({ has: page.locator('summary', { hasText: /^1:3 / }) });
  await third.locator('summary').click();
  await third.getByTestId('check-row').first().click();
  await expect(page.getByTestId('check-title')).toHaveText('Titus 1:3');
  await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
  await expect(third).toHaveAttribute('open', '');
});

test('j9: the chapter grid switches the list chapter, and on the check screen goes to the chapter’s first check', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitusWords(page, context);
  await page.getByRole('button', { name: 'Titus 1' }).click();
  const grid = page.getByRole('dialog', { name: 'Chapters' });
  await expect(grid.getByRole('button', { name: /^Chapter \d+/ })).toHaveCount(3);
  await grid.getByRole('button', { name: /^Chapter 2/ }).click();
  await expect(grid).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Titus 2' })).toBeVisible();
  for (const text of await page.getByTestId('verse').locator('summary').allTextContents()) expect(text).toMatch(/^2:/);

  await page.getByTestId('check-row').first().click();
  await page.getByRole('button', { name: /^Titus 2:/ }).click();
  await page.getByRole('dialog', { name: 'Chapters' }).getByRole('button', { name: /^Chapter 3/ }).click();
  await expect(page.getByTestId('check-title')).toHaveText(/^Titus 3:\d+$/);
  // The first check of chapter 3: Previous goes back into chapter 2.
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByTestId('check-title')).toHaveText(/^Titus 2:\d+$/);
});

test('j9: Previous and Next move between checks across chapters and stop at both ends', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitusWords(page, context);
  await page.getByTestId('check-row').first().click();
  const at = async () => counts(await page.getByTestId('check-header').textContent());
  const [first, total] = await at();
  expect(first).toBe(1);
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('check-header')).toHaveText(new RegExp(` 2 / ${total}$`));
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByTestId('check-header')).toHaveText(new RegExp(` 1 / ${total}$`));
  // The last check of the book: Next is disabled.
  await page.getByRole('button', { name: 'Titus 1:1' }).click();
  await page.getByRole('dialog', { name: 'Chapters' }).getByRole('button', { name: /^Chapter 3/ }).click();
  while (!(await page.getByRole('button', { name: 'Next' }).isDisabled())) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('check-header')).toHaveText(new RegExp(` ${total} / ${total}$`));
});

test('j9: the help opens and closes with its button, and tW and tN helps render markdown', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitusWords(page, context);
  await page.getByTestId('check-row').filter({ hasText: /^god/ }).first().click();
  const toggle = page.getByRole('button', { name: /Dios/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('help-body').locator('h3, h4')).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const body = page.getByTestId('help-body');
  await expect(body.locator('h3, h4').first()).toBeVisible();
  await expect(body.locator('strong, em, li').first()).toBeVisible();
  for (const raw of ['**', '##', '[[']) await expect(body).not.toContainText(raw);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
  await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Titus Notes' }).click();
  await page.getByTestId('check-row').first().click();
  await page.getByTestId('help').getByRole('button').click();
  await expect(page.getByTestId('help-body')).not.toContainText('**');
  await expect(page.getByTestId('target')).toContainText('Your translation');
});

test('j9: the book picker shows book names, Words and Notes, and each book’s progress', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await expect(page.getByText('Titus', { exact: true })).toBeVisible();
  await expect(page.getByText('TIT', { exact: true })).toHaveCount(0);
  const words = page.getByRole('button', { name: 'Titus Words' });
  await expect(words).toContainText('Words');
  await expect(words.getByTestId('book-progress')).toHaveText(/^\d+ \/ \d+$/, { timeout: 30_000 });
  const [decided, total] = counts(await words.getByTestId('book-progress').textContent());
  await words.click();
  expect(counts(await page.getByTestId('progress').textContent())).toEqual([decided, total]);
});

test('j9: sign out takes a second tap, then shows the sign-in form', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: 'sample_burrito' }] });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  await page.getByRole('button', { name: 'Tap again to sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Door43' })).toBeVisible();
});

test.describe('on a phone in Spanish', () => {
  test.use({ locale: 'es-419' });
  test('j9: the screens are in Spanish', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await placeRepo(SAMPLE_PROJECT, PROJECT);
    await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: 'sample_burrito' }] });
    await page.goto(CLIENT_URL);
    await expect(page.getByRole('heading', { name: 'Entra a Door43' })).toBeVisible();
    await page.getByLabel('Usuario o correo').fill(USER.username);
    await page.getByLabel('Contraseña').fill(USER.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Tus proyectos' })).toBeVisible();
    await page.getByRole('button', { name: /^sample_burrito/ }).click();
    await expect(page.getByRole('heading', { name: 'Elige un libro' })).toBeVisible();
    await page.getByRole('button', { name: 'Tito Palabras' }).click();
    await expect(page.getByRole('heading', { name: 'Tito 1' })).toBeVisible();
    await expect(page.getByTestId('chapter-progress')).toHaveText(/^Capítulo 1: \d+ de \d+ revisados$/);
    await page.getByTestId('check-row').first().click();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeVisible();
    await expect(page.getByTestId('target')).toContainText('Tu traducción');
    await expect(page.getByRole('banner').getByRole('button', { name: 'Atrás' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });
});
