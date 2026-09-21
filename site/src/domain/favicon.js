/**
 * The tab icon, drawn for a given overall state.
 *
 * Pure like the rest of `domain/`: handed a colour, it returns a URI, and knows
 * nothing about the document that will end up wearing it. Resolving the token
 * and doing the assigning is `hooks/useFavicon.js`'s job.
 */

import { MonitorState } from "./status.js";

/**
 * Each state's colour, named as a token rather than written out.
 *
 * Resolved against the live stylesheet at paint time, so the dot is tinted with
 * whatever `index.css` currently means by "up" -- the dark scheme's value
 * included, which the static favicon used to carry its own silent copy of.
 *
 * The twin of `PILL` in `components/StatePill.jsx`: the circle below is that
 * component's dot at 32px and the two are meant to agree, so they are keyed
 * alike. One map cannot serve both, because Tailwind needs its class names
 * written out literally and this needs the custom properties behind them.
 */
export const FAVICON_TOKEN = {
  [MonitorState.Operational]: "--color-up",
  [MonitorState.Down]: "--color-major",
  [MonitorState.Unknown]: "--color-untracked",
};

/**
 * The icon at 32px, with `color` filling the dot.
 *
 * The plate stays a literal rather than becoming `--color-canvas`. It backs the
 * dot against browser chrome, which has a light and a dark of its own that the
 * page's scheme says nothing about; a plate that followed the page would go
 * white on white in half of them.
 *
 * `public/favicon.svg` draws this same shape for the moment before this module
 * runs and for anyone with no JS. The two are kept in step by hand.
 */
export function faviconDataUri(color) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="8" fill="#1c1f26"/>` +
    `<circle cx="16" cy="16" r="7" fill="${color}"/>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
