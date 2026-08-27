/**
 * Tunable constants for how raw monitor data is interpreted for display.
 * The backend records intervals only; every judgement about severity,
 * staleness and window size is made here.
 */

/**
 * Monitors shown on the public page, in the order they are rendered.
 *
 * Membership and order in one list. The payload carries every monitor the
 * server records, internal ones included -- the hourly backup belongs on the
 * admin page rather than here -- and anything absent from this list is dropped
 * whole: its card, its rows in the outage log, and its say in the overall
 * banner.
 */
export const PUBLIC_MONITORS = ["power", "internet"];

/** Days of history shown and aggregated over. */
export const DAY_COUNT = 90;

/**
 * The line between a major outage (red) and a minor one (orange).
 *
 * Applied twice, deliberately: to a day's total counted downtime for the bar
 * colour, and to a single interval's length for its row in the outage list.
 * One constant keeps those two readings of "major" from drifting apart.
 */
export const MAJOR_OUTAGE_SECONDS = 10 * 60;

/**
 * Share of a day's elapsed time that must be unknown before a day with no
 * counted downtime is drawn as untracked rather than operational.
 */
export const UNTRACKED_DAY_RATIO = 0.5;

/**
 * How many of its own reporting intervals a monitor may miss before it is
 * reported as unknown rather than as its last known state.
 *
 * Applied to the `next_update_in` each monitor reports, so a ten-second poll
 * and an hourly backup are judged against their own cadence rather than one
 * shared timeout. Two is the gap the server itself treats as a lapse, so the
 * page reads unknown for exactly the stretches the database records as
 * untracked.
 */
export const STALE_UPDATE_FACTOR = 2;

/** How often the status payload is refetched. */
export const POLL_INTERVAL_MS = 30_000;

/** How often the local clock used for elapsed/staleness maths advances. */
export const CLOCK_INTERVAL_MS = 5_000;

/**
 * How long a single status request may run before it is abandoned.
 *
 * Shorter than POLL_INTERVAL_MS on purpose: a request that has not answered by
 * the time the next poll is due is never going to be the freshest data, so it
 * is cut loose rather than left to race its successor.
 */
export const REQUEST_TIMEOUT_MS = 10_000;
