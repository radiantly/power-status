import { formatDuration, formatUptime } from "../domain/format.js";
import { MonitorState, summarize } from "../domain/status.js";
import StatePill from "./StatePill.jsx";
import UptimeBar from "./UptimeBar.jsx";

function currentStateLabel(monitor, now) {
  if (monitor.state === MonitorState.Down && monitor.ongoingSince != null) {
    return `Down for ${formatDuration(now - monitor.ongoingSince)}`;
  }
  if (monitor.state === MonitorState.Unknown) {
    return `No data for ${formatDuration(now - monitor.lastUpdate)}`;
  }
  return undefined;
}

export default function MonitorCard({ monitor, now }) {
  const summary = summarize(monitor.days);

  return (
    <section className="rounded-lg border border-line bg-surface p-[var(--card-pad)]">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-ink">{monitor.label}</h2>
          {monitor.description && (
            <p className="mt-0.5 text-xs text-muted">{monitor.description}</p>
          )}
        </div>
        <StatePill state={monitor.state}>{currentStateLabel(monitor, now)}</StatePill>
      </header>

      <UptimeBar cells={monitor.days} />

      <footer className="mt-2 flex items-center gap-3 text-xs text-muted">
        <span>{monitor.days.length} days ago</span>
        <span className="h-px flex-1 bg-line" />
        <span className="whitespace-nowrap">{formatUptime(summary.uptime)} uptime</span>
        <span className="h-px flex-1 bg-line" />
        <span>Today</span>
      </footer>
    </section>
  );
}
