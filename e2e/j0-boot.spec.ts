import { test, expect } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, rigUp } from './helpers/rig';

test('j0: the client boots on the sign-in screen', async ({ page }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await page.goto(CLIENT_URL);
  await expect(page.getByRole('heading', { name: 'Sign in to Door43' })).toBeVisible();
});
