// Issue #42: smoother motion. Ways it can fail: the old screen still vanishes at once on a screen change, or it
// slides all the way out instead of a little; it covers the new screen, takes its taps, or a screen reader still
// reads it; its sticky top bar jumps to the top of the page on a scrolled list; the old check still leaves as its
// peek card instead of whole; a decision's colour or the bar's edge still changes at once; a verse or the chapter
// sheet still closes at once; anything of this moves under reduced motion.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';
import { placeJournaledProject } from './helpers/journal';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';

const settle = (page: Page) => expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);

const openList = async (page: Page, context: BrowserContext) => {
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  await settle(page);
};

const openCheck = async (page: Page, context: BrowserContext) => {
  await openList(page, context);
  await page.getByTestId('check-row').first().click();
  await expect(page.getByTestId('help')).toBeVisible();
  await settle(page);
};

/** The screen that is leaving: a still copy under the new screen. */
const leaving = (page: Page) => page.locator('body > .leaving');

/** Holds the leaving copy's move where it is, or lets it go on. */
const pause = (page: Page) => page.evaluate(() => document.querySelector('body > .leaving')?.getAnimations().forEach((a) => a.pause()));
const play = (page: Page) => page.evaluate(() => document.querySelector('body > .leaving')?.getAnimations().forEach((a) => a.play()));

/** Every transition that starts from now on, as [class of its element, pseudo-element, property]. */
const watchTransitions = (page: Page) =>
  page.evaluate(() => {
    const seen: string[][] = [];
    (window as unknown as { seen: string[][] }).seen = seen;
    document.addEventListener('transitionrun', (e) => seen.push([(e.target as Element).className, e.pseudoElement, e.propertyName]));
  });
const transitions = (page: Page) => page.evaluate(() => (window as unknown as { seen: string[][] }).seen);

/** A finger on the phone's screen, through Chrome's touch input (as j31). */
const swipe = async (page: Page, from: number, to: number) => {
  const cdp = await page.context().newCDPSession(page);
  const vw = page.viewportSize()!.width;
  const y = 300;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: vw * from, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: vw * (from + ((to - from) * i) / 8), y: y + i }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

test.describe('with motion', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('j42: on a screen change the old screen shifts a little and fades under the new one, then goes', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openList(page, context);
    const rows = await page.getByTestId('check-row').count();
    await page.getByTestId('check-row').first().click();
    // The copy leaves in 200 ms: held still while it is read, then let go.
    await pause(page);
    const old = leaving(page);
    await expect(old).toHaveCount(1);
    // A still copy of the list: its rows, no test ids, out of reach of taps, the keyboard and screen readers.
    expect(await old.locator('.check-row').count()).toBe(rows);
    expect(await old.locator('[data-testid]').count()).toBe(0);
    expect(await old.evaluate((el) => [(el as HTMLElement).inert, el.getAttribute('aria-hidden')])).toEqual([true, 'true']);
    await expect(page.getByRole('banner')).toHaveCount(1);
    // It moves toward the start, only part of the way, and fades out; the new screen is drawn over it.
    const exit = await old.evaluate((el) =>
      el.getAnimations({ subtree: true }).map((a) => {
        const frames = (a.effect as KeyframeEffect).getKeyframes();
        const end = frames[frames.length - 1];
        return { name: (a as CSSAnimation).animationName, opacity: end.opacity, shift: new DOMMatrixReadOnly(String(end.transform)).m41 };
      }),
    );
    expect(exit.map((a) => a.name)).toEqual(['exit-to-start']);
    expect(exit[0].opacity).toBe('0');
    const shift = exit[0].shift;
    expect(shift).toBeLessThan(0);
    expect(-shift).toBeLessThan(page.viewportSize()!.width / 4);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#root > main')!).zIndex)).not.toBe('auto');
    await play(page);
    await expect(old).toHaveCount(0);
    // Back: the check screen leaves toward the end.
    await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
    await pause(page);
    expect(await leaving(page).evaluate((el) => el.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName))).toContain('exit-to-end');
    await play(page);
    await expect(leaving(page)).toHaveCount(0);
  });

  test('j42: the leaving copy of a scrolled screen keeps its top bar in view', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openList(page, context);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
    await page.locator('[data-testid="verse"][open] [data-testid="check-row"]').last().click();
    await pause(page);
    // The copy is scrolled as the list was when the row was tapped.
    expect(await leaving(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    const bar = (await leaving(page).locator('header.topbar').boundingBox())!;
    expect(Math.round(bar.y)).toBe(0);
  });

  test('j42: a tap while the old screen leaves reaches the new screen', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openList(page, context);
    await page.getByTestId('check-row').first().click();
    await expect(leaving(page)).toHaveCount(1);
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page.getByTestId('check-header')).toContainText('2 /');
  });

  test('j42: a swipe lets the old check leave whole, with its panes, while the new one slides in', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openCheck(page, context);
    const verse = (await page.getByTestId('pane-ULT').textContent())!;
    await swipe(page, 0.8, 0.3);
    await expect(page.getByTestId('check-header')).toContainText('2 /');
    const slot = page.locator('.leaving-slot');
    // The old check, panes and all, as a still copy where the previous check waits.
    await expect(slot.locator('.pane').first()).toBeAttached();
    expect(await slot.evaluate((el) => [(el as HTMLElement).inert, el.getAttribute('aria-hidden')])).toEqual([true, 'true']);
    expect(await slot.locator('[data-testid]').count()).toBe(0);
    expect(await slot.locator('.pane').allTextContents()).toContain(verse);
    // Its text is on screen as it goes, and no peek card shows in its place.
    const right = await slot.evaluate((el) => el.getBoundingClientRect().right);
    expect(right).toBeGreaterThan(8);
    await expect(page.getByTestId('peek-prev')).toBeHidden();
    await expect(slot.locator('.pane')).toHaveCount(0);
  });

  test('j42: Next lets the old check leave whole too', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openCheck(page, context);
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page.locator('.leaving-slot .pane').first()).toBeAttached();
    await expect(page.locator('.leaving-slot .pane')).toHaveCount(0);
    await page.getByRole('button', { name: /Previous/ }).click();
    await expect(page.locator('.leaving-slot.next .pane').first()).toBeAttached();
  });

  test('j42: a decision fades its button and the bar edge in, through opacity alone', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await placeJournaledProject(PROJECT);
    await openProject(page, context, 'sample_burrito');
    await page.getByRole('button', { name: 'Titus Words' }).click();
    await page.getByTestId('check-row').filter({ hasNotText: 'Checked' }).first().click();
    await expect(page.getByTestId('help')).toBeVisible();
    await settle(page);
    const valid = page.getByRole('button', { name: 'Valid', exact: true });
    const fill = await valid.evaluate((el) => getComputedStyle(el).backgroundColor);
    await watchTransitions(page);
    await valid.click();
    await expect(valid).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => transitions(page)).toEqual(expect.arrayContaining([['valid', '::before', 'opacity'], ['bottombar', '::before', 'opacity']]));
    // The colour comes from the layer: the button's own fill and the bar's edge do not change.
    expect(await valid.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(fill);
    expect(await page.getByTestId('decide-bar').evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
    expect((await transitions(page)).filter(([, , prop]) => prop !== 'opacity' && prop !== 'transform')).toEqual([]);
  });

  test('j42: the chapter sheet and a verse fade out as they close', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openList(page, context);
    await page.getByRole('button', { name: /^Titus 1/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Chapters' });
    await expect(sheet).toBeVisible();
    await settle(page);
    await watchTransitions(page);
    await sheet.getByRole('button', { name: 'Close' }).click();
    // Still drawn while it fades, then gone; the focus is back on the title.
    expect(await page.locator('.sheet-backdrop').evaluate((el) => getComputedStyle(el).display)).toBe('flex');
    await expect(sheet).toBeHidden();
    expect(await transitions(page)).toEqual(expect.arrayContaining([['sheet-backdrop', '', 'opacity']]));
    await expect(page.getByRole('button', { name: /^Titus 1/ })).toBeFocused();
    await settle(page);
    // Chromium shows no transition event or animation for ::details-content, so read its opacity each frame as the
    // verse closes: it passes through values between shown and gone.
    const opacities = await page.locator('[data-testid="verse"][open]').evaluate(async (verse) => {
      const seen: number[] = [];
      verse.querySelector('summary')!.click();
      const end = performance.now() + 400;
      while (performance.now() < end) {
        seen.push(Number(getComputedStyle(verse, '::details-content').opacity));
        await new Promise(requestAnimationFrame);
      }
      return seen;
    });
    await expect(page.locator('[data-testid="verse"][open]')).toHaveCount(0);
    expect(opacities.some((o) => o > 0.05 && o < 0.95)).toBe(true);
    expect(opacities[opacities.length - 1]).toBe(0);
  });
});

test('j42: with reduced motion no copy of the old screen or check is drawn', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openCheck(page, context);
  await expect(leaving(page)).toHaveCount(0);
  await page.getByRole('button', { name: /^Next/ }).click();
  await expect(page.getByTestId('check-header')).toContainText('2 /');
  expect(await page.locator('.leaving-slot').evaluate((el) => el.childElementCount)).toBe(0);
  await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  await expect(leaving(page)).toHaveCount(0);
});
