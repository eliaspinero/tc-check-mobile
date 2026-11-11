// Issue #57: on Android 15 the app is drawn edge to edge, under the status bar and the navigation bar, and the WebView
// reports 0 for env(safe-area-inset-*). The shell passes the bars' sizes to the page instead (shell/android/MainActivity.kt,
// as window.tcSystemBars and a `tc-system-bars` event); this journey plays that bridge. Ways it can fail: a screen's title,
// Back or last control drawn under the status bar; Valid, Invalid, Next or Previous under the navigation bar, where the
// system takes the taps; the chapter sheet's last row under it; the top bar's colour not reaching the top of the screen
// (the status bar would show a strip of another colour); a change of the bars' sizes (the phone turned, the navigation
// mode changed) not followed; Back smaller than Android's 48 dp touch target; the start-up skeleton, a screen with no top
// bar, under the status bar.
import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, SAMPLE_PROJECT, placeRepo, rigUp } from './helpers/rig';
import { QA_SERVER, fakeDoor43 } from './helpers/fakeDoor43';
import { fakeTauri } from './helpers/fakeTauri';
import { USER, openProject } from './helpers/session';
import { placeTcProject } from './helpers/journal';

const PROJECT = 'qa.door43.org/checker1/sample_burrito';
const HEIGHT = 812;
// A Pixel 7 on Android 15: the status bar, and the three-button navigation bar (the taller of the two modes).
const BARS = { top: 24, bottom: 48 };

test.use({ viewport: { width: 375, height: HEIGHT } });

/** The shell's bridge, as MainActivity.kt exposes it, with the sizes the next `tc-system-bars` event will report. */
const playBridge = async (context: BrowserContext, bars: typeof BARS) => {
  await context.addInitScript((initial) => {
    const now = { ...initial };
    Object.assign(window, {
      tcSystemBars: { insets: () => JSON.stringify(now) },
      __setSystemBars: (next: typeof initial) => Object.assign(now, next),
    });
  }, bars);
};

const box = async (locator: Locator) => (await locator.boundingBox())!;

/** Where the top bar's content starts: its highest child. */
const bannerContentTop = (page: Page) => page.getByRole('banner').evaluate((el) => Math.min(...[...el.children].map((c) => c.getBoundingClientRect().top)));

/** Nothing of the top bar's content is under the status bar, and its ground runs up behind it. */
const clearOfStatusBar = async (page: Page) => {
  expect(Math.round((await box(page.getByRole('banner'))).y)).toBe(0);
  expect(await bannerContentTop(page)).toBeGreaterThanOrEqual(BARS.top);
};

/** The screen's content, scrolled to the end, ends above the navigation bar. */
const endClearOfNavigationBar = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const end = await page
    .locator('main.screen')
    .evaluate((el) => Math.max(...[...el.children].map((c) => c.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.bottom)));
  expect(end).toBeLessThanOrEqual(HEIGHT - BARS.bottom);
};

const back = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Back' });

test('j57: projects, books and the check list keep their content clear of the system bars, and Back is 48 dp', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await playBridge(context, BARS);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');

  // The books.
  await expect(page.getByRole('button', { name: 'Titus Words' })).toBeVisible();
  await clearOfStatusBar(page);
  await endClearOfNavigationBar(page);
  const b = await box(back(page));
  expect(b.width).toBeGreaterThanOrEqual(48);
  expect(b.height).toBeGreaterThanOrEqual(48);
  expect(b.y).toBeGreaterThanOrEqual(BARS.top);

  // The projects.
  await back(page).click();
  await expect(page.getByRole('button', { name: /^sample_burrito/ })).toBeVisible();
  await clearOfStatusBar(page);
  await endClearOfNavigationBar(page);

  // The check list, and its chapter sheet.
  await page.getByRole('button', { name: /^sample_burrito/ }).click();
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await expect(page.getByTestId('check-row').first()).toBeVisible();
  await clearOfStatusBar(page);
  await endClearOfNavigationBar(page);
  await page.getByRole('banner').locator('.title-button').click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toBeVisible();
  await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const lastChapter = await box(sheet.locator('button.chapter').last());
  expect(lastChapter.y + lastChapter.height).toBeLessThanOrEqual(HEIGHT - BARS.bottom);
});

test('j57: the check screen keeps Valid, Invalid, Next and Previous clear of the navigation bar, and follows a change of the bars', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await playBridge(context, BARS);
  // A project that takes decisions, so Valid and Invalid show.
  await placeTcProject(PROJECT);
  await openProject(page, context, 'sample_burrito');
  await page.getByRole('button', { name: 'Titus Words' }).click();
  await page.getByTestId('check-row').filter({ hasNotText: 'Checked' }).nth(1).click();
  await expect(page.getByTestId('target')).toBeVisible();
  await clearOfStatusBar(page);

  const bottomOf = async (name: RegExp) => {
    const b = await box(page.getByTestId('decide-bar').getByRole('button', { name }));
    return Math.round(b.y + b.height);
  };
  const controls = (bars: typeof BARS) =>
    Promise.all([/^Valid$/, /^Invalid$/, /Next/, /Previous/].map(async (name) => expect(await bottomOf(name), String(name)).toBeLessThanOrEqual(HEIGHT - bars.bottom)));
  await controls(BARS);
  // The bar's Ocean ground still runs to the bottom of the screen, behind the navigation bar.
  const bar = await box(page.getByTestId('decide-bar'));
  expect(Math.round(bar.y + bar.height)).toBe(HEIGHT);

  // Gesture navigation: a thinner bar at the bottom. The shell reports it and fires the event; the buttons move down
  // by the difference, so no room is wasted either.
  const before = await bottomOf(/^Valid$/);
  const gestures = { ...BARS, bottom: 16 };
  await page.evaluate((next) => {
    (window as unknown as { __setSystemBars: (b: typeof next) => void }).__setSystemBars(next);
    window.dispatchEvent(new Event('tc-system-bars'));
  }, gestures);
  await expect.poll(() => bottomOf(/^Valid$/)).toBe(before + BARS.bottom - gestures.bottom);
  await controls(gestures);
});

test('j57: outside the Android shell nothing changes: no bridge, no room kept for bars', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  await openProject(page, context, 'sample_burrito');
  await expect(page.getByRole('button', { name: 'Titus Words' })).toBeVisible();
  expect(await bannerContentTop(page)).toBeLessThan(BARS.top);
});

test('j57: the start-up skeleton, which has no top bar, starts below the status bar', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await playBridge(context, BARS);
  await placeRepo(SAMPLE_PROJECT, PROJECT);
  const tauri = await fakeTauri(context);
  await fakeDoor43(context, { user: USER, repos: [{ owner: USER.username, name: 'sample_burrito' }] });
  await page.goto(CLIENT_URL);
  await page.getByLabel('Username or email').fill(USER.username);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();

  // Opened again with a token kept without its username (kept before #44): Door43 takes a moment to say whose it is,
  // and the skeleton shows meanwhile.
  tauri.kept.delete('session');
  await context.route(`${QA_SERVER}/api/v1/user`, async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.fallback();
  });
  await page.reload();
  const skeleton = page.locator('main.screen > :first-child');
  await expect(skeleton).toBeVisible();
  expect((await box(skeleton)).y).toBeGreaterThanOrEqual(BARS.top);
});