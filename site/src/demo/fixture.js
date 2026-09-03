/**
 * The history the demo pretends to have recorded.
 *
 * Written to put every state the page can draw on screen at once: each of the
 * four day colours, both wordings the tooltip has for a grey day, an outage
 * that counts and one that has been waved off, one the monitor never saw but a
 * human insisted was real, a run that crosses midnight into two differently
 * coloured bars, a stretch older than the window, and an outage still open.
 *
 * Offsets are resolved against local calendar days rather than by subtracting
 * multiples of 86400 from `now`, because that is how `buildDayGrid` cuts the
 * bars: an outage placed by arithmetic would drift into the neighbouring bar
 * for anyone far enough from UTC, and across a daylight-saving boundary for
 * everyone.
 */

/** Unix seconds at a local wall-clock time, `daysAgo` days back. */
function at(now, daysAgo, hour, minute = 0) {
  const today = new Date(now * 1000);
  const when = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - daysAgo,
    hour,
    minute,
  );
  return Math.floor(when.getTime() / 1000);
}

/**
 * The monitors, as the server's `monitor` table would hold them.
 *
 * `internet` is mid-outage so the page has something to be red about.
 * `last_update` is not stated here: the fake server stamps every response with
 * the current time, since a monitor that stops reporting goes Unknown after two
 * of its own cadences and a frozen timestamp would grey out all three cards a
 * minute after the page loaded.
 */
export const MONITORS = [
  { monitor_id: "internet", up: false, next_update_in: 60 },
  { monitor_id: "power", up: true, next_update_in: 60 },
  { monitor_id: "backup", up: true, next_update_in: 3700 },
];

/**
 * Every outage, as `{ monitor, from, seconds, untracked, excluded, notes }`.
 *
 * `from` is [daysAgo, hour, minute]; `seconds` of null leaves the outage open.
 * Two rows per monitor may not overlap -- the server records one interval per
 * stretch of downtime, and overlapping rows would count their shared seconds
 * twice in the same day.
 */
const HISTORY = [
  // internet ---------------------------------------------------------------
  // Monitoring began before the window, so nothing here is grey for age.
  { monitor: "internet", preHistoryUntil: [92, 0] },
  // Starts before the window and ends inside it: the log row says so rather
  // than reporting a span longer than the period on screen.
  { monitor: "internet", from: [91, 20], seconds: 122400, notes: "Exchange-side fibre cut." },
  { monitor: "internet", from: [45, 2], seconds: 420 },
  { monitor: "internet", from: [34, 21], seconds: 240 },
  { monitor: "internet", from: [21, 13], seconds: 180 },
  // Under ten minutes: an orange day rather than a red one.
  { monitor: "internet", from: [10, 14, 30], seconds: 300 },
  {
    monitor: "internet",
    from: [6, 9, 15],
    seconds: 1500,
    notes:
      "Router lost its PPPoE session and would not renegotiate. Power-cycled the ONT, which brought the line back after about twenty minutes. The ISP reported no fault at their end.",
  },
  // Still open, so the banner, the card's pill and the log all have an ongoing
  // outage to describe, and the duration grows while the page sits there.
  { monitor: "internet", from: "recent", seconds: null },

  // power ------------------------------------------------------------------
  // Nothing was watching until 62 days ago: the grey run at the left edge.
  { monitor: "power", preHistoryUntil: [62, 0] },
  // A day the monitor saw none of.
  { monitor: "power", from: [40, 0], seconds: 86400, untracked: true },
  // Seen for part of the day, but not enough of it to judge: the tooltip says
  // "Insufficient data" where the row above says "No data".
  { monitor: "power", from: [33, 6], seconds: 52000, untracked: true },
  // Observed, but deliberately not counted. Long enough that the day itself
  // reads grey, and the tooltip names exclusion rather than missing data.
  {
    monitor: "power",
    from: [25, 8],
    seconds: 46800,
    excluded: true,
    notes: "Consumer unit replaced - planned, mains isolated at the meter.",
  },
  // 23:50 for 45 minutes: ten minutes on the first day, thirty-five on the
  // next, so one row paints one orange bar and one red one.
  {
    monitor: "power",
    from: [18, 23, 50],
    seconds: 2700,
    notes: "Storm damage to the overhead line.",
  },
  { monitor: "power", from: [8, 17], seconds: 180 },
  { monitor: "power", from: [3, 5], seconds: 420 },

  // backup -----------------------------------------------------------------
  { monitor: "backup", preHistoryUntil: [70, 0] },
  { monitor: "backup", from: [29, 3], seconds: 5400, notes: "rsync.net refused the key." },
  // The monitor was blind for this stretch, but it was a real failure, so it
  // is marked to count: grey time rendered as a red day.
  {
    monitor: "backup",
    from: [12, 2],
    seconds: 2700,
    untracked: true,
    excluded: false,
    notes: "Host was off overnight, so no backup ran and nothing was there to report it.",
  },
  { monitor: "backup", from: [4, 3], seconds: 300 },
];

/**
 * The history as `outages` rows, resolved against `now`.
 *
 * Called once, at load: `start` is half of an outage's identity, so rebuilding
 * these per request would leave every annotation addressed to a row that no
 * longer exists.
 *
 * A `preHistoryUntil` entry becomes the row the server writes for the stretch
 * before a monitor was ever seen -- start 0, which the outage log knows to skip
 * and the day bars render grey.
 */
export function buildOutages(now) {
  return HISTORY.map((entry) => {
    if (entry.preHistoryUntil) {
      return {
        monitor_id: entry.monitor,
        start: 0,
        end: at(now, ...entry.preHistoryUntil),
        untracked: true,
        excluded: null,
        notes: null,
      };
    }

    // The open outage is minutes old rather than days, so it is placed against
    // the clock instead of the calendar.
    const start = entry.from === "recent" ? now - 240 : at(now, ...entry.from);

    return {
      monitor_id: entry.monitor,
      start,
      end: entry.seconds == null ? null : start + entry.seconds,
      untracked: entry.untracked ?? false,
      excluded: entry.excluded ?? null,
      notes: entry.notes ?? null,
    };
  });
}
