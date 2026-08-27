import { barsThatFit } from "../components/barGeometry.js";
import { useElementWidth } from "./useElementWidth.js";

/** Fewest days worth drawing a strip for at all. */
const MIN_VISIBLE_DAYS = 30;

/**
 * How many trailing days fit in the measured element at a legible bar width.
 *
 * Narrow viewports show a shorter window rather than hairline bars. The caller
 * aggregates over whatever range this yields, so the headline uptime and the
 * bars always describe the same period.
 *
 * MIN_VISIBLE_DAYS bounds that shortening and is the one case where the fit is
 * knowingly overrun: below about 208px of strip the bars keep their width and
 * spill rather than the window dropping under a month.
 *
 * @returns {[(node: Element | null) => void, number]} ref callback and day count
 */
export function useVisibleDays(available) {
  const [ref, width] = useElementWidth();

  const count = width
    ? Math.max(MIN_VISIBLE_DAYS, Math.min(available, barsThatFit(width)))
    : available;

  return [ref, count];
}
