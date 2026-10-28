import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import { CLIENT_URL, NEEDS_RIG, UST_V90_INSTALL, deleteRepoIfPresent, listLocal, placeProjectMissingUstV90, rigUp } from './helpers/rig';
import { USER } from './helpers/session';
import { fakeDoor43 } from './helpers/fakeDoor43';

const PROJECT = 'qa.door43.org/checker1/needs_ust_v90';
const UST_V90_ZIP = 'https://git.door43.org/unfoldingWord/en_ust/sb/v90.zip';
// The download is a cross-origin fetch: an answer without this header reaches the app as a network failure.
const CORS = { 'Access-Control-Allow-Origin': '*' };
const CONNECT_ADVICE = /Conéctate a internet/;
const CONTINUE_ADVICE = 'Puedes continuar: las revisiones y los paneles que lo necesitan lo indican.';

test.describe.configure({ timeout: 60_000 });
test.use({ locale: 'es-419' });

/** Sign in on a Spanish phone and open the project whose en_ust v90 pin is missing. */
const openInSpanish = async (page: Page, context: BrowserContext) => {
  await deleteRepoIfPresent(UST_V90_INSTALL);
  await placeProjectMissingUstV90(PROJECT);
  await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: 'needs_ust_v90' }] });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Usuario o correo').fill(USER.username);
  await page.getByLabel('Contraseña').fill(USER.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: /^needs_ust_v90/ }).click();
};

test('j15: no internet during a resource download says so in Spanish', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await context.route(UST_V90_ZIP, (route) => route.abort('internetdisconnected'));
  await openInSpanish(page, context);
  await expect(page.getByText('en_ust v90: No se puede conectar con Door43. Revisa tu conexión a internet.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Descarga detenida')).toBeVisible();
  await expect(page.getByText(CONNECT_ADVICE)).toBeVisible();
  expect(await listLocal()).not.toContain(UST_V90_INSTALL);
});

test('j15: a resource version that is not on Door43 says so in Spanish, with the raw detail below', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await context.route(UST_V90_ZIP, (route) => route.fulfill({ status: 404, headers: CORS, body: 'Not found' }));
  await openInSpanish(page, context);
  await expect(page.getByText('en_ust v90: Esta versión no está en Door43.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`could not download ${UST_V90_ZIP} (HTTP 404)`)).toBeVisible();
  // Online already: no advice to connect, only that the checker can go on without it.
  await expect(page.getByText(CONNECT_ADVICE)).toHaveCount(0);
  await expect(page.getByText(CONTINUE_ADVICE)).toBeVisible();
  expect(await listLocal()).not.toContain(UST_V90_INSTALL);
});

test('j15: a download that is not the pinned version says so in Spanish, with the raw detail below', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  // A well-formed burrito export whose metadata declares another commit than the pin.
  const metadata = { identification: { primary: { dcs: { x: { revision: 'f'.repeat(40) } } } } };
  const zip = zipSync({
    'en_ust/metadata.json': new TextEncoder().encode(JSON.stringify(metadata)),
    'en_ust/ingredients/README.md': new TextEncoder().encode('x'),
  });
  await context.route(UST_V90_ZIP, (route) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/zip', body: Buffer.from(zip) }));
  await openInSpanish(page, context);
  await expect(page.getByText('en_ust v90: El archivo descargado no es la versión que fija el proyecto, así que no se instaló.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/is commit ffffffffffff…, but the project pins e254f81aa766…/)).toBeVisible();
  // Online already: no advice to connect, only that the checker can go on without it.
  await expect(page.getByText(CONNECT_ADVICE)).toHaveCount(0);
  await expect(page.getByText(CONTINUE_ADVICE)).toBeVisible();
  expect(await listLocal()).not.toContain(UST_V90_INSTALL);
});
