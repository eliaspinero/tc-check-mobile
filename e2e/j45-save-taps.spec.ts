// Issue #45: the words tapped on a check are saved whatever the order of Valid, Invalid and tapping. As the Rust tC4
// does (STORAGE.md §5.4), a change of the words alone is saved 1 s after the last tap, or at once when the checker
// leaves the check (Next, Previous, Back) or the app goes to the background; the status stays as it was.
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { NEEDS_RIG, readIngredient, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';
import { changesOf, placeTcProject } from './helpers/journal';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';
type Decision = { contextId: { checkId: string }; selections: Array<{ text: string }> | false; nothingToSelect?: boolean; status?: string | null };
type Change = { device: string; record: { check?: { key: { checkId: string } } } };

let seeded: Set<string>;
// The app's requests to the shell still running: a save of the words outlives the tap that started it, and the next
// test's setup cannot delete a project the store or the server still has open (Windows).
let running = 0;
test.beforeEach(async ({ page }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeTcProject(PROJECT);
  seeded = new Set(((await changesOf(PROJECT)) as unknown as Change[]).map((c) => c.device));
  running = 0;
  const local = (url: string) => new URL(url).pathname.startsWith('/api/');
  page.on('request', (r) => void (local(r.url()) && running++));
  const done = (r: { url: () => string }) => void (local(r.url()) && running--);
  page.on('requestfinished', done);
  page.on('requestfailed', done);
});
test.afterEach(async () => {
  await expect.poll(() => running, { timeout: 10_000 }).toBe(0);
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

/** Open Titus Words and the first check of chapter 1 not decided yet; returns its row's place, to open it again
 * (several checks can share a label). */
const openUndecided = async (page: Page, context: BrowserContext): Promise<number> => {
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  const at = (await page.getByTestId('check-row').evaluateAll((rows) => rows.map((r) => r.textContent ?? ''))).findIndex((t) => !t.includes('Checked'));
  const row = page.getByTestId('check-row').nth(at);
  await row.click();
  await expect(page.getByTestId('check-screen')).toBeVisible();
  return at;
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
  const at = await openUndecided(page, context);
  await valid(page).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  const text = await textOf(page, 0);
  await word(page, 0).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByTestId('check-row').nth(at).click();
  await expect(word(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(saved).toEqual({ status: 'valid', words: [text] });
});

test('j45: Valid, a word, and the app closes at once: the word is saved and shows when the app opens again', async ({ page, context }) => {
  const at = await openUndecided(page, context);
  await valid(page).click();
  await expect(page.getByTestId('decided')).toHaveText('Valid');
  const text = await textOf(page, 0);
  await word(page, 0).click();
  await page.reload();
  await expect.poll(saved).toEqual({ status: 'valid', words: [text] });
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await page.getByTestId('check-row').nth(at).click();
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

test('j45 review: a word tapped and untapped on a check not decided leaves it not decided, never "nothing to select"', async ({ page, context }) => {
  await openUndecided(page, context);
  const text = await textOf(page, 0);
  await word(page, 0).click();
  await expect.poll(saved, { timeout: 5_000 }).toEqual({ status: null, words: [text] });
  await word(page, 0).click();
  await expect.poll(saved, { timeout: 5_000 }).toEqual({ status: null, words: [] });
  const [checkId] = await phoneCheckIds();
  expect((await decisionOf(checkId))?.nothingToSelect).toBe(false);
  await expect(page.getByTestId('decided')).toHaveCount(0);
});

test('j45 review: Valid and Invalid stay ready to tap while the words save', async ({ page, context }) => {
  await openUndecided(page, context);
  // A slow phone: each save takes a while.
  await page.route((url) => url.pathname.startsWith('/api/tc/decide/'), async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const text = await textOf(page, 0);
  await word(page, 0).click();
  await page.waitForTimeout(1300);
  // By their place, not their name: a button that is saving reads "Saving…". Read at this moment, while the words
  // are still on their way.
  const buttons = page.locator('.decide button');
  expect(await buttons.evaluateAll((bs) => bs.map((b) => [b.textContent, (b as HTMLButtonElement).disabled]))).toEqual([
    ['✕Invalid', false],
    ['✓Valid', false],
  ]);
  await valid(page).click();
  await expect.poll(saved, { timeout: 10_000 }).toEqual({ status: 'valid', words: [text] });
});
