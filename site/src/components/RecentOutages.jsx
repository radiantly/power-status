import { Fragment, useState } from "react";
import { FiEdit2 } from "react-icons/fi";

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
 * `excluded` holds three states, but only two of them mean anything for any one
 * row, so the form offers a checkbox rather than a three-way choice.
 *
 * Null defers to whether the monitor could see anything and is the right answer
 * for almost every row, so it is the unchecked state. Checking the box
 * overrules it in the only direction that says something new: a stretch the
 * monitor was blind for becomes a real outage, and an observed outage stops
 * counting against uptime. Which of those it is depends on the row, and so does
 * the wording.
 */
const overrideFor = (untracked) => !untracked;

const overrideLabel = (untracked) =>
  untracked ? "Mark as outage" : "Exclude outage from uptime calculation";

const CONTROL = "rounded border border-line bg-surface text-sm text-ink";
const BUTTON = "rounded px-3 py-1.5 text-xs font-medium transition disabled:opacity-50";

function OutageEditor({ outage, onSave, onClose }) {
  const [notes, setNotes] = useState(outage.notes ?? "");
  // Checked only when the stored value is the override this row's label
  // describes; a redundant value reads as unchecked and is normalised to null
  // on the next save.
  const [override, setOverride] = useState(outage.excluded === overrideFor(outage.untracked));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const trimmed = notes.trim();

    try {
      // Both fields are sent every time. The form was seeded from what is
      // stored, so a field left empty is an instruction to clear it rather than
      // an omission -- which is why the API distinguishes null from absent.
      await onSave(outage, {
        excluded: override ? overrideFor(outage.untracked) : null,
        notes: trimmed === "" ? null : trimmed,
      });
      onClose();
    } catch (cause) {
      setError(cause);
      setSaving(false);
    }
  }

  return (
    <li className="bg-canvas px-[var(--card-pad)] py-3 sm:col-span-full">
      <form onSubmit={submit} className="grid gap-3">
        {/* The placeholder names the field, so the label is for screen readers
            only rather than a heading over a single obvious input. */}
        <input
          type="text"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          aria-label="Note"
          placeholder="Add a note…"
          className={`${CONTROL} p-2`}
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={override}
              onChange={(event) => setOverride(event.target.checked)}
              className="size-4 accent-ink"
            />
            {overrideLabel(outage.untracked)}
          </label>

          <div className="flex flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`${BUTTON} border border-line text-muted hover:text-ink`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${BUTTON} bg-ink text-canvas enabled:hover:opacity-90`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-major">{error.message}</p>}
      </form>
    </li>
  );
}

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
 *
 * `onSave` makes the list editable: each row grows an edit control beside its
 * pill, which opens the annotation form beneath that row and hands `onSave` the
 * outage and the patch to send. Only one row is open at a time -- two forms
 * over the same list would invite editing one while reading another. Without
 * `onSave` the list is read-only, which is what a client the API would refuse a
 * write from sees.
 */
export default function RecentOutages({ outages, onSave }) {
  const [openKey, setOpenKey] = useState(null);

  // Locking mid-edit closes the form with the session that opened it. Without
  // this the form stays up and fully interactive after `onSave` goes away, and
  // Save calls something that is no longer there.
  if (!onSave && openKey !== null) setOpenKey(null);

  return (
    <section>
      <h2 className="mb-2 text-xs font-medium tracking-wider text-muted uppercase">
        Recent outages
      </h2>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {outages.length === 0 ? (
          <p className="p-[var(--card-pad)] text-sm text-muted">
            No outages in the last {DAY_COUNT} days.
          </p>
        ) : (
          <ul className="divide-y divide-line sm:grid sm:grid-cols-[auto_auto_1fr_auto_auto] sm:gap-x-4">
            {outages.map((outage) => {
              const kind = KIND[outage.kind];
              const open = openKey === outage.key;

              return (
                <Fragment key={outage.key}>
                  <li className="group grid min-h-16 grid-cols-[auto_auto_auto_1fr] items-center gap-x-2 px-[var(--card-pad)] py-3 sm:col-span-full sm:grid-cols-subgrid sm:gap-x-4 sm:gap-y-0">
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

                    {/*
                      The pencil shares the pill's cell rather than taking a
                      column of its own, which keeps the wide layout at five
                      tracks and puts the two together in the narrow one as
                      well. Every row carries one, so the column still sizes
                      consistently across the list.

                      It fades in on row hover rather than appearing, so the
                      pill never shifts: the button holds its space throughout.
                      Hover alone would strand anyone without a pointer, so it
                      also shows on keyboard focus, while the row is being
                      edited, and unconditionally where hover does not exist.
                    */}
                    <div className="flex items-center gap-1.5 justify-self-end sm:col-[4] sm:row-[1]">
                      {onSave && (
                        <button
                          type="button"
                          onClick={() => setOpenKey(open ? null : outage.key)}
                          aria-expanded={open}
                          aria-label={`Edit the ${outage.monitorLabel} outage from ${formatStamp(outage.start)}`}
                          className={`rounded-full p-1.5 transition hover:bg-untracked-soft hover:text-ink focus-visible:opacity-100 ${
                            open
                              ? "bg-untracked-soft text-ink opacity-100"
                              : "text-muted opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                          }`}
                        >
                          <FiEdit2 className="size-3.5" aria-hidden="true" />
                        </button>
                      )}

                      <Pill className={kind.pill} dotClassName={kind.dot}>
                        {kind.label}
                      </Pill>
                    </div>

                    <div className="col-span-3 min-w-0 sm:col-[3] sm:row-[1]">
                      <p className="text-sm font-semibold text-ink">{outage.monitorLabel}</p>
                      {outage.notes && <p className="mt-0.5 text-xs text-muted">{outage.notes}</p>}
                    </div>
                  </li>

                  {open && (
                    <OutageEditor
                      outage={outage}
                      onSave={onSave}
                      onClose={() => setOpenKey(null)}
                    />
                  )}
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
