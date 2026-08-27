/**
 * The one place the uptime strip's pixel geometry is stated.
 *
 * UptimeBar draws with these and useVisibleDays decides how many bars fit from
 * them; were the two ever to disagree the strip would silently overflow its
 * card. They are applied as inline styles rather than Tailwind utilities
 * because Tailwind's scanner cannot see a class name assembled at runtime, so
 * an arbitrary value like `min-w-[5px]` could only ever be a second, unlinked
 * copy of the number.
 */

/** Narrowest a day bar may be drawn and still read as a bar. */
const BAR_MIN_WIDTH = 5;

/** Space between adjacent day bars. */
const BAR_GAP = 2;

export const stripStyle = { gap: `${BAR_GAP}px` };

export const barStyle = { minWidth: `${BAR_MIN_WIDTH}px` };

/**
 * Longest run of bars that fits in `width` pixels: n of them span
 * n * BAR_MIN_WIDTH + (n - 1) * BAR_GAP, so n <= (width + gap) / (bar + gap).
 */
export const barsThatFit = (width) => Math.floor((width + BAR_GAP) / (BAR_MIN_WIDTH + BAR_GAP));
