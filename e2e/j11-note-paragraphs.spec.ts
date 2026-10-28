import { test, expect } from '@playwright/test';
import { NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';

// es-419 tN v66, TIT 3:7 uh9q: a note whose paragraphs arrive as a literal "\n\n" (#12).
test('j11: a tN note with a literal \\n shows its paragraphs apart, as tC4 does', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Notes' }).click();
  await page.getByRole('button', { name: 'Titus 1' }).click();
  await page.getByRole('dialog', { name: 'Chapters' }).getByRole('button', { name: /^Chapter 3/ }).click();
  const verse = page.getByTestId('verse').filter({ has: page.locator('summary', { hasText: /^3:7 / }) });
  await verse.locator('summary').click();
  await verse.getByTestId('check-row').filter({ hasText: /^so that$/ }).click();
  await expect(page.getByTestId('check-title')).toHaveText('Titus 3:7');
  await page.getByTestId('help').getByRole('button').click();
  const paragraphs = page.getByTestId('help-body').locator('p');
  await expect(paragraphs).toHaveCount(3);
  await expect(page.getByTestId('help-refs')).toHaveText('grammar-connect-logic-goal');
  await expect(paragraphs.nth(1)).toHaveText(/^Es importante que la frase/);
  await expect(page.getByTestId('help-body')).not.toContainText('\\n');
});
