// A fake Tauri bridge for the journeys: window.__TAURI_INTERNALS__.invoke answers the shell's three
// token commands from a store that lives in the test process, so a kept token survives a reload,
// as it survives an app restart on the phone. It also records each URL given to the opener plugin.
import type { BrowserContext } from '@playwright/test';

export const fakeTauri = async (context: BrowserContext): Promise<{ token: () => string | null; opened: () => string[] }> => {
  let token: string | null = null;
  const opened: string[] = [];
  await context.exposeFunction('__fakeTauriInvoke', (cmd: string, args?: { token?: string; url?: string }) => {
    if (cmd === 'token_keep') token = args?.token ?? null;
    else if (cmd === 'token_forget') token = null;
    else if (cmd === 'token_read') return token;
    else if (cmd === 'plugin:opener|open_url') opened.push(args?.url ?? '');
    else throw new Error(`fake Tauri has no command ${cmd}`);
    return null;
  });
  await context.addInitScript(() => {
    const w = window as unknown as { __TAURI_INTERNALS__: unknown; __fakeTauriInvoke: (c: string, a?: unknown) => Promise<unknown> };
    w.__TAURI_INTERNALS__ = { invoke: (cmd: string, args?: unknown) => w.__fakeTauriInvoke(cmd, args) };
  });
  return { token: () => token, opened: () => [...opened] };
};
