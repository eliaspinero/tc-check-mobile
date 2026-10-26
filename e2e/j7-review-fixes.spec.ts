import { test, expect, type Page } from '@playwright/test';
import {
  NEEDS_RIG,
  SAMPLE_PROJECT,
  UST_V89,
  UST_V90,
  UST_V90_INSTALL,
  deleteRepoIfPresent,
  listLocal,
  placeProjectMissingUstV90,
  placeProjectWithUst,
  placeProjectWithoutPinBooks,
  placeRepo,
  rigUp,
  suffixInstall,
} from './helpers/rig';
import { openProject } from './helpers/session';

test.describe.configure({ timeout: 240_000 });
const bookPicker = (page: Page) => page.getByRole('heading', { name: 'Choose a book' });

test('j7: two projects pin two versions of one resource; both install and both open', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  for (const p of [UST_V90_INSTALL, suffixInstall(UST_V90.sha), suffixInstall(UST_V89.sha)]) await deleteRepoIfPresent(p);
  await placeProjectWithUst('qa.door43.org/checker1/ust_v90', UST_V90);
  await placeProjectWithUst('qa.door43.org/checker1/ust_v89', UST_V89);
  await openProject(page, context, 'ust_v90', ['ust_v90', 'ust_v89']);
  await expect(bookPicker(page)).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^ust_v89/ }).click();
  await expect(bookPicker(page)).toBeVisible({ timeout: 120_000 });
  expect(await listLocal()).toEqual(expect.arrayContaining([UST_V90_INSTALL, suffixInstall(UST_V89.sha)]));
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^ust_v89/ }).click();
  await expect(bookPicker(page)).toBeVisible();
  await expect(page.getByText('en_ust v89')).toHaveCount(0);
});

test('j7: a sha-only pin installs once and is then recognized', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await deleteRepoIfPresent(suffixInstall(UST_V89.sha));
  const shaOnly: Record<string, unknown> = { ...UST_V89 };
  delete shaOnly.version;
  await placeProjectWithUst('qa.door43.org/checker1/ust_sha_only', shaOnly);
  await openProject(page, context, 'ust_sha_only');
  await expect(bookPicker(page)).toBeVisible({ timeout: 180_000 });
  expect(await listLocal()).toContain(suffixInstall(UST_V89.sha));
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^ust_sha_only/ }).click();
  await expect(bookPicker(page)).toBeVisible();
  await expect(page.getByText(`en_ust ${UST_V89.sha.slice(0, 7)}`)).toHaveCount(0);
});

test('j7: a resource that will not download does not lock the project: Continue opens it', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await deleteRepoIfPresent(UST_V90_INSTALL);
  await placeProjectMissingUstV90('qa.door43.org/checker1/needs_ust_v90');
  await context.route('https://git.door43.org/unfoldingWord/en_ust/sb/v90.zip', (route) => route.abort('internetdisconnected'));
  await openProject(page, context, 'needs_ust_v90');
  await expect(page.getByText('Download stopped')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(bookPicker(page)).toBeVisible();
});

test('j7: leaving the install screen keeps you where you went when the download finishes', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await deleteRepoIfPresent(UST_V90_INSTALL);
  await placeProjectMissingUstV90('qa.door43.org/checker1/needs_ust_v90');
  await placeRepo(SAMPLE_PROJECT, 'qa.door43.org/checker1/sample_burrito');
  await context.route('https://git.door43.org/unfoldingWord/en_ust/sb/v90.zip', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await openProject(page, context, 'needs_ust_v90', ['needs_ust_v90', 'sample_burrito']);
  await expect(page.getByText('Downloading…')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^sample_burrito/ }).click();
  await expect(page.getByText('checker1/sample_burrito')).toBeVisible();
  await expect.poll(async () => (await listLocal()).includes(UST_V90_INSTALL), { timeout: 120_000 }).toBe(true);
  await page.waitForTimeout(1500);
  await expect(page.getByText('checker1/sample_burrito')).toBeVisible();
});

test('j7: a pin without its book list still resolves from the installed resource', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeProjectWithoutPinBooks('qa.door43.org/checker1/no_pin_books');
  await openProject(page, context, 'no_pin_books');
  await page.getByRole('button', { name: 'TIT translationWords' }).click();
  await expect(page.getByTestId('progress')).toHaveText(/^\d+ of \d+ checked$/);
});

test('j7: a slow tW article never shows under another check', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, 'qa.door43.org/checker1/sample_burrito');
  await page.route(/\/api\/burrito\/ingredient\/raw\/.*payload\/kt\/god\.md/, async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'TIT translationWords' }).click();
  await page.getByTestId('check-row').filter({ hasText: /^1:1 · god(Checked)?$/ }).first().click();
  const box = (await page.getByTestId('check-screen').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2 + 5, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('check-header')).toHaveText(/ 2 \/ \d+$/);
  await page.waitForTimeout(3000);
  await expect(page.getByTestId('help-title')).not.toHaveText('Dios');
});
