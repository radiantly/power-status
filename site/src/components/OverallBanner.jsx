import { formatList } from "../domain/format.js";
import { MonitorState } from "../domain/status.js";

const BANNER = {
  [MonitorState.Operational]: "border-up bg-up-soft text-up",
  [MonitorState.Down]: "border-major bg-major-soft text-major",
  [MonitorState.Unknown]: "border-line bg-untracked-soft text-muted",
};

const list = (monitors) => formatList(monitors.map((monitor) => monitor.label));

function headline({ state, down, unknown }) {
  if (state === MonitorState.Down) return `${list(down)} ${down.length > 1 ? "are" : "is"} down`;
  if (state === MonitorState.Unknown) {
    return unknown.length ? `No recent data from ${list(unknown)}` : "No monitors reporting";
  }
  return "All systems operational";
}

export default function OverallBanner({ overall }) {
  return (
    <div className={`rounded-lg border px-4 py-3 font-medium sm:px-5 ${BANNER[overall.state]}`}>
      {headline(overall)}
    </div>
  );
}
