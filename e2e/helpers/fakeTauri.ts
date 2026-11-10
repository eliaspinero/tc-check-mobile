// A fake Tauri bridge for the journeys: window.__TAURI_INTERNALS__.invoke answers the shell's three
// token commands from a store that lives in the test process, so a kept token survives a reload,
// as it survives an app restart on the phone. It also stands for Android's Back (#58): the app plugin's
// `back-button` listeners are kept in the page, and pressBack sends them the event as the shell does.
import type { BrowserContext, Page } from '@playwright/test';

export const fakeTauri = async (context: BrowserContext): Promise<{ token: () => string | null }> => {
  let token: string | null = null;
  await context.exposeFunction('__fakeTauriInvoke', (cmd: string, args?: { token?: string }) => {
    if (cmd === 'token_keep') token = args?.token ?? null;
    else if (cmd === 'token_forget') token = null;
    else if (cmd === 'token_read') return token;
    else throw new Error(`fake Tauri has no command ${cmd}`);
    return null;
  });
  await context.addInitScript(() => {
    type Callback = (raw: unknown) => void;
    const w = window as unknown as {
      __TAURI_INTERNALS__: unknown;
      __fakeTauriInvoke: (c: string, a?: unknown) => Promise<unknown>;
      __fakeTauriCallbacks: Map<number, Callback>;
      __fakeTauriBack: Set<number>;
    };
    w.__fakeTauriCallbacks = new Map();
    w.__fakeTauriBack = new Set();
    let next = 1;
    w.__TAURI_INTERNALS__ = {
      transformCallback: (callback: Callback) => {
        const id = next++;
        w.__fakeTauriCallbacks.set(id, callback);
        return id;
      },
      unregisterCallback: (id: number) => w.__fakeTauriCallbacks.delete(id),
      invoke: async (cmd: string, args?: { event?: string; handler?: string; channelId?: number }) => {
        // The app plugin's listeners, as tauri 2.11's AppPlugin.kt keeps them: a channel per listener.
        if (cmd === 'plugin:app|register_listener' && args?.event === 'back-button') {
          w.__fakeTauriBack.add(Number(String(args.handler).replace('__CHANNEL__:', '')));
          return null;
        }
        if (cmd === 'plugin:app|remove_listener' && args?.event === 'back-button') {
          w.__fakeTauriBack.delete(Number(args.channelId));
          return null;
        }
        return w.__fakeTauriInvoke(cmd, args);
      },
    };
  });
  return { token: () => token };
};

/** How many `back-button` listeners the page has. With none, Android's Back does the shell's default: on the client's
 * first screen (its only history entry), it leaves the app. */
export const backListeners = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __fakeTauriBack: Set<number> }).__fakeTauriBack.size);

/** Android's Back with a listener: the shell sends each listener's channel the event, in the envelope seen on the
 * emulator (`{ message: { canGoBack }, index }`), and does nothing else. */
export const pressBack = async (page: Page): Promise<void> => {
  const sent = await page.evaluate(() => {
    const w = window as unknown as { __fakeTauriBack: Set<number>; __fakeTauriCallbacks: Map<number, (raw: unknown) => void>; __fakeTauriPresses?: number };
    // Each press numbered, as the channel's messages are.
    const index = w.__fakeTauriPresses ?? 0;
    w.__fakeTauriPresses = index + 1;
    for (const id of w.__fakeTauriBack) w.__fakeTauriCallbacks.get(id)?.({ message: { canGoBack: false }, index });
    return w.__fakeTauriBack.size;
  });
  if (sent === 0) throw new Error('Back with no back-button listener leaves the app');
};
