import { useCallback, useEffect, useState } from "react";

import { fetchStatus } from "../api/status.js";
import { POLL_INTERVAL_MS, REQUEST_TIMEOUT_MS } from "../domain/config.js";

/**
 * Polls /api/status.
 *
 * A failed refresh never discards data that was already loaded -- a status page
 * that blanks out because one poll timed out is worse than one showing slightly
 * old numbers next to a warning.
 *
 * At most one request is ever outstanding: a poll still running when the next is
 * due is aborted, so a hung request can neither accumulate nor land after its
 * successor and overwrite fresher data with older. `inFlight` is the single
 * arbiter -- a load whose controller is no longer the current one has been
 * superseded, or the hook unmounted, and applies nothing. Being superseded is
 * not a failure and sets no error phase; timing out is, and does.
 *
 * `refresh` polls immediately, for a caller that has just written something and
 * should not have to wait out the interval. It restarts the schedule rather
 * than adding to it, so repeated edits cannot stack up overlapping timers.
 *
 * @returns {{ phase: 'loading' | 'ready' | 'stale' | 'error', data: object | null,
 *             error: Error | null, fetchedAt: number | null, refresh: () => void }}
 */
export function useStatus() {
  const [result, setResult] = useState({
    phase: "loading",
    data: null,
    error: null,
    fetchedAt: null,
  });
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let inFlight = null;

    async function load() {
      inFlight?.abort();

      const controller = new AbortController();
      inFlight = controller;

      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);

      try {
        const data = await fetchStatus(signal);
        if (inFlight !== controller) return;
        setResult({ phase: "ready", data, error: null, fetchedAt: Date.now() });
      } catch (error) {
        if (inFlight !== controller) return;
        setResult((previous) => ({
          ...previous,
          phase: previous.data ? "stale" : "error",
          error,
        }));
      }
    }

    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      inFlight?.abort();
      inFlight = null;
      clearInterval(timer);
    };
  }, [epoch]);

  const refresh = useCallback(() => setEpoch((previous) => previous + 1), []);

  return { ...result, refresh };
}
