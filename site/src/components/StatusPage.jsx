import { UnauthorizedError, patchOutageInfo } from "../api/status.js";
import { formatDuration, formatIso } from "../domain/format.js";
import { buildView } from "../domain/status.js";
import { useAdmin } from "../hooks/useAdmin.js";
import { useNow } from "../hooks/useNow.js";
import { useStatus } from "../hooks/useStatus.js";
import AdminLock from "./AdminLock.jsx";
import Legend from "./Legend.jsx";
import MonitorCard from "./MonitorCard.jsx";
import OverallBanner from "./OverallBanner.jsx";
import RecentOutages from "./RecentOutages.jsx";

function Shell({ action, children, footer }) {
  return (
    <div className="mx-auto min-h-dvh w-[var(--page-w)] max-w-full py-10 sm:py-14">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">Status</h1>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
      {footer}
    </div>
  );
}

function Notice({ children, tone = "muted" }) {
  const className =
    tone === "error"
      ? "border-major bg-major-soft text-major"
      : "border-line bg-surface text-muted";
  return (
    <div className={`rounded-lg border px-[var(--card-pad)] py-3 text-sm ${className}`}>
      {children}
    </div>
  );
}

export default function StatusPage() {
  const { phase, data, error, refresh } = useStatus();
  const now = useNow();
  const admin = useAdmin();

  const lock = <AdminLock unlocked={admin.unlocked} onUnlock={admin.unlock} onLock={admin.lock} />;

  if (phase === "loading") {
    return (
      <Shell action={lock}>
        <Notice>Loading status…</Notice>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell action={lock}>
        <Notice tone="error">Could not reach the status service. {error?.message}</Notice>
      </Shell>
    );
  }

  const view = buildView(data, now);

  // The refetch is what puts a saved note back on screen: the row re-renders
  // from the server's copy rather than from what was typed, so a write that did
  // not land the way it was written shows as itself.
  const save = async (outage, patch) => {
    try {
      await patchOutageInfo(outage.monitorId, outage.startedAt, patch, admin.password);
    } catch (error) {
      // A credential the server has stopped accepting is worse than none: it
      // leaves the page offering controls that cannot work. Drop it, which
      // closes the form and puts the lock back.
      if (error instanceof UnauthorizedError) admin.lock();
      throw error;
    }

    refresh();
  };

  return (
    <Shell
      action={lock}
      footer={
        <div className="mt-8 space-y-4">
          <Legend />
          <RecentOutages outages={view.recent} onSave={admin.unlocked ? save : undefined} />
          {view.lastUpdate != null && (
            <p className="text-xs text-muted">
              Last updated{" "}
              <time dateTime={formatIso(view.lastUpdate)}>
                {formatDuration(now - view.lastUpdate)} ago
              </time>
            </p>
          )}
        </div>
      }
    >
      <OverallBanner overall={view.overall} />

      {phase === "stale" && <Notice>Failed to refresh. Showing the last known status.</Notice>}

      {view.monitors.map((monitor) => (
        <MonitorCard key={monitor.id} monitor={monitor} now={now} />
      ))}
    </Shell>
  );
}
