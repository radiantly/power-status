import { useRef, useState } from "react";
import { FaLock, FaUnlock } from "react-icons/fa";

/**
 * The admin control in the page header: a lock that opens a password prompt,
 * and an unlock that closes the session again.
 *
 * Built on the native <dialog> so that focus trapping, Escape, inertness of the
 * page behind it and the backdrop all come from the platform rather than from
 * handlers here that would have to be kept correct.
 */
export default function AdminLock({ unlocked, onUnlock, onLock }) {
  const dialog = useRef(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  const open = () => {
    setPassword("");
    setError(null);
    dialog.current?.showModal();
  };

  const close = () => dialog.current?.close();

  async function submit(event) {
    event.preventDefault();
    setChecking(true);
    setError(null);

    try {
      if (await onUnlock(password)) {
        close();
      } else {
        // A rejected password is an answer, not a failure: say so plainly and
        // leave the field as typed so a near miss can be corrected.
        setError("That password was not accepted.");
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={unlocked ? onLock : open}
        aria-label={unlocked ? "Lock editing" : "Unlock editing"}
        className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-[10px] font-medium tracking-wider text-muted uppercase transition-colors hover:border-muted hover:text-ink"
      >
        {unlocked ? (
          <FaUnlock className="size-3 text-ink" aria-hidden="true" />
        ) : (
          <FaLock className="size-3" aria-hidden="true" />
        )}
        Admin
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="admin-dialog-title"
        className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
      >
        <form onSubmit={submit} className="grid gap-3 p-5">
          <h2 id="admin-dialog-title" className="text-sm font-semibold">
            Admin password
          </h2>

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            autoComplete="current-password"
            aria-label="Admin password"
            className="rounded border border-line bg-canvas p-2 text-sm text-ink"
          />

          {error && <p className="text-xs text-major">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={checking || password === ""}
              className="rounded bg-ink px-3 py-1.5 text-xs font-medium text-canvas transition enabled:hover:opacity-90 disabled:opacity-50"
            >
              {checking ? "Checking…" : "Unlock"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
