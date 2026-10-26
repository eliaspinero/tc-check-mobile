import { test, expect } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { fakeDoor43, QA_SERVER } from './helpers/fakeDoor43';
import { fakeTauri } from './helpers/fakeTauri';
import { USER } from './helpers/session';

test('j6: reopened with no internet, the app keeps the token and lists the projects on this device', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, 'qa.door43.org/checker1/sample_burrito');
  const tauri = await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: 'sample_burrito' }] });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  const kept = tauri.token();
  expect(kept).not.toBeNull();

  await context.unroute(`${QA_SERVER}/api/v1/**`);
  await context.route(`${QA_SERVER}/**`, (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  expect(tauri.token()).toBe(kept);
  await page.getByRole('button', { name: /^sample_burrito/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
});
