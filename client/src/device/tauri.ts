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
