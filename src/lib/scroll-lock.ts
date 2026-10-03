type ScrollStyle = { overflow: string };
const locks = new WeakMap<ScrollStyle, { count: number; previous: string }>();

/** Nested dialogs share one lock, regardless of the order they close. */
export function lockPageScroll(style: ScrollStyle = document.body.style): () => void {
  const lock = locks.get(style) ?? { count: 0, previous: style.overflow };
  lock.count++;
  locks.set(style, lock);
  style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lock.count === 0) {
      style.overflow = lock.previous;
      locks.delete(style);
    }
  };
}
