/** Dot-and-label chip. Callers supply the colour classes for their vocabulary. */
export default function Pill({ className, dotClassName, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${className}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${dotClassName}`} />
      {children}
    </span>
  );
}
