import type { CSSProperties } from 'react';

/** Rows from the eighth on enter with the eighth, so a long list never keeps the checker waiting. */
const LAST_STAGGERED = 7;

/** The style of row `index` in a list that enters top to bottom: app.css waits `--row` × `--stagger` before it rises in. */
export const stagger = (index: number): CSSProperties => ({ '--row': Math.min(index, LAST_STAGGERED) }) as CSSProperties;
