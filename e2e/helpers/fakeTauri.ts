// A fake Tauri bridge for the journeys: window.__TAURI_INTERNALS__.invoke answers the shell's commands from a
// store that lives in the test process, so what is kept survives a reload, as it survives an app restart on the
// phone: the token (token_*) and the kept results (kept_*, #44).
import type { BrowserContext } from '@playwright/test';

export interface FakeTauri {
  token: () => string | null;
  /** The kept results by name, as the shell keeps them in its `kept` folder: a journey can read or damage one. */
  kept: Map<string, string>;
}

export const fakeTauri = async (context: BrowserContext): Promise<FakeTauri> => {
  let token: string | null = null;
  const kept = new Map<string, string>();
  await context.exposeFunction('__fakeTauriInvoke', (cmd: string, args?: { token?: string; name?: string; value?: string }) => {
    if (cmd === 'token_keep') token = args?.token ?? null;
    else if (cmd === 'token_forget') token = null;
    else if (cmd === 'token_read') return token;
    else if (cmd === 'kept_write') kept.set(args!.name!, args!.value!);
    else if (cmd === 'kept_read') return kept.get(args!.name!) ?? null;
    else throw new Error(`fake Tauri has no command ${cmd}`);
    return null;
  });
  await context.addInitScript(() => {
    const w = window as unknown as { __TAURI_INTERNALS__: unknown; __fakeTauriInvoke: (c: string, a?: unknown) => Promise<unknown> };
    w.__TAURI_INTERNALS__ = { invoke: (cmd: string, args?: unknown) => w.__fakeTauriInvoke(cmd, args) };
  });
  return { token: () => token, kept };
};
