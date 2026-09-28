/**
 * Label chip. Callers supply the colour classes for their vocabulary.
 *
 * The colour is the background's to carry, so there is no swatch: every caller
 * already says the same thing in tone somewhere adjacent -- the outage log's
 * rule down the side of a row, the card's own coloured wording -- and a dot
 * inside the chip only said it a third time.
 *
 * Squared off to `rounded`, the radius the page's small controls use, rather
 * than the capsule a chip defaults to.
 */
export default function Pill({ className, children }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}
