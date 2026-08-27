import { useCallback, useState } from "react";

import { verifyPassword } from "../api/status.js";

/**
 * The admin credential, held for as long as the page stays open and no longer.
 *
 * In memory deliberately. The password is a bearer token sent with every write,
 * so putting it in session or local storage would leave a working credential on
 * disk for anything able to read it. The cost is re-entering it after a
 * refresh, which is the right trade for a control used a few times a month.
 *
 * `unlock` reports whether the password was accepted and throws only if the
 * question could not be asked, so the modal can tell a wrong password from an
 * unreachable server.
 */
export function useAdmin() {
  const [password, setPassword] = useState(null);

  const unlock = useCallback(async (candidate) => {
    const accepted = await verifyPassword(candidate);
    if (accepted) setPassword(candidate);
    return accepted;
  }, []);

  const lock = useCallback(() => setPassword(null), []);

  return { password, unlocked: password !== null, unlock, lock };
}
