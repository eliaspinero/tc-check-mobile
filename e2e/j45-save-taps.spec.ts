// Issue #45: the words tapped on a check are saved whatever the order of Valid, Invalid and tapping. As the Rust tC4
// does (STORAGE.md §5.4), a change of the words alone is saved 1 s after the last tap, or at once when the checker
// leaves the check (Next, Previous, Back) or the app goes to the background; the status stays as it was.
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { NEEDS_RIG, readIngredient, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';
import { changesOf, placeTcProject } from './helpers/journal';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';
type Decision = { contextId: { checkId: string }; selections: Array<{ text: string }> | false; status?: string | null };
type Change = { device: string; record: { check?: { key: { checkId: string } } } };

let seeded: Set<string>;
test.beforeEach(async () => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeTcProject(PROJECT);
  seeded = new Set(((await changesOf(PROJECT)) as unknown as Change[]).map((c) => c.device));
});

/** The checks the phone wrote changes for. */
const phoneCheckIds = async (): Promise<string[]> => [
  ...new Set(
    ((await changesOf(PROJECT)) as unknown as Change[]).filter((c) => !seeded.has(c.device) && c.record.check).map((c) => c.record.check!.key.checkId),
  ),
];
const decisionOf = async (checkId: string): Promise<Decision | undefined> =>
  (JSON.parse(await readIngredient(PROJECT, 'checking/translationWords/TIT.json')) as { decisions: Decision[] }).decisions.find(
    (d) => d.contextId.checkId === checkId,
  );
/** What the decision file holds for the one check the phone changed: its status and the words' texts. */
const saved = async (): Promise<{ status: string | null; words: string[] } | null> => {
  const [checkId] = await phoneCheckIds();
  const d = checkId ? await decisionOf(checkId) : undefined;
  return d ? { status: d.status ?? null, words: d.selections === false ? [] : d.selections.map((s) => s.text) } : null;
};

/** Open Titus Words and the first check of chapter 1 not decided yet; returns its row label, to open it again. */
const openUndecided = async (page: Page, context: BrowserContext): Promise<string> => {
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  const row = page.getByTestId('check-row').filter({ hasNotText: 'Checked' }).first();
  const label = (await row.getByTestId('row-label').textContent()) ?? '';
  await row.click();
  await expect(page.getByTestId('check-screen')).toBeVisible();
  return label;
};
const word = (page: Page, n: number) => page.getByTestId('target').getByRole('button').nth(n);
const textOf = async (page: Page, n: number) => ((await word(page, n).textContent()) ?? '').trim();
const valid = (page: Page) => page.getByRole('button', { name: 'Valid', exact: true });
const invalid = (page: Page) => page.getByRole('button', { name: 'Invalid', exact: true });
const nextAndBack = async (page: Page) => {
  const header = page.getByTestId('check-header');
  const here = (await header.textContent()) ?? '';
  await page.getByRole('button', { name: /^Next/ }).click();
  await expect(header).not.toHaveText(here);
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(header).toHaveText(here);
};

test('j45: Valid with nothing tapped, then a word, Next and Previous: the word is selected and saved, the check valid', async ({ page, context }) => {
  await openUndecided(page, context);
  await valid(page).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  const text = await textOf(page, 0);
  await word(page, 0).click();
  await nextAndBack(page);
  await expect(word(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await expect.poll(saved).toEqual({ status: 'valid', words: [text] });
});

test('j45: on a decided check, a changed selection shows after Next and Previous and is saved', async ({ page, context }) => {
  await openUndecided(page, context);
  const [first, second] = [await textOf(page, 0), await textOf(page, 1)];
  await word(page, 0).click();
  await valid(page).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await word(page, 1).click();
  await nextAndBack(page);
  await expect(word(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(word(page, 1)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(saved).toEqual({ status: 'valid', words: [first, second] });
});

test('j45: Invalid, Valid, then a word, Next and Previous: the word shows and is saved', async ({ page, context }) => {
  await openUndecided(page, context);
  await invalid(page).click();
  await expect(page.getByTestId('decided')).toHaveText('Invalid');
  await valid(page).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  const text = await textOf(page, 0);
  await word(page, 0).click();
  await nextAndBack(page);
  await expect(word(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(saved).toEqual({ status: 'valid', words: [text] });
});

test('j45: Valid, a word, Back to the list and the check again: the word is still there', async ({ page, context }) => {
  const label = await openUndecided(page, context);
  await valid(page).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  const text = await textOf(page, 0);
  await word(page, 0).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByTestId('check-row').filter({ hasText: label }).first().click();
  await expect(word(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(saved).toEqual({ status: 'valid', words: [text] });
});

test('j45: Valid, a word, and the app closes at once: the word is saved and shows when the app opens again', async ({ page, context }) => {
  const label = await openUndecided(page, context);
  await valid(page).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  const text = await textOf(page, 0);
  await word(page, 0).click();
  await page.reload();
  await expect.poll(saved).toEqual({ status: 'valid', words: [text] });
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await page.getByTestId('check-row').filter({ hasText: label }).first().click();
  await expect(word(page, 0)).toHaveAttribute('aria-pressed', 'true');
});

test('j45: a word tapped on a check not decided is saved a moment later without a status, and still shows after Next and Previous', async ({ page, context }) => {
  await openUndecided(page, context);
  const text = await textOf(page, 0);
  await word(page, 0).click();
  // Staying on the check: the words are saved a second after the last tap. No status is set; as in tC4, a check with
  // words counts as done (derive.ts isDecided).
  await expect.poll(saved, { timeout: 5_000 }).toEqual({ status: null, words: [text] });
  await nextAndBack(page);
  await expect(word(page, 0)).toHaveAttribute('aria-pressed', 'true');
});

test('j45: a word and Valid tapped one right after the other are both saved', async ({ page, context }) => {
  await openUndecided(page, context);
  const text = await textOf(page, 0);
  await word(page, 0).click();
  await valid(page).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  await page.waitForTimeout(1500);
  expect(await saved()).toEqual({ status: 'valid', words: [text] });
});
