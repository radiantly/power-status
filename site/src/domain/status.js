/**
 * Derives everything the UI renders from a raw /api/status payload.
 *
 * Pure by design: `now` is always passed in rather than read from the clock,
 * so the whole interpretation layer -- interval clipping, the excluded/untracked
 * precedence, severity, uptime -- is deterministic and testable on its own.
 */

import {
  DAY_COUNT,
  MAJOR_OUTAGE_SECONDS,
  MONITORS,
  POLL_INTERVAL_MS,
  SHOWN_MONITORS,
  STALE_UPDATE_FACTOR,
  UNTRACKED_DAY_RATIO,
} from "./config.js";
import { humanizeId } from "./format.js";
import { buildDayGrid, overlap } from "./time.js";

/** Severity of a single day's bar. */
export const DayStatus = {
  Operational: "operational",
  Minor: "minor",
  Major: "major",
  Untracked: "untracked",
};

/** A monitor's state right now. */
export const MonitorState = {
  Operational: "operational",
  Down: "down",
  Unknown: "unknown",
};

/**
 * What a single outage was, as listed in the outage log.
 *
 * Deliberately its own vocabulary rather than a reuse of DayStatus: a day bar
 * shows the worst thing that happened across a whole day, where a log row
 * describes one interval and can afford to say more about it.
 *
 * Two independent facts decide a row. `untracked` is what the monitor knew, and
 * words a grey row: NoData where it was blind, Excluded where a real outage was
 * waved off by hand. `excluded` decides only whether the interval counts, and
 * so picks between grey and a severity -- an untracked stretch a human insists
 * was real reads Major or Minor like any other outage.
 *
 * Major and Minor name severity, not service level: a two-minute cut is a full
 * outage that happened to be short, so both render as "Down" and the colour
 * carries the difference.
 */
export const OutageKind = {
  Major: "major",
  Minor: "minor",
  NoData: "no-data",
  Excluded: "excluded",
};

/**
 * Whether an outage counts against uptime.
 *
 * `excluded` is a human judgement and overrides the system-derived `untracked`
 * in both directions; absent that, an untracked interval is one the monitor
 * could not observe and so is neither downtime nor uptime.
 */
const isCounted = (outage) => (outage.excluded == null ? !outage.untracked : !outage.excluded);

/** An outage with no end is still open, so it runs up to the present. */
const outageEnd = (outage, now) => outage.end ?? now;

function classifyDay({ tracked, down, noData, excluded }) {
  if (tracked <= 0) return DayStatus.Untracked;
  if (down > MAJOR_OUTAGE_SECONDS) return DayStatus.Major;
  if (down > 0) return DayStatus.Minor;
  if (noData + excluded >= tracked * UNTRACKED_DAY_RATIO) return DayStatus.Untracked;
  return DayStatus.Operational;
}

/**
 * A day's elapsed time in three disjoint buckets: counted downtime, and the two
 * kinds of time that leave the uptime denominator instead of counting against
 * it. Those two are split on the same reading of `untracked` that OutageKind
 * uses, since the bar has room for neither distinction but the tooltip does.
 */
function buildDayCell(day, outages, now) {
  // Today is only partly elapsed; the untraversed remainder is not "unknown",
  // it simply has not happened yet, so the day is clipped to the present.
  const end = Math.min(day.end, now);
  const tracked = Math.max(0, end - day.start);

  let down = 0;
  let noData = 0;
  let excluded = 0;
  const segments = [];

  for (const outage of outages) {
    const seconds = overlap(day.start, end, outage.start, outageEnd(outage, now));
    if (seconds <= 0) continue;

    if (isCounted(outage)) down += seconds;
    else if (outage.untracked) noData += seconds;
    else excluded += seconds;

    segments.push({
      start: outage.start,
      end: outage.end ?? null,
      notes: outage.notes ?? null,
    });
  }

  const totals = { tracked, down, noData, excluded };
  return { ...day, ...totals, segments, status: classifyDay(totals) };
}

function monitorState(monitor, now) {
  if (
    now - monitor.last_update >
    monitor.next_update_in * STALE_UPDATE_FACTOR + POLL_INTERVAL_MS / 1000
  )
    return MonitorState.Unknown;
  return monitor.up ? MonitorState.Operational : MonitorState.Down;
}

function buildMonitor(monitor, outages, days, now) {
  const ongoing = outages.find((outage) => outage.end == null) ?? null;

  return {
    id: monitor.monitor_id,
    label: humanizeId(monitor.monitor_id),
    description: MONITORS[monitor.monitor_id]?.description ?? null,
    state: monitorState(monitor, now),
    lastUpdate: monitor.last_update,
    ongoingSince: ongoing?.start ?? null,
    days: days.map((day) => buildDayCell(day, outages, now)),
  };
}

function groupByMonitor(outages) {
  const grouped = new Map();
  for (const outage of outages) {
    const bucket = grouped.get(outage.monitor_id);
    if (bucket) bucket.push(outage);
    else grouped.set(outage.monitor_id, [outage]);
  }
  return grouped;
}

/**
 * The freshest report the view is built on, or null before anything has been
 * recorded. The maximum rather than the minimum: this dates the page's data as
 * a whole, and a monitor that has fallen behind says so on its own card.
 */
const lastReport = (monitors) =>
  monitors.length ? Math.max(...monitors.map((monitor) => monitor.lastUpdate)) : null;

function overallSummary(monitors) {
  const down = monitors.filter((monitor) => monitor.state === MonitorState.Down);
  const unknown = monitors.filter((monitor) => monitor.state === MonitorState.Unknown);

  let state = MonitorState.Operational;
  if (down.length) state = MonitorState.Down;
  else if (unknown.length || !monitors.length) state = MonitorState.Unknown;

  return { state, down, unknown };
}

/**
 * Aggregate a run of day cells.
 *
 * Unobserved time -- no-data and excluded spans alike -- leaves the denominator
 * entirely rather than being counted as healthy, so uptime always reads as a
 * share of what was actually observed.
 */
export function summarize(cells) {
  let tracked = 0;
  let down = 0;
  let unobserved = 0;

  for (const cell of cells) {
    tracked += cell.tracked;
    down += cell.down;
    unobserved += cell.noData + cell.excluded;
  }

  const observed = tracked - unobserved;
  return {
    tracked,
    down,
    unobserved,
    uptime: observed > 0 ? (observed - down) / observed : null,
  };
}

/**
 * Severity of one logged interval, or the reason it has none. See OutageKind
 * for why counting is read before wording.
 */
function outageKind(outage, seconds) {
  if (!isCounted(outage)) return outage.untracked ? OutageKind.NoData : OutageKind.Excluded;
  return seconds > MAJOR_OUTAGE_SECONDS ? OutageKind.Major : OutageKind.Minor;
}

/**
 * The server writes a start of 0 for the stretch before a monitor was ever
 * seen. It still greys the day bars it covers -- those days really did go
 * unobserved -- but it is not an outage anyone can act on, so the log omits it.
 */
const isPreHistory = (outage) => outage.start === 0;

/**
 * One outage as a row in the recent-outage list.
 *
 * The start is clipped to the window: an outage that began before it would
 * otherwise report a span longer than the period on screen. The end needs no
 * clipping -- an open outage runs only to `now`, and a closed one cannot end
 * later than that.
 *
 * So `seconds` is a floor rather than a measurement whenever `clipped` is set,
 * which the row has to say out loud. Severity is read off the same clipped
 * span, so the duration shown and the colour shown always agree.
 */
function buildOutageEntry(outage, label, windowStart, now) {
  const start = Math.max(outage.start, windowStart);
  const seconds = outageEnd(outage, now) - start;

  return {
    key: `${outage.monitor_id}:${outage.start}`,
    // The row's identity in the database is (monitor_id, start). `start` above
    // is clipped to the window for display, so the true one is carried too --
    // a patch addressed to the clipped value would not match any row.
    monitorId: outage.monitor_id,
    startedAt: outage.start,
    monitorLabel: label,
    start,
    seconds,
    kind: outageKind(outage, seconds),
    ongoing: outage.end == null,
    clipped: outage.start < windowStart,
    untracked: outage.untracked,
    excluded: outage.excluded ?? null,
    notes: outage.notes ?? null,
  };
}

/**
 * Raw payload -> view model.
 *
 * `visible` names which monitors the view is built from, and in what order. It
 * governs the cards and the outage log alike, so a row never appears for a
 * monitor with no card above it.
 *
 * A monitor the server has never recorded is skipped rather than carded as
 * unknown, since it has reported no cadence to be judged against.
 */
export function buildView(payload, now, visible = SHOWN_MONITORS) {
  const days = buildDayGrid(now, DAY_COUNT);
  const windowStart = days[0].start;
  const rowsById = new Map((payload.monitors ?? []).map((row) => [row.monitor_id, row]));
  const outagesByMonitor = groupByMonitor(payload.outages ?? []);

  const monitors = visible
    .filter((id) => rowsById.has(id))
    .map((id) => buildMonitor(rowsById.get(id), outagesByMonitor.get(id) ?? [], days, now));

  // Read off the monitors that were actually built rather than the list asked
  // for, so a monitor the payload has outages but no row for cannot put rows in
  // the log with no card above them.
  const carded = new Set(monitors.map((monitor) => monitor.id));

  const recent = (payload.outages ?? [])
    .filter(
      (outage) =>
        carded.has(outage.monitor_id) &&
        !isPreHistory(outage) &&
        outageEnd(outage, now) > windowStart,
    )
    .map((outage) => buildOutageEntry(outage, humanizeId(outage.monitor_id), windowStart, now))
    .sort((a, b) => b.start - a.start || a.monitorLabel.localeCompare(b.monitorLabel));

  return {
    monitors,
    overall: overallSummary(monitors),
    recent,
    lastUpdate: lastReport(monitors),
  };
}
