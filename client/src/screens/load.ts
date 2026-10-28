export type Failed = { state: 'failed'; message: string };

/** What a screen reads once on opening: still reading, read, or failed with why. One at a time. */
export type Load<T> = { state: 'loading' } | { state: 'ready'; value: T } | Failed;

/** What a screen does when tapped: nothing, one of its own running states `R`, or failed with why. One at a time. */
export type Run<R extends { state: string }> = { state: 'idle' } | R | Failed;

export const LOADING = { state: 'loading' } as const;
export const IDLE = { state: 'idle' } as const;

/** The value of a finished load, else null. */
export const ready = <T>(load: Load<T>): T | null => (load.state === 'ready' ? load.value : null);

/** The message of a failed load or run, else null. */
export const failure = (s: { state: string } | Failed): string | null => (s.state === 'failed' ? (s as Failed).message : null);
