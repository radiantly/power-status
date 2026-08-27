import { DAY_COUNT } from "../domain/config.js";
import { formatDuration, formatIso, formatStamp } from "../domain/format.js";
import { OutageKind } from "../domain/status.js";
import Pill from "./Pill.jsx";

const KIND = {
  [OutageKind.Major]: {
    label: "Major",
    rule: "bg-major",
    pill: "bg-major-soft text-ink",
    dot: "bg-major",
  },
  [OutageKind.Minor]: {
    label: "Minor",
    rule: "bg-minor",
    pill: "bg-minor-soft text-ink",
    dot: "bg-minor",
  },
  // NoData and Excluded are both grey on purpose: one span the monitor could
  // not see and one a human waved off are equally absent from the uptime
  // figure, and only the wording separates them.
  [OutageKind.NoData]: {
    label: "No data",
    rule: "bg-untracked",
    pill: "bg-untracked-soft text-ink",
    dot: "bg-untracked",
  },
  [OutageKind.Excluded]: {
    label: "Excluded",
    rule: "bg-untracked",
    pill: "bg-untracked-soft text-ink",
    dot: "bg-untracked",
  },
};

/**
 * Two layouts over one DOM.
 *
 * Narrow: two stacked rows -- timestamp and duration on the left of the first,
 * pill on its right, name and description across the second.
 * Wide: the single five-column row, whose tracks live on the list so that every
 * column is sized by the widest cell across all rows (see the <ul>).
 *
 * Children are written in the narrow order, which auto-places correctly there
 * and also reads sensibly aloud; the wide layout restores its own order with
 * explicit column starts rather than duplicating the markup per breakpoint.
 */
export default function RecentOutages({ outages }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium tracking-wider text-muted uppercase">
        Recent outages
      </h2>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {outages.length === 0 ? (
          <p className="p-4 text-sm text-muted sm:p-5">No outages in the last {DAY_COUNT} days.</p>
        ) : (
          <ul className="divide-y divide-line sm:grid sm:grid-cols-[auto_auto_1fr_auto_auto] sm:gap-x-4">
            {outages.map((outage) => {
              const kind = KIND[outage.kind];

              return (
                <li
                  key={outage.key}
                  className="grid min-h-16 grid-cols-[auto_auto_auto_1fr] items-center gap-x-2 px-4 py-3 sm:col-span-full sm:grid-cols-subgrid sm:gap-x-4 sm:gap-y-0 sm:px-5"
                >
                  {/*
                    Spans both narrow rows, inset so it reads as a marker rather
                    than a divider. The insets are uneven on purpose: the first
                    row is as tall as the pill, so the timestamp's line box sits
                    a few px inside it, while the last row is exactly its own
                    line box. Equal margins would therefore look bottom-heavy.
                  */}
                  <span
                    className={`row-span-2 mt-1.5 mb-0.5 w-1 self-stretch rounded-full sm:col-[1] sm:row-[1] sm:my-1.5 ${kind.rule}`}
                  />

                  <time
                    dateTime={formatIso(outage.start)}
                    className="font-mono text-xs text-muted sm:col-[2] sm:row-[1]"
                  >
                    {formatStamp(outage.start)}
                  </time>

                  {/*
                    A clipped span is a floor, not a measurement, so it is
                    marked. The separator only exists where the timestamp and
                    the duration sit on one line.
                  */}
                  <span className="font-mono text-xs text-muted before:mr-1.5 before:content-['·'] sm:col-[5] sm:row-[1] sm:text-right sm:before:content-none">
                    {outage.clipped && "≥"}
                    {formatDuration(outage.seconds)}
                    {outage.ongoing && " · ongoing"}
                  </span>

                  <Pill
                    className={`justify-self-end sm:col-[4] sm:row-[1] ${kind.pill}`}
                    dotClassName={kind.dot}
                  >
                    {kind.label}
                  </Pill>

                  <div className="col-span-3 min-w-0 sm:col-[3] sm:row-[1]">
                    <p className="text-sm font-semibold text-ink">{outage.monitorLabel}</p>
                    {outage.notes && <p className="mt-0.5 text-xs text-muted">{outage.notes}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
