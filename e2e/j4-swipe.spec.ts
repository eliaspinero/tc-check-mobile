import { test, expect, type Page } from '@playwright/test';
import { NEEDS_RIG, SAMPLE_PROJECT, placeRepo, readIngredient, rigUp, writeIngredient } from './helpers/rig';
import { openProject } from './helpers/session';

const swipe = async (page: Page, direction: 'left' | 'right') => {
  const box = (await page.getByTestId('check-screen').boundingBox())!;
  const y = box.y + box.height / 2;
  const [from, to] = direction === 'left' ? [box.x + box.width * 0.8, box.x + box.width * 0.2] : [box.x + box.width * 0.2, box.x + box.width * 0.8];
  await page.mouse.move(from, y);
  await page.mouse.down();
  await page.mouse.move(to, y + 5, { steps: 8 });
  await page.mouse.up();
};
const position = async (page: Page) => {
  const m = /(\d+) \/ (\d+)$/.exec((await page.getByTestId('check-header').textContent()) ?? '')!;
  return { at: Number(m[1]), of: Number(m[2]) };
};

test('j4: swipe moves between checks and stops at both ends', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, 'qa.door43.org/checker1/sample_burrito');
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await page.getByTestId('check-row').first().click();
  expect((await position(page)).at).toBe(1);
  await swipe(page, 'left');
  await expect(page.getByTestId('check-header')).toHaveText(/ 2 \/ \d+$/);
  await swipe(page, 'right');
  await expect(page.getByTestId('check-header')).toHaveText(/ 1 \/ \d+$/);
  await swipe(page, 'right');
  await expect(page.getByTestId('check-header')).toHaveText(/ 1 \/ \d+$/);

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Titus 1' }).click();
  await page.getByRole('dialog', { name: 'Chapters' }).getByRole('button', { name: /^Chapter 3/ }).click();
  await page.getByTestId('verse').last().locator('summary').click();
  await page.getByTestId('check-row').last().click();
  const last = await position(page);
  expect(last.at).toBe(last.of);
  await swipe(page, 'left');
  await expect(page.getByTestId('check-header')).toHaveText(new RegExp(` ${last.of} / ${last.of}$`));
});

test('j4: a right-to-left target renders rtl with the selection on the right word', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  const project = 'qa.door43.org/checker1/sample_rtl';
  await placeRepo(SAMPLE_PROJECT, project);
  const settings = JSON.parse((await readIngredient(project, 'checking/settings.json').catch(() => '{}')) || '{}') as Record<string, unknown>;
  await writeIngredient(project, 'checking/settings.json', JSON.stringify({ ...settings, textDirection: 'rtl' }, null, 2));
  await openProject(page, context, 'sample_rtl');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await page.getByTestId('check-row').filter({ hasText: /^Diosof God(Checked)?$/ }).first().click();
  await expect(page.getByTestId('target')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('target').locator('[data-sel]')).toHaveText(['Dios']);
});
