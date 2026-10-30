// Issue #30: the app moves as tC4 moves. Ways it can fail: a load that still shows one line of text instead
// of a skeleton, or a skeleton a screen reader cannot hear; rows that all appear at once, or a long list
// whose last rows make the checker wait; a screen that jumps instead of sliding, or a slide that swallows
// a quick second tap; a panel that jumps open; an animated colour, width or height
// (janky on a mid-range Android phone), or a duration typed instead of a tC4 token; anything moving when
// the phone asks for reduced motion; an animation library. The source checks need no browser.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_URL, NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { fakeDoor43, QA_SERVER } from './helpers/fakeDoor43';
import { fakeTauri } from './helpers/fakeTauri';
import { USER, openProject } from './helpers/session';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = path.join(ROOT, 'client', 'src');
// tC4's own tokens are copied as they are; the app's stylesheets are checked.
const sheets = () =>
  (fs.readdirSync(SRC, { recursive: true }) as string[])
    .filter((name) => name.endsWith('.css') && !name.startsWith(`ds${path.sep}`))
    .map((name) => ({ name, text: fs.readFileSync(path.join(SRC, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));

test('j30: the journeys run with reduced motion', async ({ page }) => {
  await page.goto(CLIENT_URL);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
});

test('j30: only transform and opacity animate, timed by tC4 motion tokens, with no animation library', async () => {
  const offences: string[] = [];
  for (const { name, text } of sheets()) {
    for (const [, kf, body] of text.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g))
      for (const [, prop] of body.matchAll(/([\w-]+)\s*:/g)) if (!['transform', 'opacity'].includes(prop)) offences.push(`${name}: @keyframes ${kf} animates ${prop}`);
    for (const [, value] of text.matchAll(/transition(?:-property)?\s*:\s*([^;}]+)/g))
      for (const part of value.split(','))
        // display, content-visibility and overlay do not move: with allow-discrete they only keep a closing element
        // drawn until its fade ends (#42).
        if (!/^\s*(transform|opacity|none)\b/.test(part) && !/^\s*(display|content-visibility|overlay)\b.*\ballow-discrete\b/.test(part))
          offences.push(`${name}: transition ${part.trim()}`);
    for (const [decl, value] of text.matchAll(/(?:animation|transition)(?:-[\w-]+)?\s*:\s*([^;}]+)/g)) {
      const literal = value.replace(/var\(--[\w-]+(?:\s*,[^)]*)?\)/g, '');
      if (/\d*\.?\d+m?s\b|cubic-bezier|steps\(|\b(?:ease|ease-in|ease-out|ease-in-out|linear)\b/.test(literal)) offences.push(`${name}: ${decl.trim()}`);
    }
  }
  expect(offences, 'Animate only transform and opacity (display, content-visibility and overlay only with allow-discrete), with var(--dur-*), var(--ease-standard) and var(--stagger) from client/src/ds/tokens/motion.css').toEqual([]);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Record<string, Record<string, string>>;
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const libraries = ['framer-motion', 'motion', 'react-spring', '@react-spring/web', 'gsap', 'animejs', 'react-transition-group', '@formkit/auto-animate', 'popmotion'];
  expect(deps.filter((d) => libraries.includes(d))).toEqual([]);
});

/** A route that answers only once `open()` is called: the load it serves stays in `loading` meanwhile. */
const hold = async (page: Page, match: (url: string) => boolean) => {
  let open = () => {};
  const gate = new Promise<void>((r) => (open = r));
  await page.route((u) => match(u.href), async (route) => {
    await gate;
    await route.fallback();
  });
  return () => open();
};

/** The skeleton on screen in place of the content, telling a screen reader what is loading. */
const expectSkeleton = async (page: Page, text: string) => {
  const status = page.getByRole('status').filter({ hasText: text });
  await expect(status).toBeVisible({ timeout: 15_000 });
  await expect(status).toHaveAttribute('data-testid', 'skeleton');
  expect(await status.locator('.bone').count()).toBeGreaterThan(2);
  await expect(page.locator('p.muted').filter({ hasText: text })).toHaveCount(0);
};

const signIn = async (page: Page, context: BrowserContext, repos: string[] = ['sample_burrito']) => {
  await fakeDoor43(context, { user: USER, repos: repos.map((name) => ({ owner: USER.username, name })) });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

const openBooks = async (page: Page, context: BrowserContext) => {
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await expect(page.getByRole('button', { name: /^Titus Words/ })).toBeVisible();
};

const openList = async (page: Page, context: BrowserContext) => {
  await openBooks(page, context);
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
};

test.describe('skeletons', () => {
  test('j30: restoring a kept sign-in shows a skeleton that says it is signing in', async ({ page, context }) => {
    await fakeTauri(context);
    await signIn(page, context);
    await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
    const open = await hold(page, (u) => u === `${QA_SERVER}/api/v1/user`);
    await page.reload();
    await expectSkeleton(page, 'Signing you in…');
    open();
    await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
    await expect(page.getByTestId('skeleton')).toHaveCount(0);
  });

  test('j30: the project list shows a skeleton while Door43 lists the projects', async ({ page, context }) => {
    const open = await hold(page, (u) => u.startsWith(`${QA_SERVER}/api/v1/user/repos`));
    await signIn(page, context);
    await expectSkeleton(page, 'Loading your projects…');
    open();
    await expect(page.getByRole('button', { name: /^sample_burrito/ })).toBeVisible();
    await expect(page.getByTestId('skeleton')).toHaveCount(0);
  });

  test('j30: the resources screen shows a skeleton while it reads what the project needs', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await placeRepo(SAMPLE_PROJECT, PROJECT);
    // The project list reads resources.json once to open the project; the resources screen reads it again.
    let reads = 0;
    let open = () => {};
    const gate = new Promise<void>((r) => (open = r));
    await page.route(
      (u) => u.href.includes('resources.json'),
      async (route) => {
        if (++reads > 1) await gate;
        await route.fallback();
      },
    );
    await openProject(page, context, 'sample_burrito');
    await expectSkeleton(page, 'Reading the resources this project needs…');
    open();
    await expect(page.getByRole('button', { name: /^Titus Words/ })).toBeVisible({ timeout: 30_000 });
  });

  test('j30: the book picker shows a skeleton while it reads the project', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await placeRepo(SAMPLE_PROJECT, PROJECT);
    // The resources screen reads the resources' metadata; the book picker reads the project's.
    const open = await hold(page, (u) => u.endsWith(`/api/burrito/metadata/raw/${PROJECT}`));
    await openProject(page, context, 'sample_burrito');
    await expectSkeleton(page, 'Loading the books…');
    open();
    await expect(page.getByRole('button', { name: /^Titus Words/ })).toBeVisible();
  });

  test('j30: the check list shows a skeleton while it loads the checks', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openBooks(page, context);
    const open = await hold(page, (u) => u.includes('/api/burrito/'));
    await page.getByRole('button', { name: /^Titus Words/ }).click();
    await expectSkeleton(page, 'Loading the checks…');
    open();
    await expect(page.getByTestId('check-row').first()).toBeVisible({ timeout: 30_000 });
  });

  test('j30: the check screen shows a skeleton while it reads the sources', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openList(page, context);
    const open = await hold(page, (u) => u.includes('/api/burrito/'));
    await page.getByTestId('check-row').first().click();
    await expectSkeleton(page, 'Loading the check…');
    open();
    await expect(page.getByTestId('target')).toContainText('Pablo, siervo de Dios', { timeout: 30_000 });
  });
});

/** Each element's animation name and delay in ms. */
const motionOf = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) => els.map((el) => [getComputedStyle(el).animationName, Math.round(parseFloat(getComputedStyle(el).animationDelay) * 1000)]));
/** Row i waits i × --stagger (70 ms), up to the eighth row; the rows after it enter with the eighth. */
const staggered = (count: number) => Array.from({ length: count }, (_, i) => ['rise', Math.min(i, 7) * 70]);

/** How the screen on view came in: the animation of the screen, or on the check screen of its content (its
 * fixed bottom bar cannot move with it). */
const entrance = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector('#root > main')!;
    const el = main.classList.contains('check') ? main.querySelector(':scope > :not(.bottombar)')! : main;
    return getComputedStyle(el).animationName;
  });
test.describe('with motion', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('j30: project rows enter top to bottom, and only the first eight wait for the one above', async ({ page, context }) => {
    const repos = Array.from({ length: 11 }, (_, i) => `project_${String(i + 1).padStart(2, '0')}`);
    await signIn(page, context, repos);
    await expect(page.getByRole('button', { name: /^project_11/ })).toBeVisible();
    expect(await motionOf(page, 'button.project')).toEqual(staggered(11));
  });

  test('j30: books, verses and checks enter top to bottom, and a Sync does not make them enter again', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openBooks(page, context);
    expect(await motionOf(page, '.book')).toEqual(staggered(await page.locator('.book').count()));
    await page.getByRole('button', { name: /^Titus Words/ }).click();
    await expect(page.getByTestId('check-row').first()).toBeVisible();
    const verses = await page.getByTestId('verse').count();
    expect(verses).toBeGreaterThan(8);
    expect(await motionOf(page, '[data-testid="verse"]')).toEqual(staggered(verses));
    const open = page.locator('[data-testid="verse"][open] [data-testid="check-row"]');
    expect(await motionOf(page, '[data-testid="verse"][open] [data-testid="check-row"]')).toEqual(staggered(await open.count()));
    // Rows kept across a Sync keep their place on screen: they do not fade in again.
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.route('**/api/git/pull-repo/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"is_good":true}' }));
    await page.getByRole('button', { name: 'Sync' }).click();
    await expect(page.getByRole('button', { name: 'Sync' })).toBeEnabled();
    await expect(page.getByTestId('check-row').first()).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().map((a) => (a.effect as KeyframeEffect).target?.className))).toEqual([]);
  });

  test('j30: going into a screen slides forward and Back slides back; Next does not', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openBooks(page, context);
    expect(await entrance(page)).toBe('enter-from-end');
    await page.getByRole('button', { name: /^Titus Words/ }).click();
    await expect(page.getByTestId('check-row').first()).toBeVisible();
    expect(await entrance(page)).toBe('enter-from-end');
    await page.getByTestId('check-row').first().click();
    await expect(page.getByTestId('check-title')).toBeVisible();
    expect(await entrance(page)).toBe('enter-from-end');
    // Next moves within the check screen: its content slides (j31), and the screen does not come in again.
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page.getByTestId('check-header')).toContainText('2 /');
    expect(await page.evaluate(() => document.getAnimations().map((a) => (a as CSSAnimation).animationName ?? '').filter((n) => n.startsWith('enter-')))).toEqual([]);
    await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Titus 1' })).toBeVisible();
    expect(await entrance(page)).toBe('enter-from-start');
  });

  test('j30: a tap while a screen slides in still works: two quick Backs go up two levels', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openList(page, context);
    await page.getByTestId('check-row').first().click();
    await expect(page.getByTestId('check-title')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    const back = (await page.getByRole('banner').getByRole('button', { name: 'Back' }).boundingBox())!;
    const tap = async () => {
      await page.mouse.move(back.x + back.width / 2, back.y + back.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(60);
      await page.mouse.up();
    };
    await tap();
    await page.waitForTimeout(90);
    await tap();
    await expect(page.getByRole('heading', { name: 'Choose a book' })).toBeVisible();
  });
  test('j30: the chapter sheet slides up, a verse and the help open smoothly', async ({ page, context }) => {
    test.skip(!(await rigUp()), NEEDS_RIG);
    await openList(page, context);
    await page.getByRole('button', { name: /^Titus 1/ }).click();
    expect(await motionOf(page, '.sheet')).toEqual([['sheet-up', 0]]);
    expect(await motionOf(page, '.sheet-backdrop')).toEqual([['fade', 0]]);
    await page.keyboard.press('Escape');
    // A closed verse's checks rise in as it opens.
    const closed = page.locator('[data-testid="verse"]:not([open])').first();
    expect((await motionOf(page, '[data-testid="verse"]:not([open]) [data-testid="check-row"]'))[0][0]).toBe('none');
    await closed.locator('summary').click();
    await expect(page.locator('[data-testid="verse"][open]')).toHaveCount(2);
    const opened = await page.locator('[data-testid="verse"][open]').nth(1).getByTestId('check-row').evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
    expect(opened.every((n) => n === 'rise')).toBe(true);
    // The help's text fades in closed, and rises in as it opens and as it closes again.
    await page.getByTestId('check-row').first().click();
    const body = page.getByTestId('help-body');
    await expect(body).toBeVisible();
    expect(await motionOf(page, '[data-testid="help-body"]')).toEqual([['fade', 0]]);
    await page.locator('.help-toggle').click();
    expect(await motionOf(page, '[data-testid="help-body"]')).toEqual([['rise', 0]]);
    expect(await body.evaluate((el) => el.getAnimations().length)).toBe(1);
    await page.locator('.help-toggle').click();
    expect(await motionOf(page, '[data-testid="help-body"]')).toEqual([['fade', 0]]);
    expect(await body.evaluate((el) => el.getAnimations().length)).toBe(1);
  });
});

/** Nothing on the page animates or transitions. */
const still = (page: Page) =>
  page.evaluate(() => ({
    animations: document.getAnimations().length,
    moving: [...document.querySelectorAll('*')]
      .filter((el) => {
        const s = getComputedStyle(el);
        return s.animationName !== 'none' || s.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
      })
      .map((el) => el.className),
  }));

test('j30: with reduced motion nothing moves, and no screen slides in', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await openBooks(page, context);
  expect(await still(page)).toEqual({ animations: 0, moving: [] });
  await page.getByRole('button', { name: /^Titus Words/ }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  expect(await still(page)).toEqual({ animations: 0, moving: [] });
  await page.getByRole('button', { name: /^Titus 1/ }).click();
  expect(await still(page)).toEqual({ animations: 0, moving: [] });
  await page.keyboard.press('Escape');
  await page.getByTestId('check-row').first().click();
  await page.locator('.help-toggle').click();
  await expect(page.getByTestId('help-body')).toBeVisible();
  expect(await still(page)).toEqual({ animations: 0, moving: [] });
  await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  expect(await still(page)).toEqual({ animations: 0, moving: [] });
});
