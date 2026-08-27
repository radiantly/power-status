const ENTRIES = [
  { className: "bg-up", label: "Operational" },
  { className: "bg-minor", label: "Minor outage" },
  { className: "bg-major", label: "Major outage" },
  { className: "bg-untracked", label: "No data" },
];

export default function Legend() {
  return (
    <ul className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-xs text-muted">
      {ENTRIES.map((entry) => (
        <li key={entry.label} className="flex items-center gap-2">
          <span className={`h-3 w-1.5 rounded-xs ${entry.className}`} />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
