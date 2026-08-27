import { buildView } from "../domain/status.js";
import { useNow } from "../hooks/useNow.js";
import { useStatus } from "../hooks/useStatus.js";
import Legend from "./Legend.jsx";
import MonitorCard from "./MonitorCard.jsx";
import OverallBanner from "./OverallBanner.jsx";
import RecentOutages from "./RecentOutages.jsx";

function Shell({ children, footer }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="mb-6 text-xl font-semibold text-ink sm:text-2xl">Status</h1>
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
    <div className={`rounded-lg border px-4 py-3 text-sm sm:px-5 ${className}`}>{children}</div>
  );
}

export default function StatusPage() {
  const { phase, data, error } = useStatus();
  const now = useNow();

  if (phase === "loading") {
    return (
      <Shell>
        <Notice>Loading status…</Notice>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <Notice tone="error">Could not reach the status service. {error?.message}</Notice>
      </Shell>
    );
  }

  const view = buildView(data, now);

  return (
    <Shell
      footer={
        <div className="mt-8 space-y-4">
          <Legend />
          <RecentOutages outages={view.recent} />
          <p className="text-xs text-muted">
            Uptime excludes periods with no data, and those excluded by hand, rather than counting
            them as healthy.
          </p>
        </div>
      }
    >
      <OverallBanner overall={view.overall} />

      {phase === "stale" && <Notice>Showing the last known status — refreshing failed.</Notice>}

      {view.monitors.map((monitor) => (
        <MonitorCard key={monitor.id} monitor={monitor} now={now} />
      ))}
    </Shell>
  );
}
