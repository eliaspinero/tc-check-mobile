// Issue #9, slice 9a: decide on the phone. A decision goes into the project's journal as tC4 writes
// one, with the phone as its own actor; the derived decision file follows; the list follows at once;
// nothing is lost when the app closes right after; a project tC4 never opened offers no decision.
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { NEEDS_RIG, SAMPLE_PROJECT, placeRepo, readIngredient, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';
import { DESKTOP_ACTOR, foldOf, journalFiles, placeJournaledProject } from './helpers/journal';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';
type Decision = { contextId: { checkId: string }; selections: Array<{ text: string; occurrence: number; occurrences: number }> | false; nothingToSelect: boolean; status?: string };

/** Open Titus Words, then the first check of chapter 1 that is not decided yet; returns the book's decided count before. */
const openUndecided = async (page: Page, context: BrowserContext): Promise<number> => {
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  const before = await progressOf(page);
  await page.getByTestId('check-row').filter({ hasNotText: 'Checked' }).first().click();
  await expect(page.getByTestId('check-screen')).toBeVisible();
  return before;
};

/** The phone's own decisions: the journal events of every actor but tC4 desktop's. */
const phoneDecisions = async (): Promise<{ actors: string[]; decisions: Decision[]; refused: string[] }> => {
  const { events, refused } = await foldOf(PROJECT);
  const mine = events.filter((e) => e.actor !== DESKTOP_ACTOR) as unknown as Array<{ actor: string; op: string; decision: Decision }>;
  return { actors: [...new Set(mine.map((e) => e.actor))], decisions: mine.filter((e) => e.op === 'check.decision.set').map((e) => e.decision), refused };
};

const progressOf = async (page: Page): Promise<number> => Number(((await page.getByTestId('progress').textContent()) ?? '').match(/\d+/)![0]);

test.beforeEach(async () => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeJournaledProject(PROJECT);
});

test('j19: tapped words and Valid write one sealed journal action as the phone, and the derived file and the list follow', async ({ page, context }) => {
  const before = await openUndecided(page, context);
  const word = page.getByTestId('target').getByRole('button').first();
  const text = (await word.textContent()) ?? '';
  await word.click();
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await page.screenshot({ path: 'test-results/j19-decided.png' });

  const { actors, decisions, refused } = await phoneDecisions();
  expect(refused).toEqual([]);
  expect(actors).toHaveLength(1);
  expect(actors[0]).toMatch(/^a[0-9a-f]{15}$/);
  expect(decisions).toHaveLength(1);
  expect(decisions[0]).toMatchObject({ status: 'valid', nothingToSelect: false });
  expect(decisions[0].selections).toEqual([{ text, occurrence: expect.any(Number), occurrences: expect.any(Number) }]);
  expect(Object.keys(await journalFiles(PROJECT))).toContain(`checking/journal/${actors[0]}/actor.json`);

  // The derived file holds the decision as the fold projects it.
  const file = JSON.parse(await readIngredient(PROJECT, 'checking/translationWords/TIT.json')) as { resource: { sha: string }; decisions: Decision[] };
  expect(file.decisions.find((d) => d.contextId.checkId === decisions[0].contextId.checkId)).toEqual((await foldOf(PROJECT)).fold.decisions.translationWords.find((d: Decision) => d.contextId.checkId === decisions[0].contextId.checkId));
  expect(file.resource.sha).toMatch(/^[0-9a-f]{40}$/);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('progress')).toHaveText(new RegExp(`^${before + 1} of`));
});

const colourOf = (el: Locator) => el.evaluate((e) => getComputedStyle(e).color);
const tokenColour = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, token);

test('j19: Valid with no word tapped records nothing to select, and Invalid records invalid', async ({ page, context }) => {
  await openUndecided(page, context);
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  // #29: the decision shows in its tC4 status colour, as tC4's status dots do.
  expect(await colourOf(page.getByTestId('decided'))).toBe(await tokenColour(page, '--text-valid'));
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Invalid' }).click();
  await expect(page.getByTestId('decided')).toHaveText('Invalid');
  expect(await colourOf(page.getByTestId('decided'))).toBe(await tokenColour(page, '--text-invalid'));
  const { decisions } = await phoneDecisions();
  expect(decisions.map((d) => ({ selections: d.selections, nothingToSelect: d.nothingToSelect, status: d.status }))).toEqual([
    { selections: false, nothingToSelect: true, status: 'valid' },
    { selections: false, nothingToSelect: false, status: 'invalid' },
  ]);
});

const backgroundOf = (el: Locator) => el.evaluate((e) => getComputedStyle(e).backgroundColor);
const tokenBackground = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${t})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  }, token);

// #29 owner ruling: neither button is filled until it is the check's decision. Both rest on a soft tint of
// their status colour, so neither reads as the default; the chosen one fills, and says so to a screen reader.
test('j19: Valid and Invalid stay light until chosen, and the chosen one fills', async ({ page, context }) => {
  await openUndecided(page, context);
  const valid = page.getByRole('button', { name: 'Valid', exact: true });
  const invalid = page.getByRole('button', { name: 'Invalid', exact: true });
  const invalidSoft = await tokenBackground(page, '--fill-invalid-soft');
  expect(await backgroundOf(valid)).toBe(await tokenBackground(page, '--fill-valid-soft'));
  expect(await backgroundOf(invalid)).toBe(invalidSoft);
  await expect(valid).toHaveAttribute('aria-pressed', 'false');
  await valid.click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await expect(valid).toHaveAttribute('aria-pressed', 'true');
  expect(await backgroundOf(valid)).toBe(await tokenBackground(page, '--tc-valid-strong'));
  expect(await backgroundOf(invalid)).toBe(invalidSoft);
  await invalid.click();
  await expect(page.getByTestId('decided')).toHaveText('Invalid');
  await expect(invalid).toHaveAttribute('aria-pressed', 'true');
  await expect(valid).toHaveAttribute('aria-pressed', 'false');
  expect(await backgroundOf(invalid)).toBe(await tokenBackground(page, '--tc-invalid'));
  expect(await backgroundOf(valid)).toBe(await tokenBackground(page, '--fill-valid-soft'));
});

test('j19: a decision survives closing the app right after it shows, even before its derived file is written', async ({ page, context }) => {
  await openUndecided(page, context);
  // The derived file write never lands: the app "closes" between the journal write and it.
  const derivedWrite = (url: URL) => url.pathname.startsWith('/api/burrito/ingredient/raw/') && url.searchParams.get('ipath') === 'checking/translationWords/TIT.json';
  await page.route(derivedWrite, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const checkId = (await phoneDecisions()).decisions[0]?.contextId.checkId;
  expect(checkId).toBeTruthy();
  await page.unroute(derivedWrite);
  await page.reload();
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  const file = JSON.parse(await readIngredient(PROJECT, 'checking/translationWords/TIT.json')) as { decisions: Decision[] };
  expect(file.decisions.some((d) => d.contextId.checkId === checkId)).toBe(false);
  // The list reads the journal: the check is decided.
  const [decided] = ((await page.getByTestId('progress').textContent()) ?? '').match(/\d+/g)!.map(Number);
  const fold = (await foldOf(PROJECT)).fold;
  expect(decided).toBe(fold.decisions.translationWords.filter((d: Decision) => d.selections !== false || d.nothingToSelect).length);
});

test('j19: with Door43 unreachable, a decision is still recorded on the phone', async ({ page, context }) => {
  await openUndecided(page, context);
  await context.route('https://qa.door43.org/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Invalid' }).click();
  await expect(page.getByTestId('decided')).toHaveText('Invalid');
  expect((await phoneDecisions()).decisions).toHaveLength(1);
});

test('j19: moving on while a decision saves keeps the checker where they went', async ({ page, context }) => {
  await openUndecided(page, context);
  // A slow phone: the decision file write takes a while to land.
  const derivedWrite = (url: URL) => url.pathname.startsWith('/api/burrito/ingredient/raw/') && url.searchParams.get('ipath') === 'checking/translationWords/TIT.json';
  let landed = false;
  await page.route(derivedWrite, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
    landed = true;
  });
  await expect(page.getByTestId('check-header')).toHaveText(/ 1 \/ \d+$/);
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('check-header')).toHaveText(/ 2 \/ \d+$/);
  await expect.poll(() => landed, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('check-header')).toHaveText(/ 2 \/ \d+$/);
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
});

test('j19: a word toggled with the keyboard keeps the focus', async ({ page, context }) => {
  await openUndecided(page, context);
  const word = page.getByTestId('target').getByRole('button').first();
  await word.focus();
  await page.keyboard.press('Space');
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  await expect(word).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(word).toHaveAttribute('aria-pressed', 'false');
  await expect(word).toBeFocused();
});

test('j19: a project tC4 never opened says so and offers no decision', async ({ page, context }) => {
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openUndecided(page, context);
  await expect(page.getByText('Open this project once in translationCore to record decisions here.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Valid', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Invalid' })).toHaveCount(0);
});
