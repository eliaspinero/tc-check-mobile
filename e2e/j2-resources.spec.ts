import { test, expect } from '@playwright/test';
import { NEEDS_RIG, UST_V90_INSTALL, deleteRepoIfPresent, listLocal, placeProjectMissingUstV90, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';

const PROJECT = 'qa.door43.org/checker1/needs_ust_v90';

test.describe.configure({ timeout: 180_000 });

test('j2: a missing pinned resource downloads, installs, then the book picker opens', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await deleteRepoIfPresent(UST_V90_INSTALL);
  await placeProjectMissingUstV90(PROJECT);
  const downloads: string[] = [];
  page.on('request', (r) => r.url().endsWith('/en_ust/sb/v90.zip') && downloads.push(r.url()));
  await openProject(page, context, 'needs_ust_v90');
  await expect(page.getByText('en_ust v90')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible({ timeout: 150_000 });
  expect(await listLocal()).toContain(UST_V90_INSTALL);
  expect(downloads).toHaveLength(1);

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^needs_ust_v90/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
  await expect(page.getByText('en_ust v90')).toHaveCount(0);
});

test('j2: a download cut off midway installs nothing, and Try again installs it', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await deleteRepoIfPresent(UST_V90_INSTALL);
  await placeProjectMissingUstV90(PROJECT);
  await context.route('https://git.door43.org/unfoldingWord/en_ust/sb/v90.zip', (route) => route.abort('connectionreset'));
  await openProject(page, context, 'needs_ust_v90');
  await expect(page.getByText('Download stopped')).toBeVisible({ timeout: 30_000 });
  expect(await listLocal()).not.toContain(UST_V90_INSTALL);

  await context.unroute('https://git.door43.org/unfoldingWord/en_ust/sb/v90.zip');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible({ timeout: 150_000 });
  expect(await listLocal()).toContain(UST_V90_INSTALL);
});
