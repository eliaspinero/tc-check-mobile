// Android's Back (the button or the gesture) does what the screen's own Back does (#58). Tauri's Android shell hands
// Back to the WebView's history: it goes back while it can, and closes the app once it cannot. So while a Back is on
// screen (a top bar's Back, an open sheet), the page keeps one history entry of its own. Back pops it, the latest Back
// on screen runs, and the screens it leads to put the entry back while there is still a Back on screen. On the projects
// screen there is none: the entry goes, and the next Back leaves the app.
import { useEffect, useRef } from 'react';

/** The Backs on screen, latest last: a sheet opens over the screen whose Back it covers. */
const backs: Array<() => void> = [];
/** Whether the page's own entry is the current history entry. */
let held = false;
/** The page took its entry away itself (history.back()); the popstate that follows is not the checker's Back. */
let dropping = false;

// After React has committed (the Backs that leave and the ones that come, together), the entry follows what is on screen.
const settle = () =>
  queueMicrotask(() => {
    if (backs.length > 0 && !held) {
      history.pushState(null, '');
      held = true;
    } else if (backs.length === 0 && held) {
      held = false;
      dropping = true;
      history.back();
    }
  });

window.addEventListener('popstate', () => {
  if (dropping) {
    dropping = false;
    return;
  }
  held = false;
  backs.at(-1)?.();
});

/** Android's Back runs `back` while it is given; the latest one given wins. */
export function useBack(back: (() => void) | undefined) {
  // The slot keeps its place while the function changes on each render, so an open sheet stays above its screen's Back.
  const latest = useRef(back);
  useEffect(() => {
    latest.current = back;
  });
  const on = back !== undefined;
  useEffect(() => {
    if (!on) return;
    const run = () => latest.current?.();
    backs.push(run);
    settle();
    return () => {
      backs.splice(backs.indexOf(run), 1);
      settle();
    };
  }, [on]);
}
