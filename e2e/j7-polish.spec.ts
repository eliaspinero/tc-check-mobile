import { test, expect, type Page } from '@playwright/test';
import { NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';
// A tN support reference as the resources write it: `figs-abstractnouns`.
const TN_ID = /^[a-z0-9]+(-[a-z0-9]+)+$/;
// tW group ids of Titus 1 that main showed as row labels before this change.
const TW_IDS = ['paul', 'god', 'servant', 'apostle', 'faith', 'jesus', 'christ', 'elect', 'truth', 'godly', 'hope', 'eternity'];

test.use({ viewport: { width: 375, height: 812 } });

const openTitus = async (page: Page, context: Parameters<typeof openProject>[1], tool: 'Words' | 'Notes') => {
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: `Titus ${tool}` }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
};

const labels = (page: Page) => page.getByTestId('row-label').allTextContents();

test('j7 polish: tW rows name the article and the ULT words, never the group id', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitus(page, context, 'Words');
  const first = page.getByTestId('check-row').first();
  await expect(first.getByTestId('row-label')).toHaveText('Pablo, Saulo');
  await expect(first.getByTestId('row-quote')).toHaveText('Paul');
  await expect(page.getByTestId('row-label').filter({ hasText: /^Dios$/ }).first()).toBeVisible();
  await expect.poll(async () => (await labels(page)).filter((l) => TW_IDS.includes(l))).toEqual([]);
});

test('j7 polish: tN rows and the tN help are titled by the ULT words, with the Academy reference as a tag', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitus(page, context, 'Notes');
  await expect(page.getByTestId('check-row').first().getByTestId('row-label')).toHaveText('for the faith');
  await expect.poll(async () => (await labels(page)).filter((l) => TN_ID.test(l))).toEqual([]);
  await page.getByTestId('check-row').first().click();
  await expect(page.getByTestId('help-title')).toHaveText('for the faith');
  await expect(page.getByTestId('help-refs')).toHaveText('figs-abstractnouns');
});

test('j7 polish: no help shows an rc:// address', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitus(page, context, 'Notes');
  await page.getByTestId('check-row').first().click();
  await page.getByTestId('help').getByRole('button').click();
  // The help stays open from check to check: walk the first notes of Titus 1.
  for (let i = 0; i < 12; i++) {
    await expect(page.getByTestId('help-body')).not.toBeEmpty();
    await expect(page.getByTestId('help')).not.toContainText('rc://');
    await expect(page.getByTestId('help')).not.toContainText('[[');
    await page.getByRole('button', { name: /^Next/ }).click();
  }
});

test('j7 polish: the target verse shows without scrolling on a 375 × 812 phone', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitus(page, context, 'Words');
  await page.getByTestId('check-row').first().click();
  await expect(page.getByTestId('target')).toContainText('Pablo, siervo de Dios');
  const target = (await page.getByTestId('target').boundingBox())!;
  const bar = (await page.locator('.bottombar').boundingBox())!;
  expect(target.y + target.height).toBeLessThanOrEqual(bar.y);
});

test('j7 polish: one typeface for the whole app', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitus(page, context, 'Words');
  const font = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);
  const body = await font('body');
  for (const sel of ['h1', 'summary', '[data-testid="check-row"]', '.topbar-actions button']) expect(await font(sel), sel).toBe(body);
});

test('j7 polish: help, sources and verses are set apart by space, not a border on every block', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openTitus(page, context, 'Words');
  const borderTop = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(await borderTop('[data-testid="verse"]')).toBe('0px');
  await page.getByTestId('check-row').first().click();
  for (const sel of ['[data-testid="help"]', '[data-testid="pane-ULT"]', '[data-testid="pane-UST"]', '[data-testid="target"]']) expect(await borderTop(sel), sel).toBe('0px');
});

test('j7 polish: the project list and the book picker carry the app name in the accent colour', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  const accent = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  for (const heading of ['Choose a book', 'Your projects']) {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    const name = page.getByTestId('app-name');
    await expect(name).toHaveText('tC Check');
    await expect.poll(() => name.evaluate((el) => getComputedStyle(el).color)).toBe(accent);
    if (heading === 'Choose a book') await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
  }
});
