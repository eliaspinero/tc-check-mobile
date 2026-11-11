// The Tauri shell's IPC bridge, when the page runs inside the app (absent in a browser).
export type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** The parts of the bridge the client uses: commands, and callbacks that stand for a plugin's event channel. */
export type Bridge = {
  invoke: Invoke;
  transformCallback: (callback: () => void) => number;
  unregisterCallback: (id: number) => void;
};

export const bridgeOf = (): Bridge | null => (globalThis as { __TAURI_INTERNALS__?: Bridge }).__TAURI_INTERNALS__ ?? null;

export const invokeOf = (): Invoke | null => bridgeOf()?.invoke ?? null;

export const inTauri = (): boolean => invokeOf() !== null;

/** In the app, opens `url` in the phone's browser (Tauri's opener plugin) and returns true; in a plain browser, false. */
export const openExternal = (url: string): boolean => {
  const invoke = invokeOf();
  if (!invoke) return false;
  void invoke('plugin:opener|open_url', { url });
  return true;
};
