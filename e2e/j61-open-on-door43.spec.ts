// Issue #61: on the books screen, the checker can open the project's repository on Door43 in the phone's
// browser (Tauri's opener plugin), not inside the app. A sheet asks first, as the app is about to be left.
import { test, expect } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, rigUp } from './helpers/rig';
import { USER, openProject } from './helpers/session';
import { fakeDoor43 } from './helpers/fakeDoor43';
import { fakeTauri } from './helpers/fakeTauri';
import { placeTcProject } from './helpers/journal';

const REPO = 'open_on_door43';
const PROJECT = `qa.door43.org/${USER.username}/${REPO}`;
const DOOR43_URL = `https://${PROJECT}`;

test('j61: the ↗ in the bar asks first; Open hands the repository\'s page to the system browser and the app stays on the books', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeTcProject(PROJECT);
  const tauri = await fakeTauri(context);
  await openProject(page, context, REPO);
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: 'Open on Door43' }).click();
  const sheet = page.getByRole('dialog', { name: "You're leaving tC Check" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(PROJECT);
  expect(tauri.opened()).toEqual([]);

  const open = sheet.getByRole('link', { name: 'Open' });
  await expect(open).toHaveAttribute('href', DOOR43_URL);
  await open.click();
  await expect.poll(() => tauri.opened()).toEqual([DOOR43_URL]);
  await expect(sheet).toBeHidden();
  expect(context.pages()).toHaveLength(1);
  await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
});

test('j61: Cancel closes the sheet, opens nothing, and gives the focus back to the ↗', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeTcProject(PROJECT);
  const tauri = await fakeTauri(context);
  await openProject(page, context, REPO);
  const trigger = page.getByRole('banner').getByRole('button', { name: 'Open on Door43' });
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: "You're leaving tC Check" });
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(tauri.opened()).toEqual([]);
});

test.describe('on a narrow phone', () => {
  test.use({ viewport: { width: 360, height: 780 } });
  test('j61: a long project name still reads whole, nothing drawn over it', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    const long = 'en_ult_titus_checking';
    await placeTcProject(`qa.door43.org/${USER.username}/${long}`);
    await openProject(page, context, long);
    await expect(page.getByRole('banner').getByRole('button', { name: 'Open on Door43' })).toBeVisible();
    // The project line's text fits its box: it does not run on under anything beside it.
    const sub = page.getByRole('banner').getByText(`${USER.username}/${long}`, { exact: true });
    expect(await sub.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  });
});

test.describe('on a phone in Spanish', () => {
  test.use({ locale: 'es-419' });
  test('j61: the ↗ and its sheet are in Spanish', async ({ page, context }) => {
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
    await page.getByRole('banner').getByRole('button', { name: 'Abrir en Door43' }).click();
    const sheet = page.getByRole('dialog', { name: 'Vas a salir de tC Check' });
    await expect(sheet.getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', DOOR43_URL);
    await expect(sheet.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  });
});
