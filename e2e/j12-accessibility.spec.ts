import { test, expect, type Page } from '@playwright/test';
import { NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';

const openTitusWords = async (page: Page, context: Parameters<typeof openProject>[1]) => {
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await expect(page.getByRole('heading', { name: 'Titus 1' })).toBeVisible();
};

/** Opens the grid from the title, checks focus inside it, closes it with `close`, and checks focus is back on the title. */
const gridKeepsFocus = async (page: Page, close: 'Escape' | 'Close') => {
  const title = page.getByRole('button', { name: /^Titus \d+/ });
  await title.click();
  const grid = page.getByRole('dialog', { name: 'Chapters' });
  await expect(grid.locator('[aria-current="true"]')).toBeFocused();
  if (close === 'Escape') await page.keyboard.press('Escape');
  else await grid.getByRole('button', { name: 'Close' }).click();
  await expect(grid).toHaveCount(0);
  await expect(title).toBeFocused();
};

test('j11: the chapter grid takes focus on the current chapter and gives it back to the title', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitusWords(page, context);
  await gridKeepsFocus(page, 'Escape');
  await gridKeepsFocus(page, 'Close');
  // The check screen opens the same grid from its own title.
  await page.getByTestId('check-row').first().click();
  await gridKeepsFocus(page, 'Escape');
  await gridKeepsFocus(page, 'Close');
});

test('j11: Tab stays inside the chapter grid while it is open', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitusWords(page, context);
  await page.getByRole('button', { name: /^Titus \d+/ }).click();
  const grid = page.getByRole('dialog', { name: 'Chapters' });
  const enabled = grid.getByRole('button').and(page.locator(':enabled'));
  const first = enabled.first();
  const last = enabled.last();
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
});

test('j11: each book button says its book, tool and progress to a screen reader', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  const words = page.getByRole('button', { name: /^Titus Words/ });
  await expect(words.getByTestId('book-progress')).toHaveText(/^\d+ \/ \d+$/, { timeout: 30_000 });
  const [decided, total] = ((await words.getByTestId('book-progress').textContent()) ?? '').match(/\d+/g)!;
  await expect(words).toHaveAccessibleName(`Titus Words, ${decided} of ${total}`);
});
