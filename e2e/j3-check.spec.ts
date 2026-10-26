import { test, expect } from '@playwright/test';
import { NEEDS_RIG, SAMPLE_PROJECT, placeRepo, readIngredient, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';

type Decision = { selections: unknown; nothingToSelect?: boolean; invalidated?: boolean; status?: string };
/** Decided as tC4 counts it (derive.ts isDecided): not invalidated, and selections, nothing-to-select or an Invalid status. */
const decidedIn = async (tool: string, book: string): Promise<number> => {
  const file = JSON.parse(await readIngredient(PROJECT, `checking/${tool}/${book}.json`)) as { decisions: Decision[] };
  return file.decisions.filter((d) => d.invalidated !== true && (d.selections !== false || d.nothingToSelect === true || d.status === 'invalid')).length;
};

test('j3: TIT tW lists its checks with progress that counts the stored decisions', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'TIT translationWords' }).click();
  await expect(page.getByRole('heading', { name: 'TIT · translationWords' })).toBeVisible();
  const progress = page.getByTestId('progress');
  await expect(progress).toHaveText(/^\d+ of \d+ checked$/);
  const [decided, total] = ((await progress.textContent()) ?? '').match(/\d+/g)!.map(Number);
  expect(decided).toBe(await decidedIn('translationWords', 'TIT'));
  expect(total).toBeGreaterThan(decided);
  await expect(page.getByTestId('check-row')).toHaveCount(total);
});

test('j3: TIT tN lists its checks too', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'TIT translationNotes' }).click();
  await expect(page.getByRole('heading', { name: 'TIT · translationNotes' })).toBeVisible();
  const [decided, total] = ((await page.getByTestId('progress').textContent()) ?? '').match(/\d+/g)!.map(Number);
  expect(decided).toBe(await decidedIn('translationNotes', 'TIT'));
  expect(total).toBeGreaterThan(0);
});
