import { useLayoutEffect, useRef, useState } from "react";

import { describeDay } from "../domain/describe.js";

/**
 * Centred on its bar, sliding aside only as far as an edge demands.
 *
 * How far it may slide depends on the tooltip's own width, which varies with
 * content -- a day with a note wraps to the full cap, a bare one is half that.
 * So the bound is measured rather than assumed, and handed to clamp() in
 * pixels; the centre stays a percentage, which resolves against the strip and
 * saves measuring that too. Measuring in a layout effect keeps the unclamped
 * first position off-screen, since it is corrected before paint.
 */
export default function DayTooltip({ cell, position }) {
  const { title, summary, details, notes } = describeDay(cell);
  const ref = useRef(null);
  const [half, setHalf] = useState(0);

  useLayoutEffect(() => {
    if (ref.current) setHalf(ref.current.offsetWidth / 2);
  }, [cell]);

  return (
    <div
      ref={ref}
      role="tooltip"
      style={{ left: `clamp(${half}px, ${position * 100}%, calc(100% - ${half}px))` }}
      className="pointer-events-none absolute top-full z-10 mt-2 w-max max-w-[min(18rem,100%)] -translate-x-1/2 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg"
    >
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-0.5 text-muted">{summary}</p>
      {details.map((line) => (
        <p key={line} className="text-muted">
          {line}
        </p>
      ))}
      {notes.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-line pt-2 text-muted">
          {notes.map((note) => (
            <li key={note.key}>
              <span className="text-ink">{note.range}</span> {note.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
