import type { BrowserContext, Page } from '@playwright/test';
import { CLIENT_URL } from './rig';
import { fakeDoor43 } from './fakeDoor43';

export const USER = { username: 'checker1', password: 'pass-for-fake-door43' };

/** Sign in against the fake Door43 that lists `repos` (all owned by checker1), and open `repo`. */
export const openProject = async (page: Page, context: BrowserContext, repo: string, repos: string[] = [repo]): Promise<void> => {
  await fakeDoor43(context, { user: USER, repos: repos.map((name) => ({ owner: USER.username, name })) });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: new RegExp(`^${repo}`) }).click();
};
