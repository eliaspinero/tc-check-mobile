import { test, expect } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, PLAIN_REPO, SAMPLE_PROJECT, listLocal, placeRepo, rigUp } from './helpers/rig';
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

const signIn = async (page: import('@playwright/test').Page) => {
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

test('j1: a project already on the device opens without a second clone', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, 'qa.door43.org/checker1/sample_burrito');
  await fakeDoor43(context, { user: USER, repos: [{ owner: 'checker1', name: 'sample_burrito', description: 'Titus' }] });
  await signIn(page);
  await page.getByRole('button', { name: /sample_burrito/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /sample_burrito/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
  expect((await listLocal()).filter((p) => p.toLowerCase() === 'qa.door43.org/checker1/sample_burrito')).toHaveLength(1);
});

test('j1: a repo that is not a tC4 project says so', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(PLAIN_REPO, 'qa.door43.org/checker1/plain_repo');
  await fakeDoor43(context, { user: USER, repos: [{ owner: 'checker1', name: 'plain_repo' }] });
  await signIn(page);
  await page.getByRole('button', { name: /plain_repo/ }).click();
  await expect(page.getByText("This isn't a translationCore project")).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
});

test('j1: clone a real tC4 project from the Door43 QA server', async ({ page }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  const qa = { user: process.env.TC_QA_USER, password: process.env.TC_QA_PASSWORD, project: process.env.TC_QA_PROJECT };
  test.skip(!qa.user || !qa.password || !qa.project, 'needs TC_QA_USER, TC_QA_PASSWORD and TC_QA_PROJECT (org/repo of a tC4 project on qa.door43.org)');
  const [org, repo] = qa.project!.split('/');
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(qa.user!);
  await page.getByLabel('Password').fill(qa.password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: new RegExp(repo) }).click();
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible({ timeout: 120_000 });
  expect((await listLocal()).some((p) => p.toLowerCase() === `qa.door43.org/${org}/${repo}`.toLowerCase())).toBe(true);
});
