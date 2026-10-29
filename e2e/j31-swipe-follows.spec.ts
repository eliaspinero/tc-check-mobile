// Issue #31: on the check screen the swipe follows the finger. Ways it can fail: nothing moves until the finger
// lifts; the edge stays empty instead of showing the next or previous check; a short swipe leaves the check off
// its place; a swipe past the first or last check slides to an empty screen; a vertical move drags instead of
// scrolling; a selection in the panes is lost; Previous and Next jump while the swipe slides; anything moves when
// the phone asks for reduced motion; a second swipe or a tap on Next made while a slide runs is lost.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';

const open = async (page: Page, context: BrowserContext, which: 'first' | 'last' = 'first') => {
  await placeRepo(SAMPLE_PROJECT, 'qa.door43.org/checker1/sample_burrito');
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  if (which === 'last') {
    await page.getByRole('button', { name: 'Titus 1' }).click();
    await page.getByRole('dialog', { name: 'Chapters' }).getByRole('button', { name: /^Chapter 3/ }).click();
    await page.getByTestId('verse').last().locator('summary').click();
  }
  await page.getByTestId('check-row')[which]().click();
  await expect(page.getByTestId('help')).toBeVisible();
  // The screen's own entrance (#30) is over, so what moves next is the swipe.
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
};

/** Where the check's content is: the left edge of its help. */
const helpX = async (page: Page) => Math.round((await page.getByTestId('help').boundingBox())!.x);
const at = (page: Page) => page.getByTestId('check-header');

/** A finger on the phone's screen, through Chrome's touch input, so the page scrolls as it does on a phone. */
const finger = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  let last = { x: 0, y: 0 };
  return {
    /** Puts the finger down at `from` of the screen's width and moves it to `to`, `dy` px down, without lifting it. */
    press: async (from: number, to: number, dy = 5) => {
      const vw = page.viewportSize()!.width;
      const y = 300;
      await touch('touchStart', vw * from, y);
      for (let i = 1; i <= 8; i++) await touch('touchMove', vw * (from + ((to - from) * i) / 8), y + (dy * i) / 8);
      last = { x: vw * to, y: y + dy };
    },
    lift: () => touch('touchEnd', last.x, last.y),
  };
};
const swipe = async (page: Page, from: number, to: number) => {
  const f = await finger(page);
  await f.press(from, to);
  await f.lift();
};
/** True while the check's content is sliding (a transition on the help or a box around it). */
const sliding = (page: Page) =>
  page.evaluate(() => {
    const help = document.querySelector('[data-testid="help"]')!;
    return document.getAnimations().some((a) => a instanceof CSSTransition && ((a.effect as KeyframeEffect).target as Element).contains(help));
  });

test.describe('with motion', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('j31: the check follows the finger, the next one shows at the edge, and a release past the threshold goes to it', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await open(page, context);
    const f = await finger(page);
    const rest = await helpX(page);
    await f.press(0.8, 0.5);
    expect(await helpX(page)).toBeLessThan(rest - 60);
    const peek = page.getByTestId('peek-next');
    const edge = (await peek.boundingBox())!;
    expect(edge.x).toBeLessThan(page.viewportSize()!.width);
    const shown = (await peek.textContent()) ?? '';
    await f.lift();
    await expect(at(page)).toHaveText(/ 2 \/ \d+$/);
    // The check that showed at the edge is the one now open, and it settles in its place.
    expect(shown).toContain(await page.getByTestId('check-title').textContent());
    await expect.poll(() => helpX(page)).toBe(rest);
  });

  test('j31: a swipe back shows the previous check at the edge and goes to it', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await open(page, context);
    const f = await finger(page);
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(at(page)).toHaveText(/ 2 \/ \d+$/);
    await expect.poll(() => sliding(page)).toBe(false);
    const rest = await helpX(page);
    await f.press(0.2, 0.5);
    expect(await helpX(page)).toBeGreaterThan(rest + 60);
    const edge = (await page.getByTestId('peek-prev').boundingBox())!;
    expect(edge.x + edge.width).toBeGreaterThan(0);
    await f.lift();
    await expect(at(page)).toHaveText(/ 1 \/ \d+$/);
    await expect.poll(() => helpX(page)).toBe(rest);
  });

  test('j31: a release short of the threshold slides the check back to its place', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await open(page, context);
    const f = await finger(page);
    const rest = await helpX(page);
    await f.press(0.6, 0.5);
    expect(await helpX(page)).toBeLessThan(rest - 20);
    await f.lift();
    expect(await sliding(page)).toBe(true);
    await expect.poll(() => helpX(page)).toBe(rest);
    await expect(at(page)).toHaveText(/ 1 \/ \d+$/);
  });

  test('j31: at the first and the last check the swipe moves a little and comes back, with no empty screen', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await open(page, context);
    const f = await finger(page);
    const rest = await helpX(page);
    await f.press(0.2, 0.8);
    const moved = (await helpX(page)) - rest;
    expect(moved).toBeGreaterThan(10);
    expect(moved).toBeLessThan(120);
    await expect(page.getByTestId('peek-prev')).toHaveCount(0);
    await f.lift();
    await expect.poll(() => helpX(page)).toBe(rest);
    await expect(at(page)).toHaveText(/ 1 \/ \d+$/);

    await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Titus 1' }).click();
    await page.getByRole('dialog', { name: 'Chapters' }).getByRole('button', { name: /^Chapter 3/ }).click();
    await page.getByTestId('verse').last().locator('summary').click();
    await page.getByTestId('check-row').last().click();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    const header = (await at(page).textContent()) ?? '';
    await f.press(0.8, 0.2);
    const back = rest - (await helpX(page));
    expect(back).toBeGreaterThan(10);
    expect(back).toBeLessThan(120);
    await expect(page.getByTestId('peek-next')).toHaveCount(0);
    await f.lift();
    await expect.poll(() => helpX(page)).toBe(rest);
    await expect(at(page)).toHaveText(header);
  });

  test('j31: a vertical move scrolls and does not drag the check', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await open(page, context);
    // The help open makes the screen taller than the phone.
    await page.locator('.help-toggle').click();
    const rest = await helpX(page);
    const f = await finger(page);
    await f.press(0.5, 0.45, -250);
    expect(await helpX(page)).toBe(rest);
    await f.lift();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await expect(at(page)).toHaveText(/ 1 \/ \d+$/);
    expect(await helpX(page)).toBe(rest);
  });

  test('j31: a word in the panes can still be selected', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await open(page, context);
    const rest = await helpX(page);
    await page.getByTestId('pane-ULT').locator('span').nth(2).dblclick();
    expect(await page.evaluate(() => getSelection()!.toString().trim().length)).toBeGreaterThan(0);
    await expect(at(page)).toHaveText(/ 1 \/ \d+$/);
    expect(await helpX(page)).toBe(rest);
  });

  test('j31: with a mouse, a sideways drag over the panes still selects text', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await open(page, context);
    const rest = await helpX(page);
    const word = (await page.getByTestId('pane-ULT').locator('span').nth(4).boundingBox())!;
    await page.mouse.move(word.x + word.width - 2, word.y + word.height / 2);
    await page.mouse.down();
    await page.mouse.move(word.x - 40, word.y + word.height / 2, { steps: 6 });
    // The content stays where it is while the mouse selects.
    expect(await helpX(page)).toBe(rest);
    await page.mouse.up();
    expect(await page.evaluate(() => getSelection()!.toString().trim().length)).toBeGreaterThan(0);
  });

  test('j31: the check left behind shows its verse and words as it slides out', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await open(page, context);
    const title = (await page.getByTestId('check-title').textContent())!;
    await swipe(page, 0.8, 0.3);
    await expect(at(page)).toHaveText(/ 2 \/ \d+$/);
    // While the new check slides in, the old one is the previous peek, and its title is on screen.
    const left = page.getByTestId('peek-prev').locator('.help-title');
    await expect(left).toHaveText(title);
    // The text itself, not its box: the end of the title is on screen.
    const textEnd = await left.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().right;
    });
    expect(textEnd).toBeGreaterThan(8);
  });

  test('j31: Previous and Next use the same slide, timed by the tC4 tokens', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await open(page, context);
    const rest = await helpX(page);
    await page.getByRole('button', { name: /^Next/ }).click();
    expect(await helpX(page)).toBeGreaterThan(rest);
    const timing = await page.getByTestId('help').evaluate((el) => {
      const s = getComputedStyle(el.parentElement!);
      return [s.transitionProperty, s.transitionDuration, s.transitionTimingFunction];
    });
    expect(timing).toEqual(['transform', '0.24s', 'cubic-bezier(0.2, 0, 0.2, 1)']);
    await expect.poll(() => helpX(page)).toBe(rest);
    await page.getByRole('button', { name: /Previous/ }).click();
    expect(await helpX(page)).toBeLessThan(rest);
    await expect(at(page)).toHaveText(/ 1 \/ \d+$/);
    await expect.poll(() => helpX(page)).toBe(rest);
  });

  test('j31: a second swipe or a tap on Next while the check slides is not lost', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await open(page, context);
    await swipe(page, 0.8, 0.2);
    expect(await sliding(page)).toBe(true);
    await swipe(page, 0.8, 0.2);
    await expect(at(page)).toHaveText(/ 3 \/ \d+$/);
    expect(await sliding(page)).toBe(true);
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(at(page)).toHaveText(/ 4 \/ \d+$/);
  });
});

test('j31: with reduced motion the swipe changes the check at once and nothing moves', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await open(page, context);
  const f = await finger(page);
  const rest = await helpX(page);
  await f.press(0.8, 0.3);
  expect(await helpX(page)).toBe(rest);
  await f.lift();
  await expect(at(page)).toHaveText(/ 2 \/ \d+$/);
  expect(await helpX(page)).toBe(rest);
  await page.getByRole('button', { name: /Previous/ }).click();
  await expect(at(page)).toHaveText(/ 1 \/ \d+$/);
  expect(await helpX(page)).toBe(rest);
  expect(await sliding(page)).toBe(false);
});
