// The Tauri shell's IPC bridge, when the page runs inside the app (absent in a browser).
export type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

export const invokeOf = (): Invoke | null =>
  ((globalThis as { __TAURI_INTERNALS__?: { invoke?: Invoke } }).__TAURI_INTERNALS__?.invoke as Invoke | undefined) ?? null;

export const inTauri = (): boolean => invokeOf() !== null;
