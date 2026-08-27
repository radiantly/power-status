/** Interval arithmetic over Unix-second timestamps and local calendar days. */

export const nowSeconds = () => Math.floor(Date.now() / 1000);

const toSeconds = (date) => Math.floor(date.getTime() / 1000);

/**
 * Days of history, oldest first, bounded by local midnight. Day length is
 * derived from the calendar rather than assumed to be 86400s so that
 * daylight-saving transitions stay correct.
 *
 * @returns {{ date: Date, start: number, end: number }[]}
 */
export function buildDayGrid(now, dayCount) {
  const today = new Date(now * 1000);
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = today.getDate();

  const days = [];
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const start = new Date(year, month, date - offset);
    const end = new Date(year, month, date - offset + 1);
    days.push({ date: start, start: toSeconds(start), end: toSeconds(end) });
  }
  return days;
}

/** Seconds shared by the intervals [aStart, aEnd) and [bStart, bEnd). */
export const overlap = (aStart, aEnd, bStart, bEnd) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

/** Whether a timestamp falls on the same local calendar day as `date`. */
export function isSameLocalDay(seconds, date) {
  const at = new Date(seconds * 1000);
  return (
    at.getFullYear() === date.getFullYear() &&
    at.getMonth() === date.getMonth() &&
    at.getDate() === date.getDate()
  );
}
