import { formatDuration, formatUptime } from "../domain/format.js";
import { MonitorState, summarize } from "../domain/status.js";
import { useVisibleDays } from "../hooks/useVisibleDays.js";
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
  const [ref, dayCount] = useVisibleDays(monitor.days.length);
  const cells = monitor.days.slice(monitor.days.length - dayCount);
  const summary = summarize(cells);

  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-medium text-ink">{monitor.label}</h2>
        <StatePill state={monitor.state}>{currentStateLabel(monitor, now)}</StatePill>
      </header>

      <div ref={ref}>
        <UptimeBar cells={cells} />
      </div>

      <footer className="mt-2 flex items-center gap-3 text-xs text-muted">
        <span>{dayCount} days ago</span>
        <span className="h-px flex-1 bg-line" />
        <span className="whitespace-nowrap">{formatUptime(summary.uptime)} uptime</span>
        <span className="h-px flex-1 bg-line" />
        <span>Today</span>
      </footer>
    </section>
  );
}
