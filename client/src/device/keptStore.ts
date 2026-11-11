// What the client keeps between app sessions (#44): JSON by name. On the phone the Tauri shell keeps it in the
// app's private data directory (shell/src-tauri/src/kept.rs), beside the token; in a browser it lives in memory
// for this page only, as the token does. Nothing kept decides what exists: a missing or damaged value reads as
// nothing, and the client reads the thing again.
import { invokeOf } from './tauri';

export interface KeptStore {
  /** The value kept under `name`, or undefined when there is none or it cannot be read. */
  read(name: string): Promise<unknown>;
  /** Keeps `value` under `name`. A write that fails is not reported: it only means reading again next time. */
  write(name: string, value: unknown): Promise<void>;
}

/** A name the shell takes: lower-case letters, digits and `-` (kept.rs). */
export const keptName = (...parts: string[]): string =>
  parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-');

export const keptStore = (): KeptStore => {
  const invoke = invokeOf();
  if (!invoke) {
    const values = new Map<string, unknown>();
    return {
      read: async (name) => values.get(name),
      write: async (name, value) => void values.set(name, value),
    };
  }
  return {
    read: async (name) => {
      try {
        const text = (await invoke('kept_read', { name })) as string | null;
        return text === null ? undefined : (JSON.parse(text) as unknown);
      } catch {
        return undefined;
      }
    },
    write: async (name, value) => {
      await invoke('kept_write', { name, value: JSON.stringify(value) }).catch(() => undefined);
    },
  };
};
