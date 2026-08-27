/** Transport only -- the shape of the payload is interpreted in domain/status. */

const STATUS_ENDPOINT = "/api/status";
const MONITORS_ENDPOINT = "/api/monitors";

/**
 * Path the password check is sent to.
 *
 * The server answers a patch that sets nothing before it looks anything up, so
 * the ids here are never dereferenced and no such outage has to exist.
 */
const AUTH_PROBE = `${MONITORS_ENDPOINT}/-/outages/0`;

const outagePath = (monitorId, start) =>
  `${MONITORS_ENDPOINT}/${encodeURIComponent(monitorId)}/outages/${start}`;

/** Thrown when the server rejects the admin password, so callers can re-lock. */
export class UnauthorizedError extends Error {
  constructor() {
    super("The admin password was rejected.");
    this.name = "UnauthorizedError";
  }
}

/** Writes carry the admin password as a bearer token. */
const authorized = (password) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${password}`,
});

/**
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ monitors: object[], outages: object[] }>}
 */
export async function fetchStatus(signal) {
  const response = await fetch(STATUS_ENDPOINT, {
    signal,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Status request failed with ${response.status}`);
  }

  return response.json();
}

/**
 * Checks an admin password.
 *
 * Sent as a patch with no fields set, which the server short-circuits before it
 * reaches the database. So this asks about the credential and nothing else, and
 * changes nothing whichever way it is answered.
 *
 * A rejected password is a `false` rather than a throw -- it is an ordinary
 * answer to the question asked. Anything else that goes wrong throws, so the
 * caller can tell a wrong password from an unreachable server.
 *
 * @param {string} password
 * @param {AbortSignal} [signal]
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, signal) {
  const response = await fetch(AUTH_PROBE, {
    method: "PATCH",
    signal,
    headers: authorized(password),
    body: "{}",
  });

  if (response.status === 401) return false;

  if (!response.ok) {
    throw new Error(`Could not check the password (${response.status}).`);
  }

  return true;
}

/**
 * Attaches a note to one outage, or excludes it from the uptime figure.
 *
 * An outage is addressed by the pair that identifies it in the database, and
 * `patch` carries only the fields being changed: an omitted field is left as it
 * is, and an explicit null clears it.
 *
 * @param {string} monitorId
 * @param {number} start unclipped start of the outage
 * @param {{ excluded?: boolean | null, notes?: string | null }} patch
 * @param {string} password
 * @param {AbortSignal} [signal]
 */
export async function patchOutageInfo(monitorId, start, patch, password, signal) {
  const response = await fetch(outagePath(monitorId, start), {
    method: "PATCH",
    signal,
    headers: authorized(password),
    body: JSON.stringify(patch),
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (response.status === 404) {
    throw new Error("That outage no longer exists.");
  }

  if (!response.ok) {
    throw new Error(`Update failed with ${response.status}`);
  }
}
