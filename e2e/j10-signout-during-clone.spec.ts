// Issue #13: signing out while a project clones must not open that project when the clone ends.
import { test, expect } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, SAMPLE_PROJECT, deleteRepoIfPresent, placeRepo, rigUp } from './helpers/rig';
import { fakeDoor43 } from './helpers/fakeDoor43';
import { USER } from './helpers/session';

const PROJECT = 'qa.door43.org/checker1/sample_signout';

test('j10: sign out during a clone, and the project does not open when the clone ends, nor at the next sign-in', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await deleteRepoIfPresent(PROJECT);
  await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: 'sample_signout' }] });

  // The clone waits until the checker has signed out; then the project lands on the device and the clone succeeds.
  let release: () => void = () => undefined;
  const signedOut = new Promise<void>((r) => (release = r));
  let cloned = false;
  await context.route('**/api/git/clone-repo/**', async (route) => {
    await signedOut;
    await placeRepo(SAMPLE_PROJECT, PROJECT);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ is_good: true, reason: 'ok' }) });
    cloned = true;
  });

  const signIn = async () => {
    await page.getByLabel('Username or email').fill(USER.username);
    await page.getByLabel('Password').fill(USER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  };
  await page.goto(CLIENT_URL);
  await signIn();
  await page.getByRole('button', { name: /^sample_signout/ }).click();
  await expect(page.getByText('Opening…')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Tap again to sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Door43' })).toBeVisible();

  // After the clone the app reads the project's resources.json, then calls onOpen: wait for that read.
  const resourcesRead = page.waitForResponse((r) => r.url().includes('resources.json'));
  release();
  await resourcesRead;
  expect(cloned).toBe(true);
  await expect(page.getByRole('heading', { name: 'Sign in to Door43' })).toBeVisible();

  await signIn();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toHaveCount(0);
});
