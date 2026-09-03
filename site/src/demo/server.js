/**
 * A stand-in for the Rust server, for the build published as a demo.
 *
 * The seam is `fetch` rather than `api/status.js`, so everything the real page
 * runs, the demo runs too: the transport's own status-code handling, the poll
 * loop, the abort logic, and the whole domain layer read a real Response and a
 * real payload. Substituting the api module instead would mean a second
 * implementation of that transport, free to drift from the one being
 * demonstrated.
 *
 * This module is only ever referenced by the script tag vite.config.js injects
 * under `--mode demo`, so nothing in the production build can reach it.
 *
 * The patch is installed synchronously, at module scope: it is a deferred
 * module script placed ahead of the app's, and what makes that ordering worth
 * anything is that nothing here is awaited before `fetch` has been replaced.
 */

import { MONITORS, buildOutages } from "./fixture.js";

/** Announced in the demo notice; it guards nothing, since there is no server. */
const PASSWORD = "demo";

const OUTAGE_PATH = /^\/api\/monitors\/([^/]+)\/outages\/(-?\d+)$/;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Fixed for the life of the page. Outage starts are addresses -- the annotation
 * route names a row by `(monitor_id, start)` -- so they have to stay put while
 * edits made against them are still held.
 */
const outages = buildOutages(nowSeconds());

/** Edits, by the same pair that identifies an outage in the database. */
const edits = new Map();

const identify = (monitorId, start) => `${monitorId}:${start}`;

const json = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const empty = (status) => new Response(null, { status });

/**
 * Every monitor reports as of now.
 *
 * Not a detail: `monitorState` reads a monitor as Unknown once it has missed
 * two of its own reporting intervals, so timestamps frozen at load would turn
 * all three cards grey shortly after the page opened. The demo is meant to show
 * a page that is being kept up to date, so it keeps itself up to date.
 */
const monitorRows = () => MONITORS.map((monitor) => ({ ...monitor, last_update: nowSeconds() }));

const outageRows = () =>
  outages.map((outage) => {
    const edit = edits.get(identify(outage.monitor_id, outage.start));
    return edit ? { ...outage, ...edit } : outage;
  });

/**
 * The annotation route.
 *
 * The order of the checks is the server's, and it matters: the credential is
 * examined before the body is looked at. The page checks a password by sending
 * a patch that sets nothing, so a fake that short-circuited on the empty body
 * first would answer 204 to every password ever typed and unlock for all of
 * them.
 *
 * A patch carries only the fields being changed, and null clears one -- so an
 * absent field is not the same as a null, and both are kept apart here for the
 * same reason `patch_field` exists in routes.rs.
 */
async function annotate(request, monitorId, start) {
  if (request.headers.get("Authorization") !== `Bearer ${PASSWORD}`) return empty(401);

  const patch = await request.json();
  const edit = {};
  if ("excluded" in patch) edit.excluded = patch.excluded;
  if ("notes" in patch) edit.notes = patch.notes;

  // A patch that sets nothing never reaches storage, and so never has to name
  // an outage that exists -- which is what lets it serve as a password check.
  if (Object.keys(edit).length === 0) return empty(204);

  const id = identify(monitorId, start);
  if (!outages.some((outage) => identify(outage.monitor_id, outage.start) === id)) {
    return empty(404);
  }

  edits.set(id, { ...edits.get(id), ...edit });
  return empty(204);
}

const real = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const request = new Request(input, init);
  const { pathname } = new URL(request.url, location.href);

  if (!pathname.startsWith("/api/")) return real(input, init);

  if (pathname === "/api/status" && request.method === "GET") {
    return json({ monitors: monitorRows(), outages: outageRows() });
  }

  const outage = OUTAGE_PATH.exec(pathname);
  if (outage && request.method === "PATCH") {
    return annotate(request, decodeURIComponent(outage[1]), Number(outage[2]));
  }

  return empty(404);
};
