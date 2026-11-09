// Issue #56: the project list shows first the projects the checker can check here (in the Rust tC4's format, and
// theirs to change); the rest wait behind "Other projects", closed, and still open from there.
import { test, expect } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, rigUp } from './helpers/rig';
import { USER } from './helpers/session';
import { fakeDoor43 } from './helpers/fakeDoor43';
import { placeTcProject } from './helpers/journal';

test('j56: only the projects the checker can check show at first; a read-only one opens from Other projects', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeTcProject('qa.door43.org/checker1/read_only');
  await fakeDoor43(context, {
    user: USER,
    repos: [
      { owner: USER.username, name: 'usable_tc' },
      { owner: USER.username, name: 'old_format', format: 'other' },
      { owner: USER.username, name: 'read_only', canPush: false },
    ],
  });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const names = page.locator('main.screen .project-name');
  await expect(names).toHaveText(['usable_tc']);
  await expect(page.getByTestId('finding-projects')).toHaveCount(0);
  const others = page.getByRole('button', { name: 'Other projects (2)' });
  await expect(others).toHaveAttribute('aria-expanded', 'false');

  await others.click();
  await expect(others).toHaveAttribute('aria-expanded', 'true');
  await expect(names).toHaveText(['usable_tc', 'old_format', 'read_only']);
  await page.getByRole('button', { name: /^read_only/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
});

test('j56: while Door43 is asked, a line says the search is running, and the usable projects appear as they are found', async ({ page, context }) => {
  await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: 'usable_tc' }] });
  let answer = () => {};
  const answered = new Promise<void>((r) => (answer = r));
  await page.route('https://qa.door43.org/api/v1/repos/**/contents/**', async (route) => {
    await answered;
    await route.fallback();
  });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('finding-projects')).toHaveText('Finding the projects you can check here… (0 of 1)');
  await expect(page.locator('main.screen .project-name')).toHaveCount(0);
  answer();
  await expect(page.locator('main.screen .project-name')).toHaveText(['usable_tc']);
  await expect(page.getByTestId('finding-projects')).toHaveCount(0);
});
