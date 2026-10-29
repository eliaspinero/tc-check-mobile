// Issue #29: the app takes tC4's look from tC4's design tokens. Ways it can fail: a colour or a typeface
// typed into a stylesheet or a screen instead of a token, Mulish or Charis SIL not loading (a wrong path,
// a missing subset) so the system font shows, a font fetched from the internet (the app works offline),
// a dark mode lost to tC4's light-only tokens, or a button shrunk below a 44 px touch target by tC4's
// desktop sizes. The source check needs no browser.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';
const SRC = fileURLToPath(new URL('../client/src/', import.meta.url));
// tC4's tokens, copied, and the one place that derives the dark values from them.
const ALLOWED = [path.join(SRC, 'ds') + path.sep, path.join(SRC, 'theme.css')];
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
const FONT = /font-family\s*:(?!\s*(?:var\(--font-|inherit))/;

test.use({ viewport: { width: 375, height: 812 } });

test('j29: no stylesheet or screen types a colour or a typeface; they come from tC4 tokens', async () => {
  const offences: string[] = [];
  for (const name of fs.readdirSync(SRC, { recursive: true }) as string[]) {
    const file = path.join(SRC, name);
    if (!/\.(css|tsx)$/.test(name) || ALLOWED.some((a) => file === a || file.startsWith(a))) continue;
    const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    text.split(/\r?\n/).forEach((line, i) => {
      if (COLOUR.test(line) || FONT.test(line)) offences.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(offences, 'Use a token from client/src/ds/tokens (for example var(--text-body) or var(--font-ui)); dark values go in client/src/theme.css').toEqual([]);
});

const openCheck = async (page: Page, context: Parameters<typeof openProject>[1]) => {
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await page.getByTestId('check-row').first().click();
  await expect(page.getByTestId('target')).toContainText('Pablo, siervo de Dios');
};

const family = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);

test('j29: the interface is Mulish and scripture is Charis SIL, both loaded from the app itself', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  const outside: string[] = [];
  page.on('request', (r) => {
    if (['font', 'stylesheet'].includes(r.resourceType()) && new URL(r.url()).hostname !== '127.0.0.1') outside.push(r.url());
  });
  await openCheck(page, context);
  expect(await family(page, 'body')).toMatch(/^"?Mulish/);
  for (const pane of ['[data-testid="target"] p', '[data-testid="pane-ULT"] p']) expect(await family(page, pane), pane).toMatch(/^"?Charis SIL/);
  await expect
    .poll(() => page.evaluate(async () => (await document.fonts.ready, [document.fonts.check('16px Mulish'), document.fonts.check('16px "Charis SIL"')])))
    .toEqual([true, true]);
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
  expect(loaded).toEqual(expect.arrayContaining(['Mulish', 'Charis SIL']));
  expect(outside).toEqual([]);
});

test('j29: the dark mode stays, on tC4 colours', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openCheck(page, context);
  const colours = () => page.evaluate(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.documentElement).color]);
  const light = await colours();
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await colours();
  expect(dark[0]).not.toBe(light[0]);
  expect(dark[1]).not.toBe(light[1]);
  // tC4's app background, Paper #F7FAFC, in the light theme.
  expect(light[0]).toBe('rgb(247, 250, 252)');
});

test('j29: every button on the check screen is at least 44 px tall', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openCheck(page, context);
  const heights = await page.locator('button:visible').evaluateAll((els) => els.map((el) => [el.textContent?.trim() || el.getAttribute('aria-label'), el.getBoundingClientRect().height]));
  expect(heights.filter(([, h]) => (h as number) < 44)).toEqual([]);
});
