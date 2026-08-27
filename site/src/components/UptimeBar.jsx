import { useState } from "react";

import { describeDayLabel } from "../domain/describe.js";
import { DayStatus } from "../domain/status.js";
import { barStyle, stripStyle } from "./barGeometry.js";
import DayTooltip from "./DayTooltip.jsx";

const BAR_CLASS = {
  [DayStatus.Operational]: "bg-up",
  [DayStatus.Minor]: "bg-minor",
  [DayStatus.Major]: "bg-major",
  [DayStatus.Untracked]: "bg-untracked",
};

/**
 * Renders exactly the cells it is given; the window is chosen by the caller.
 *
 * Hover is held as the hovered day's start rather than its index, because the
 * caller reflows the window on resize: an index would go on naming a slot while
 * the day occupying it changed underneath, lighting one bar and describing
 * another. A start that has fallen out of the window resolves to no hover.
 *
 * Hover drives both the tooltip and the bar highlight. The highlight is
 * deliberately not a `hover:` utility: the gaps between bars belong to the
 * strip rather than to any button, so CSS :hover drops out while crossing one
 * and the lit bar would disagree with the tooltip still on screen.
 */
export default function UptimeBar({ cells }) {
  const [hovered, setHovered] = useState(null);
  const hoveredIndex = cells.findIndex((cell) => cell.start === hovered);

  return (
    <div className="relative">
      <div style={stripStyle} className="flex items-stretch" onMouseLeave={() => setHovered(null)}>
        {cells.map((cell) => (
          <button
            key={cell.start}
            type="button"
            style={barStyle}
            aria-label={describeDayLabel(cell)}
            onMouseEnter={() => setHovered(cell.start)}
            onFocus={() => setHovered(cell.start)}
            onBlur={() => setHovered(null)}
            className={`h-9 flex-1 rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
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
