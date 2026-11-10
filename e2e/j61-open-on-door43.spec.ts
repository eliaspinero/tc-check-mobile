// Issue #61: on the books screen, the checker can open the project's repository on Door43 in the phone's
// browser (Tauri's opener plugin), not inside the app.
import { test, expect } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, rigUp } from './helpers/rig';
import { USER, openProject } from './helpers/session';
import { fakeDoor43 } from './helpers/fakeDoor43';
import { fakeTauri } from './helpers/fakeTauri';
import { placeTcProject } from './helpers/journal';

const REPO = 'open_on_door43';
const PROJECT = `qa.door43.org/${USER.username}/${REPO}`;
const DOOR43_URL = `https://${PROJECT}`;

test('j61: "Open on Door43" hands the repository\'s page to the system browser and the app stays on the books', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeTcProject(PROJECT);
  const tauri = await fakeTauri(context);
  await openProject(page, context, REPO);
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();

  const link = page.getByRole('banner').getByRole('link', { name: 'Open on Door43' });
  await expect(link).toHaveAttribute('href', DOOR43_URL);
  await link.click();
  await expect.poll(() => tauri.opened()).toEqual([DOOR43_URL]);
  expect(context.pages()).toHaveLength(1);
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
});

test.describe('on a phone in Spanish', () => {
  test.use({ locale: 'es-419' });
  test('j61: the link reads "Abrir en Door43"', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await placeTcProject(PROJECT);
    await fakeTauri(context);
    await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: REPO }] });
    await page.goto(CLIENT_URL);
    await page.getByLabel('Usuario o correo').fill(USER.username);
    await page.getByLabel('Contraseña').fill(USER.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('button', { name: new RegExp(`^${REPO}`) }).click();
    await expect(page.getByRole('heading', { name: 'Elige un libro' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Abrir en Door43' })).toHaveAttribute('href', DOOR43_URL);
  });
});
