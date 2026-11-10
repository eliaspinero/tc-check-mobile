// Android's Back (the button or the gesture) does what the screen's own Back does (#58). While a Back is on screen (a
// top bar's Back, an open sheet), the page listens for the shell's Back, and the latest Back on screen runs. On the
// projects screen there is none: the page stops listening, and the shell's own Back leaves the app.
//
// Not the WebView's history: Chromium skips history entries a page adds without a tap in between, so a second Back in
// a row skipped the client's entries and left the app (seen on the emulator).
import { useEffect, useRef } from 'react';
import { listenBack } from '../device/backButton';

/** The Backs on screen, latest last: a sheet opens over the screen whose Back it covers. */
const backs: Array<() => void> = [];
/** Stops listening, while the page listens. */
let stop: Promise<() => Promise<void>> | null = null;

// After React has committed (the Backs that leave and the ones that come, together), listening follows what is on
// screen, so moving from one screen to the next keeps the same listener. Each listener has its own channel, so a stop
// still on its way never removes the listener that comes after it.
const settle = () =>
  queueMicrotask(() => {
    if (backs.length > 0 && !stop) {
      stop = listenBack(() => backs.at(-1)?.());
    } else if (backs.length === 0 && stop) {
      const stopping = stop;
      stop = null;
      void stopping.then((s) => s());
    }
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
