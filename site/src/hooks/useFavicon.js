import { useEffect } from "react";

import { FAVICON_TOKEN, faviconDataUri } from "../domain/favicon.js";

/** The scheme in force; `index.css` gives the tokens different values in each. */
const DARK_SCHEME = "(prefers-color-scheme: dark)";

/**
 * Keeps the tab icon showing the overall state.
 *
 * A status page is something you leave pinned in a background tab, where the
 * icon is the only part of it on screen -- so it carries the same verdict as the
 * banner rather than staying green through an outage.
 *
 * A null state leaves the icon alone instead of colouring it unknown. Until the
 * first poll answers, "nothing known yet" is the loading screen's business;
 * greying the tab for a second on every load would report a blackout that isn't
 * one.
 */
export function useFavicon(state) {
  useEffect(() => {
    if (state == null) return;

    const link = document.querySelector('link[rel="icon"]');
    if (!link) return;

    // Read at paint rather than once at import: the value depends on the scheme
    // in force, and that can change while the page is open.
    const paint = () => {
      const color = getComputedStyle(document.documentElement)
        .getPropertyValue(FAVICON_TOKEN[state])
        .trim();
      if (color) link.href = faviconDataUri(color);
    };

    paint();

    const scheme = window.matchMedia(DARK_SCHEME);
    scheme.addEventListener("change", paint);
    return () => scheme.removeEventListener("change", paint);
  }, [state]);
}
