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
import { formatList, humanizeId } from "./format.js";
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
 * How severe an outage looks, as opposed to what it is called.
 *
 * Deliberately coarser than the kind: NoData and Excluded are one tone, because
 * a span the monitor could not see and one a human waved off are equally absent
 * from the uptime figure and only the wording separates them. These are the
 * outage log's three-quarters of DayStatus -- the same vocabulary a bar uses,
 * less Operational, which no logged interval can be.
 *
 * Stated here rather than left implicit in whichever palette happens to draw a
 * row, because two things now depend on knowing it and they must not drift: the
 * palette, and the rule deciding which neighbouring rows may be told as one.
 */
export const OutageTone = {
  Major: "major",
  Minor: "minor",
  Untracked: "untracked",
};

const TONE = {
  [OutageKind.Major]: OutageTone.Major,
  [OutageKind.Minor]: OutageTone.Minor,
  [OutageKind.NoData]: OutageTone.Untracked,
  [OutageKind.Excluded]: OutageTone.Untracked,
};

export const outageTone = (kind) => TONE[kind];

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

function monitorState(monitor, ongoing, now) {
  if (
    now - monitor.last_update >
    monitor.next_update_in * STALE_UPDATE_FACTOR + POLL_INTERVAL_MS / 1000
  )
    return MonitorState.Unknown;

  if (!ongoing) return MonitorState.Operational;
  return ongoing.untracked ? MonitorState.Unknown : MonitorState.Down;
}

function buildMonitor(monitor, outages, days, now) {
  const ongoing = outages.find((outage) => outage.end == null) ?? null;

  return {
    id: monitor.monitor_id,
    label: humanizeId(monitor.monitor_id),
    description: MONITORS[monitor.monitor_id]?.description ?? null,
    state: monitorState(monitor, ongoing, now),
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

/**
 * Whether two neighbouring entries are one event told twice.
 *
 * A note is a person's account of what happened, so the same note on two
 * outages says they share a cause -- most often one cut that took out the power
 * and the internet together, logged once per monitor. An absent note says
 * nothing at all and so can never be that evidence.
 *
 * Tone rather than kind, because a merged row shows one pill and the pill is
 * what the reader believes: folding a major outage into a minor one would
 * misstate whichever lost. Two kinds share the untracked tone, so a no-data
 * stretch and an excluded one do merge -- see OutageTone.
 *
 * Neighbouring in the list, not merely somewhere in it: anything that happened
 * between the two is a reason to doubt they were the same event, and the list
 * is ordered so that "between" is simply the row in between.
 */
const sameEvent = (a, b) =>
  Boolean(a.notes) && a.notes === b.notes && outageTone(a.kind) === outageTone(b.kind);

/**
 * What a merged row is called, where its members may disagree.
 *
 * Only the untracked tone can disagree at all, since the other two are single
 * kinds. There, excluded wins: the run contains a judgement somebody made by
 * hand, and a row that said "no data" would bury it. The weaker word is kept
 * only for a run where nothing was ever judged.
 */
function rowKind(items) {
  const kind = items[0].kind;
  if (kind !== OutageKind.NoData && kind !== OutageKind.Excluded) return kind;
  return items.every((item) => item.kind === OutageKind.NoData)
    ? OutageKind.NoData
    : OutageKind.Excluded;
}

/** The monitors a row speaks for, in the list's own tiebreak order. */
const rowLabel = (items) =>
  formatList(
    [...new Set(items.map((item) => item.monitorLabel))].sort((a, b) => a.localeCompare(b)),
  );

/**
 * A run of entries as one row.
 *
 * The span runs from the earliest start to the latest end, which is what an
 * event lasted -- not the sum of its members, since two monitors that went down
 * together were down once, not twice. A run of one is its own span, so a merged
 * row reads exactly like an unmerged one: the timestamp is the moment the row's
 * duration is measured from, whether one outage or several are behind it.
 */
function buildRow(items) {
  // The list runs newest first, so the run's last member is the one that began
  // first.
  const earliest = items.at(-1);
  const end = Math.max(...items.map((item) => item.start + item.seconds));

  return {
    key: earliest.key,
    label: rowLabel(items),
    notes: earliest.notes,
    start: earliest.start,
    seconds: end - earliest.start,
    kind: rowKind(items),
    ongoing: items.some((item) => item.ongoing),
    clipped: items.some((item) => item.clipped),
    items,
  };
}

/**
 * The outage log's rows.
 *
 * Uniform by construction: every row carries the entries behind it, and a row
 * that merged nothing is a run of one, so the list has a single shape to draw
 * and no separate case for the common one.
 *
 * `collapse` is the caller's, because merging is a reading of the log rather
 * than a fact about it -- and one the log cannot afford while it is being
 * edited. Annotations are stored per outage, so an edit has to name one, and a
 * merged row deliberately no longer says which ones it stands for.
 */
export function toRows(entries, { collapse = true } = {}) {
  const runs = [];

  for (const entry of entries) {
    const run = runs.at(-1);
    // Both halves of sameEvent are equalities, so a run is homogeneous and its
    // last member can speak for the whole of it.
    if (collapse && run && sameEvent(run.at(-1), entry)) run.push(entry);
    else runs.push([entry]);
  }

  return runs.map(buildRow);
}
