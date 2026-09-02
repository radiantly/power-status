/** Presentation-only helpers. No interval maths lives here. */

const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const DATE_TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const formatDay = (date) => DAY_LABEL.format(date);

export const formatTimestamp = (seconds) => TIME_LABEL.format(new Date(seconds * 1000));

export const formatDateTime = (seconds) => DATE_TIME_LABEL.format(new Date(seconds * 1000));

/** Machine-readable form for a <time datetime> attribute. */
export const formatIso = (seconds) => new Date(seconds * 1000).toISOString();

/** Coarse, human duration: "48s", "12m", "3h 05m", "2d 4h". */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days}d ${rest}h` : `${days}d`;
}

/**
 * Uptime as a percentage, truncated rather than rounded so that a window
 * containing any downtime can never display as a flat 100%.
 */
export function formatUptime(ratio) {
  if (ratio == null) return "N/A";
  return `${(Math.floor(ratio * 10_000) / 100).toFixed(2)}%`;
}

/** "power" -> "Power", "backup_power" -> "Backup Power". */
export const humanizeId = (id) =>
  id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/**
 * "A", "A and B", "A, B and C" -- built by Intl so the separator and the final
 * conjunction follow the viewer's locale rather than a hardcoded " and ".
 */
const LIST_LABEL = new Intl.ListFormat(undefined, {
  style: "long",
  type: "conjunction",
});

export const formatList = (items) => LIST_LABEL.format(items);

/**
 * Fixed-width stamp for the outage list: "Aug 29, 03:11".
 *
 * The locale is pinned deliberately. This column is rendered monospaced and
 * read as a table, so every row must occupy the same width -- a locale that
 * switched to 12-hour time or a different field order would ragged the column.
 * Prose dates elsewhere still follow the viewer's locale via formatDateTime.
 */
const STAMP_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatStamp(seconds) {
  const at = new Date(seconds * 1000);
  return STAMP_DATE_TIME.format(at);
}
