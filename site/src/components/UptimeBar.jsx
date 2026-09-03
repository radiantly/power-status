import { useState } from "react";

import { describeDayLabel } from "../domain/describe.js";
import { DayStatus } from "../domain/status.js";
import DayTooltip from "./DayTooltip.jsx";

const BAR_CLASS = {
  [DayStatus.Operational]: "bg-up",
  [DayStatus.Minor]: "bg-minor",
  [DayStatus.Major]: "bg-major",
  [DayStatus.Untracked]: "bg-untracked",
};

/**
 * Which bar a pointer is over, by horizontal position alone, or -1 for none.
 *
 * Hit-tested on the strip's own midline rather than at the pointer's y, so a
 * thumb that has slid off the bars still names the one it is above or below.
 * Asking the browser what is at a point keeps the strip's geometry in the
 * stylesheet that states it, rather than restating bar width and gap here to
 * divide by.
 *
 * A point in a gap belongs to no bar and holds the selection where it is, which
 * is the same thing crossing a gap does to a mouse.
 */
function barIndexAt(strip, clientX) {
  const box = strip.getBoundingClientRect();
  const at = document.elementFromPoint(clientX, box.top + box.height / 2);
  // `children` is an HTMLCollection and has no indexOf of its own; it is
  // array-like enough to borrow one, which beats copying ninety elements into
  // an array for every move event of a scrub.
  return Array.prototype.indexOf.call(strip.children, at);
}

/**
 * Renders exactly the cells it is given, at the width index.css has sized the
 * page to hold. Bars state a width rather than dividing one: an equal share of
 * an arbitrary container is a fraction the browser has to round, and rounding
 * lands neighbouring bars on different sixty-fourths of a pixel.
 *
 * Hover is held as the hovered day's start rather than its index, because the
 * window rolls forward -- at midnight, and on every poll that rebuilds the
 * cells. An index would go on naming a slot while the day occupying it changed
 * underneath, lighting one bar and describing another. A start that has fallen
 * out of the window resolves to no hover.
 *
 * Hover drives both the tooltip and the bar highlight. The highlight is
 * deliberately not a `hover:` utility: the gaps between bars belong to the
 * strip rather than to any button, so CSS :hover drops out while crossing one
 * and the lit bar would disagree with the tooltip still on screen. For the same
 * reason the strip tracks the pointer itself instead of each bar reporting that
 * it was entered: one reading of where the pointer is says what is lit, whether
 * it sits on a bar, in a gap, or off the strip entirely.
 *
 * A finger reads as a hover too, so a tap and a drag along the strip are the
 * same gesture at different lengths. The strip captures the pointer as it goes
 * down and is sent the rest of the gesture wherever it strays, so a thumb that
 * slips off a strip this shallow -- easily done, and the bars are the height of
 * a thumbnail -- goes on naming bars rather than ending the drag. Capture is
 * also what makes that possible at all for touch: a finger is captured by
 * whatever it lands on regardless, so without claiming it here the bars either
 * side would never see it.
 *
 * `touch-action: pan-y` leaves that horizontal drag to us while a vertical
 * swipe still scrolls the page -- which cancels the pointer, and clears the
 * selection with it. Only a mouse leaving the strip clears it otherwise: a
 * finger lifting emits the same leave, and a tap that cleared itself on release
 * would never leave a tooltip on screen at all.
 */
export default function UptimeBar({ cells }) {
  const [hovered, setHovered] = useState(null);
  const hoveredIndex = cells.findIndex((cell) => cell.start === hovered);

  const track = (event) => {
    const index = barIndexAt(event.currentTarget, event.clientX);
    if (index !== -1) setHovered(cells[index].start);
  };

  return (
    <div className="relative">
      <div
        className="flex touch-pan-y items-stretch gap-[var(--bar-gap)]"
        onPointerDown={(event) => {
          // Read the press before claiming the gesture: a tap that never moves
          // has only this to light a bar with, and it should not depend on
          // whether the pointer could be captured.
          track(event);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={track}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setHovered(null);
        }}
        onPointerCancel={() => setHovered(null)}
      >
        {cells.map((cell) => (
          <button
            key={cell.start}
            type="button"
            aria-label={describeDayLabel(cell)}
            onFocus={() => setHovered(cell.start)}
            onBlur={() => setHovered(null)}
            className={`h-9 w-[var(--bar-w)] rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              BAR_CLASS[cell.status]
            } ${cell.start === hovered ? "opacity-70" : ""}`}
          />
        ))}
      </div>

      {hoveredIndex !== -1 && (
        <DayTooltip cell={cells[hoveredIndex]} position={(hoveredIndex + 0.5) / cells.length} />
      )}
    </div>
  );
}
