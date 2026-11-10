// The Tauri shell's IPC bridge, when the page runs inside the app (absent in a browser).
export type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

export const invokeOf = (): Invoke | null =>
  ((globalThis as { __TAURI_INTERNALS__?: { invoke?: Invoke } }).__TAURI_INTERNALS__?.invoke as Invoke | undefined) ?? null;

export const inTauri = (): boolean => invokeOf() !== null;

/** In the app, opens `url` in the phone's browser (Tauri's opener plugin) and returns true; in a plain browser, false. */
export const openExternal = (url: string): boolean => {
  const invoke = invokeOf();
  if (!invoke) return false;
  void invoke('plugin:opener|open_url', { url });
  return true;
};
