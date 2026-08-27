import { MonitorState } from "../domain/status.js";
import Pill from "./Pill.jsx";

const PILL = {
  [MonitorState.Operational]: {
    className: "bg-up-soft text-up",
    dotClassName: "bg-up",
    label: "Operational",
  },
  [MonitorState.Down]: {
    className: "bg-major-soft text-major",
    dotClassName: "bg-major",
    label: "Outage",
  },
  [MonitorState.Unknown]: {
    className: "bg-untracked-soft text-muted",
    dotClassName: "bg-untracked",
    label: "No data",
  },
};

export default function StatePill({ state, children }) {
  const pill = PILL[state] ?? PILL[MonitorState.Unknown];

  return (
    <Pill className={pill.className} dotClassName={pill.dotClassName}>
      {children ?? pill.label}
    </Pill>
  );
}
