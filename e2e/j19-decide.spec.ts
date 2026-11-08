// Issue #9 slice 9a, then #48: decide on the phone. A decision is recorded as the Rust tC4 records it: one change
// by the phone's own device, sealed into a pack under ingredients/tc/changes/; the decision file is written again
// from the packs; the list follows at once; nothing is lost when the app closes right after; a project not in that
// format offers no decision.
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { NEEDS_RIG, SAMPLE_PROJECT, placeRepo, readIngredient, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';
import { changesOf, placeTcProject } from './helpers/journal';

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

type Change = { device: string; seq: number; record: { check?: { key: { checkId: string } } } };
/** The devices of the seeded project: tC4 desktop's work, before the phone decides anything. */
let seeded: Set<string>;
/** The phone's own check changes, in the order it wrote them (its `seq`; packs are named by hash): those of every
 * device the seed did not have. */
const phoneChanges = async (): Promise<{ devices: string[]; checkIds: string[] }> => {
  const mine = ((await changesOf(PROJECT)) as unknown as Change[]).filter((c) => !seeded.has(c.device) && c.record.check).sort((a, b) => a.seq - b.seq);
  return { devices: [...new Set(mine.map((c) => c.device))], checkIds: mine.map((c) => c.record.check!.key.checkId) };
};
/** The decision file as the packs project it. */
const decisionFile = async () => JSON.parse(await readIngredient(PROJECT, 'checking/translationWords/TIT.json')) as { resource: { sha: string }; decisions: Decision[] };
const decisionOf = async (checkId: string) => (await decisionFile()).decisions.find((d) => d.contextId.checkId === checkId);

const progressOf = async (page: Page): Promise<number> => Number(((await page.getByTestId('progress').textContent()) ?? '').match(/\d+/)![0]);

test.beforeEach(async () => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeTcProject(PROJECT);
  seeded = new Set(((await changesOf(PROJECT)) as unknown as Change[]).map((c) => c.device));
});

test('j19: tapped words and Valid seal one change by the phone into a pack, and the decision file and the list follow', async ({ page, context }) => {
  const before = await openUndecided(page, context);
  const word = page.getByTestId('target').getByRole('button').first();
  const text = (await word.textContent()) ?? '';
  await word.click();
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await page.screenshot({ path: 'test-results/j19-decided.png' });

  const { devices, checkIds } = await phoneChanges();
  expect(devices).toHaveLength(1);
  expect(checkIds).toHaveLength(1);
  // The decision file is written again from the packs, with the decision in it.
  const decision = await decisionOf(checkIds[0]);
  expect(decision).toMatchObject({ status: 'valid', nothingToSelect: false });
  expect(decision!.selections).toEqual([{ text, occurrence: expect.any(Number), occurrences: expect.any(Number) }]);
  expect((await decisionFile()).resource.sha).toMatch(/^[0-9a-f]{40}$/);

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
  const decisions = await Promise.all((await phoneChanges()).checkIds.map(async (id) => (await decisionOf(id))!));
  expect(decisions.map((d) => ({ selections: d.selections, nothingToSelect: d.nothingToSelect, status: d.status }))).toEqual([
    { selections: false, nothingToSelect: true, status: 'valid' },
    { selections: false, nothingToSelect: false, status: 'invalid' },
  ]);
});

const backgroundOf = (el: Locator) => el.evaluate((e) => getComputedStyle(e).backgroundColor);
/** The colour a decide button shows: its fill layer once that layer is in (#42 fades it in through opacity), else
 * its own background. */
const fillOf = (el: Locator) =>
  el.evaluate((e) => {
    const layer = getComputedStyle(e, '::before');
    return layer.opacity === '1' ? layer.backgroundColor : getComputedStyle(e).backgroundColor;
  });
const tokenBackground = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${t})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  }, token);

// #29 owner ruling (design B3·1): the decision sits on tC4's Ocean sheet. Neither button is filled until it is
// the check's decision; the chosen one fills in its status colour and says so to a screen reader, the other
// dims but can still be tapped to change it. Once decided, one large Next says which verse it goes to when it leaves this one, and the
// small Next of the navigation row gives way to it, so there is always one Next.
test('j19: on the Ocean sheet, the chosen decision fills and one large Next says where it goes', async ({ page, context }) => {
  await openUndecided(page, context);
  const bar = page.getByTestId('decide-bar');
  const valid = bar.getByRole('button', { name: 'Valid', exact: true });
  const invalid = bar.getByRole('button', { name: 'Invalid', exact: true });
  const nexts = page.getByRole('button', { name: /^Next/ });
  await expect.poll(() => backgroundOf(bar)).toBe(await tokenBackground(page, '--uw-ocean'));
  const rest = await tokenBackground(page, '--fill-on-ocean');
  await expect.poll(() => fillOf(valid)).toBe(rest);
  await expect.poll(() => fillOf(invalid)).toBe(rest);
  await expect(valid).toHaveAttribute('aria-pressed', 'false');
  await expect(nexts).toHaveCount(1);
  await expect(nexts).toHaveText(/^Next ›$/);
  // The fills fade in over tC4's --dur-panel, so a colour is read once it settles.
  await valid.click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await expect(valid).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => fillOf(valid)).toBe(await tokenBackground(page, '--tc-valid-strong'));
  await expect.poll(() => fillOf(invalid)).toBe(rest);
  await expect(nexts).toHaveCount(1);
  await expect(nexts).toHaveText(/^Next\s*(\d+:\d+ )?›$/);
  await invalid.click();
  await expect(page.getByTestId('decided')).toHaveText('Invalid');
  await expect(invalid).toHaveAttribute('aria-pressed', 'true');
  await expect(valid).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => fillOf(invalid)).toBe(await tokenBackground(page, '--tc-invalid'));
  await expect.poll(() => fillOf(valid)).toBe(rest);
});

test('j19: a decision survives closing the app right after it shows', async ({ page, context }) => {
  await openUndecided(page, context);
  await page.getByRole('button', { name: 'Valid', exact: true }).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  // The app closes at once: nothing on the page is left to finish the save.
  await page.reload();
  const [checkId] = (await phoneChanges()).checkIds;
  expect(checkId).toBeTruthy();
  expect(await decisionOf(checkId)).toMatchObject({ status: 'valid', nothingToSelect: true });
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  const [decided] = ((await page.getByTestId('progress').textContent()) ?? '').match(/\d+/g)!.map(Number);
  const file = await decisionFile();
  expect(decided).toBe(file.decisions.filter((d) => d.selections !== false || d.nothingToSelect).length);
});

test('j19: with Door43 unreachable, a decision is still recorded on the phone', async ({ page, context }) => {
  await openUndecided(page, context);
  await context.route('https://qa.door43.org/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Invalid' }).click();
  await expect(page.getByTestId('decided')).toHaveText('Invalid');
  expect((await phoneChanges()).checkIds).toHaveLength(1);
});

test('j19: moving on while a decision saves keeps the checker where they went', async ({ page, context }) => {
  await openUndecided(page, context);
  // A slow phone: the decision takes a while to be recorded.
  const record = (url: URL) => url.pathname.startsWith('/api/tc/decide/');
  let landed = false;
  await page.route(record, async (route) => {
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

test("j19: a project not in the new translationCore's format says so and offers no decision", async ({ page, context }) => {
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openUndecided(page, context);
  await expect(page.locator('.slide > .muted', { hasText: 'This project is not in the new translationCore’s format yet.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Valid', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Invalid' })).toHaveCount(0);
});
