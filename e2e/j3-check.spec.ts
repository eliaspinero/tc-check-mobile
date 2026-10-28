import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { NEEDS_RIG, NEEDS_TC4_DIR, SAMPLE_PROJECT, addOrigin, commitAll, placeRepo, readIngredient, rigReposDir, rigUp, writeIngredient } from './helpers/rig';
import { openProject } from './helpers/session';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';

type Decision = { selections: unknown; nothingToSelect?: boolean; invalidated?: boolean; status?: string };
/** Decided as tC4 counts it (derive.ts isDecided): not invalidated, and selections, nothing-to-select or an Invalid status. */
const decidedIn = async (tool: string, book: string): Promise<number> => {
  const file = JSON.parse(await readIngredient(PROJECT, `checking/${tool}/${book}.json`)) as { decisions: Decision[] };
  return file.decisions.filter((d) => d.invalidated !== true && (d.selections !== false || d.nothingToSelect === true || d.status === 'invalid')).length;
};

test('j3: TIT tW lists its checks with progress that counts the stored decisions', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await expect(page.getByRole('heading', { name: 'Titus 1' })).toBeVisible();
  const progress = page.getByTestId('progress');
  await expect(progress).toHaveText(/^\d+ of \d+ checked$/);
  const [decided, total] = ((await progress.textContent()) ?? '').match(/\d+/g)!.map(Number);
  expect(decided).toBe(await decidedIn('translationWords', 'TIT'));
  expect(total).toBeGreaterThan(decided);
  // The list shows one chapter at a time: the chapters' rows add up to the book's total.
  let rows = 0;
  for (const chapter of [1, 2, 3]) {
    await page.getByRole('button', { name: /^Titus \d+$/ }).click();
    await page.getByRole('dialog', { name: 'Chapters' }).getByRole('button', { name: new RegExp(`^Chapter ${chapter}`) }).click();
    rows += await page.getByTestId('check-row').count();
  }
  expect(rows).toBe(total);
});

test('j3: TIT tN lists its checks too', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Notes' }).click();
  await expect(page.getByRole('heading', { name: 'Titus 1' })).toBeVisible();
  const [decided, total] = ((await page.getByTestId('progress').textContent()) ?? '').match(/\d+/g)!.map(Number);
  expect(decided).toBe(await decidedIn('translationNotes', 'TIT'));
  expect(total).toBeGreaterThan(0);
});

test('j3: the check screen highlights the quote in ULT and UST and the stored selection in the target', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await page.getByTestId('check-row').filter({ hasText: /^Diosof God(Checked)?$/ }).first().click();
  await expect(page.getByTestId('check-title')).toHaveText('Titus 1:1');
  await expect(page.getByTestId('check-header')).toHaveText(/^Words · \d+ \/ \d+$/);
  await page.getByTestId('help').getByRole('button').click();
  await expect(page.getByTestId('help-title')).toHaveText('Dios');
  await expect(page.getByTestId('help-body')).toContainText('Definición');
  await expect(page.getByTestId('help-body')).not.toContainText('#');
  for (const pane of ['ULT', 'UST']) {
    const hl = page.getByTestId(`pane-${pane}`).locator('[data-hl]');
    await expect(hl.first()).toBeVisible();
    expect((await hl.allTextContents()).join(' ')).toContain('God');
  }
  await expect(page.getByTestId('target').locator('[data-sel]')).toHaveText(['Dios']);
  await expect(page.getByTestId('target')).toContainText('Pablo, siervo de Dios y apóstol de Jesucristo,');
  await page.screenshot({ path: 'test-results/j3-check-screen.png', fullPage: true });
});

test('j3: Sync pulls Door43 main and the list shows the new decision', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  const repos = rigReposDir();
  test.skip(!repos, NEEDS_TC4_DIR);
  const upstream = 'qa.door43.org/checker1/sync_upstream';
  const project = 'qa.door43.org/checker1/sync_project';
  await placeRepo(SAMPLE_PROJECT, upstream);
  await placeRepo(SAMPLE_PROJECT, project);
  await addOrigin(project, pathToFileURL(`${repos}/${upstream}`).href);

  await openProject(page, context, 'sync_project');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  const before = Number(((await page.getByTestId('progress').textContent()) ?? '').match(/\d+/)![0]);

  // A teammate's decision lands on Door43 main: Paul in 1:1 (TWL row trr8) selected as "Pablo".
  const file = JSON.parse(await readIngredient(upstream, 'checking/translationWords/TIT.json')) as { decisions: Array<Record<string, unknown>> };
  const template = file.decisions[0] as { contextId: Record<string, unknown> };
  file.decisions.push({
    ...template,
    contextId: { ...template.contextId, checkId: 'trr8', groupId: 'paul', quote: 'Παῦλος', quoteString: 'Παῦλος', occurrence: 1 },
    category: 'names',
    selections: [{ text: 'Pablo', occurrence: 1, occurrences: 1 }],
    status: 'valid',
  });
  await writeIngredient(upstream, 'checking/translationWords/TIT.json', JSON.stringify(file, null, 2));
  await commitAll(upstream, 'teammate decision');

  await page.getByRole('button', { name: 'Sync' }).click();
  await expect(page.getByTestId("progress")).toHaveText(new RegExp(`^${before + 1} of [0-9]+ checked$`));
});
