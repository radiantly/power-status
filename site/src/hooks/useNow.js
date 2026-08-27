import { useEffect, useState } from "react";

import { CLOCK_INTERVAL_MS } from "../domain/config.js";
import { nowSeconds } from "../domain/time.js";

/**
 * The current time in Unix seconds, advancing on a coarse tick.
 *
 * Elapsed durations and staleness must keep moving between polls, and having a
 * single clock source keeps `now` consistent across everything derived in one
 * render pass.
 */
export function useNow() {
  const [now, setNow] = useState(nowSeconds);

  useEffect(() => {
    const timer = setInterval(() => setNow(nowSeconds()), CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return now;
}
