// Journeys for the second review round of PR #2: each one failed before its fix.
import { test, expect } from '@playwright/test';
import {
  CLIENT_URL,
  NEEDS_RIG,
  RIG_URL,
  SAMPLE_PROJECT,
  UST_V90,
  UST_V90_INSTALL,
  deleteRepoIfPresent,
  listLocal,
  placeProjectMissingUstV90,
  placeRepo,
  readIngredient,
  rigUp,
  suffixInstall,
  writeIngredient,
} from './helpers/rig';
import { fakeDoor43, QA_SERVER } from './helpers/fakeDoor43';
import { fakeTauri } from './helpers/fakeTauri';
import { USER, openProject } from './helpers/session';

test.describe.configure({ timeout: 240_000 });

test('j8: reopened on a slow connection, the app never shows the sign-in form while it restores the kept token', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, 'qa.door43.org/checker1/sample_burrito');
  await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: 'sample_burrito' }] });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();

  // Slow mobile data: Door43 takes 3 s to answer who the kept token belongs to.
  let answered = false;
  await context.route(`${QA_SERVER}/api/v1/user`, async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    answered = true;
    await route.fallback();
  });
  await page.reload();
  await expect(page.getByText('Signing you in…')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to Door43' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible({ timeout: 10_000 });
  expect(answered).toBe(true);
});

test('j8: Back during a download, then the same project again: one download, one install, and the project opens', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await deleteRepoIfPresent(UST_V90_INSTALL);
  await deleteRepoIfPresent(suffixInstall(UST_V90.sha));
  await placeProjectMissingUstV90('qa.door43.org/checker1/needs_ust_v90');
  let downloads = 0;
  await context.route('https://git.door43.org/unfoldingWord/en_ust/sb/v90.zip', async (route) => {
    downloads++;
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await openProject(page, context, 'needs_ust_v90');
  await expect(page.getByText('Downloading…')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^needs_ust_v90/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible({ timeout: 120_000 });
  expect(downloads).toBe(1);
  const local = await listLocal();
  expect(local).toContain(UST_V90_INSTALL);
  expect(local).not.toContain(suffixInstall(UST_V90.sha));
});

test('j8: a target that bridges verses (\\v 1-2) shows its text and the stored selection on the check of 1:1', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  const project = 'qa.door43.org/checker1/sample_bridge';
  await placeRepo(SAMPLE_PROJECT, project);
  const usfm = await readIngredient(project, 'TIT.usfm');
  const bridged = usfm.replace('\\v 1 Pablo', '\\v 1-2 Pablo').replace(/\r?\n\\v 2 con la esperanza/, ' con la esperanza');
  expect(bridged).toContain('\\v 1-2 Pablo');
  expect(bridged).not.toContain('\\v 2 con la esperanza');
  await writeIngredient(project, 'TIT.usfm', bridged);
  await openProject(page, context, 'sample_bridge');
  await page.getByRole('button', { name: 'TIT translationWords' }).click();
  await page.getByTestId('check-row').filter({ hasText: /^1:1 · god(Checked)?$/ }).first().click();
  await expect(page.getByTestId('target')).toContainText('Pablo, siervo de Dios y apóstol de Jesucristo,');
  await expect(page.getByTestId('target').locator('[data-sel]')).toHaveText(['Dios']);
});

test('j8: a project in another versification (org) says so instead of listing checks over the wrong verses', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  const project = 'qa.door43.org/checker1/sample_org';
  await placeRepo(SAMPLE_PROJECT, project);
  const org = await (await fetch(`${RIG_URL}/api/content-utils/versification/org`)).text();
  await writeIngredient(project, 'vrs.json', org);
  await openProject(page, context, 'sample_org');
  await page.getByRole('button', { name: 'TIT translationWords' }).click();
  await expect(page.getByText('This project numbers its verses with the org versification.')).toBeVisible();
  await expect(page.getByTestId('check-row')).toHaveCount(0);
});

test('j8: the sample project, whose vrs.json is the default eng scheme, still lists its checks', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, 'qa.door43.org/checker1/sample_burrito');
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'TIT translationWords' }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
});
