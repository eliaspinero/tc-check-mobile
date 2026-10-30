// What leaves the screen leaves as a still copy of itself: the screen on a screen change (App.tsx go), the check on a
// swipe or on Previous and Next (useSwipe.ts). React has already moved on to what is on screen now; the copy is
// plain DOM that app.css moves away, and it is gone when that move ends. Under reduced motion no copy is drawn.

const motionAllowed = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A copy of `el` as it is drawn now, with no test id or id, so nothing finds it as the real thing. */
const stillCopy = (el: Element) => {
  const copy = el.cloneNode(true) as Element;
  for (const node of [copy, ...copy.querySelectorAll('[data-testid], [id]')]) {
    node.removeAttribute('data-testid');
    node.removeAttribute('id');
  }
  return copy;
};

/** Shows `nodes` in `into`, out of reach (`inert` keeps taps, the keyboard and selection off it; `aria-hidden`, a
 * screen reader), until `end` ends its own `type` event: an animation or a transition of a row inside does not count. */
const hold = (into: HTMLElement, nodes: Node[], end: Element, type: 'animationend' | 'transitionend', done = () => into.replaceChildren()) => {
  into.replaceChildren(...nodes);
  into.inert = true;
  into.setAttribute('aria-hidden', 'true');
  const ended = (e: Event) => {
    if (e.target !== end) return;
    end.removeEventListener(type, ended);
    done();
  };
  end.addEventListener(type, ended);
};

/** The screen `main` leaves, under the new one: a layer over the page, scrolled as the page was, so its top bar stays
 * where it was. A second screen change while it leaves replaces it. */
export const leaveScreen = (main: Element, back: boolean) => {
  document.querySelector('body > .leaving')?.remove();
  if (!motionAllowed()) return;
  const layer = document.createElement('div');
  layer.className = back ? 'leaving back' : 'leaving';
  document.body.append(layer);
  hold(layer, [stillCopy(main)], layer, 'animationend', () => layer.remove());
  layer.scrollTop = scrollY;
};

/** The check in `content` leaves whole, into `slot` on its `side`, while `content` slides to the new check. The peeks
 * and the slot itself are not part of the check. */
export const leaveCheck = (content: HTMLElement, slot: HTMLElement, side: 'prev' | 'next') => {
  if (!motionAllowed()) return slot.replaceChildren();
  const copy = stillCopy(content);
  copy.querySelectorAll(':scope > .peek, :scope > .leaving-slot').forEach((el) => el.remove());
  slot.className = `leaving-slot ${side}`;
  hold(slot, [...copy.childNodes], content, 'transitionend');
};
