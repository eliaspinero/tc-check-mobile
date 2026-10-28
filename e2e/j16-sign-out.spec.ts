// Issue #16: sign-out forgets the kept token, so the next app start shows the sign-in form.
import { test, expect } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { fakeDoor43 } from './helpers/fakeDoor43';
import { fakeTauri } from './helpers/fakeTauri';
import { USER } from './helpers/session';

test('j16: after sign out, a restart shows the sign-in form and the session is not restored', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, 'qa.door43.org/checker1/sample_burrito');
  // The phone's token store, which survives a reload as it survives an app restart.
  const tauri = await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: 'sample_burrito' }] });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  expect(tauri.token()).not.toBeNull();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Tap again to sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Door43' })).toBeVisible();
  expect(tauri.token()).toBeNull();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in to Door43' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toHaveCount(0);
});
