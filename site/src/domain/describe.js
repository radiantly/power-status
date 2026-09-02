/** Turns a derived day cell into the sentences shown in tooltips and to screen readers. */

import { formatDateTime, formatDay, formatDuration, formatTimestamp } from "./format.js";
import { DayStatus } from "./status.js";
import { isSameLocalDay } from "./time.js";

/**
 * An outage can run across midnight, so an endpoint outside the day being
 * described carries its date; within the day, the time alone is unambiguous.
 */
const stamp = (seconds, day) =>
  isSameLocalDay(seconds, day) ? formatTimestamp(seconds) : formatDateTime(seconds);

const formatRange = (segment, day) =>
  `${stamp(segment.start, day)} – ${segment.end == null ? "ongoing" : stamp(segment.end, day)}`;

/**
 * The grey a bar shows covers both no-data and excluded spans, so the headline
 * names whichever accounted for more of the day; `details` breaks the two apart
 * whenever the day was a mix. A tie falls to the no-data side, the weaker claim.
 *
 * That side splits again on how much of the day went unseen. "No data" is a
 * statement about the whole day and is only made when the whole day went
 * unobserved; a day the monitor saw a little of, but not enough to judge, gets
 * the weaker "Insufficient data" and leaves the detail line to say how little.
 */
function summaryLine(cell) {
  if (cell.down > 0) return `Down for ${formatDuration(cell.down)}`;
  if (cell.status !== DayStatus.Untracked) return "No downtime";
  if (cell.excluded > cell.noData) return "Excluded";
  return cell.noData >= cell.tracked ? "No data" : "Insufficient data";
}

/**
 * A bucket earns a line only when it is part of the day; a day that is entirely
 * one thing has already been named by the summary.
 */
const detailLine = (seconds, tracked, label) =>
  seconds > 0 && seconds < tracked ? `${label} for ${formatDuration(seconds)}` : null;

export function describeDay(cell) {
  const details = [
    detailLine(cell.excluded, cell.tracked, "Excluded"),
    detailLine(cell.noData, cell.tracked, "No data"),
  ].filter(Boolean);

  const notes = cell.segments
    .filter((segment) => segment.notes)
    .map((segment) => ({
      key: segment.start,
      range: formatRange(segment, cell.date),
      text: segment.notes,
    }));

  return { title: formatDay(cell.date), summary: summaryLine(cell), details, notes };
}

export const describeDayLabel = (cell) => {
  const { title, summary, details } = describeDay(cell);
  return [title, summary, ...details].join(", ");
};
