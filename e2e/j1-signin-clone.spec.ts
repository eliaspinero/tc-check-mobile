import { test, expect } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, rigUp } from './helpers/rig';
import { fakeDoor43 } from './helpers/fakeDoor43';

const USER = { username: 'checker1', password: 'pass-for-fake-door43' };

test('j1: sign in shows your projects; no URL carries the token', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  const door43 = await fakeDoor43(context, { user: USER });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  const minted = [...door43.tokens.values()];
  expect(minted.map((t) => t.name)).toEqual(['tc-check-mobile']);
  expect(door43.calls.some((c) => c.url.includes(minted[0].sha1))).toBe(false);
});

test('j1: a wrong password shows Door43 message', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await fakeDoor43(context, { user: USER });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('invalid username, password or token')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to Door43' })).toBeVisible();
});
