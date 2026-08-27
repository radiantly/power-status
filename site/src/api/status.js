/** Transport only -- the shape of the payload is interpreted in domain/status. */

const STATUS_ENDPOINT = "/api/status";

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
