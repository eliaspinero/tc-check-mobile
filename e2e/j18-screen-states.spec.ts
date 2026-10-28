// Issue #18: the screens hold one closed state per flow. These journeys pin the states a checker
// reaches that no other journey covers, so the refactor keeps them: a failed Sync over a loaded
// list, and a project that fails to open.
import { test, expect } from '@playwright/test';
import { NEEDS_RIG, SAMPLE_PROJECT, deleteRepoIfPresent, placeRepo, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';
const refused = (reason: string) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_good: false, reason }) });

test('j18: a failed Sync keeps the list on screen, shows why, and Sync can be tapped again', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  const rows = page.getByTestId('check-row');
  await expect(rows.first()).toBeAttached();
  const before = await rows.count();
  await page.route('**/api/git/pull-repo/**', (route) => route.fulfill(refused('pull refused by the test')));
  await page.getByRole('button', { name: 'Sync' }).click();
  await expect(page.getByRole('alert')).toContainText('pull refused by the test');
  await expect(rows).toHaveCount(before);
  await expect(page.getByTestId('progress')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync' })).toBeEnabled();
});

test('j18: a project that fails to open shows why, and its row can be tapped again', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await deleteRepoIfPresent('qa.door43.org/checker1/never_cloned');
  await page.route('**/api/git/clone-repo/**', (route) => route.fulfill(refused('clone refused by the test')));
  await openProject(page, context, 'never_cloned');
  await expect(page.getByRole('alert')).toContainText('clone refused by the test');
  const row = page.getByRole('button', { name: /^never_cloned/ });
  await expect(row).toBeEnabled();
  await expect(row).toContainText('›');
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
});
