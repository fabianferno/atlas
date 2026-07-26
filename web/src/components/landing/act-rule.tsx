/**
 * The seam between the two acts.
 *
 * Everything above it is the case for the product. Everything below it is
 * checkable. Marking the boundary means a reader who only came to verify a
 * sponsor claim can find where to start, and a reader who came for the idea
 * knows when they have finished it.
 */
export function ActRule() {
  return (
    <div className="flex items-center gap-4 py-4" role="separator">
      <span className="h-px flex-1 bg-[var(--hairline)]" />
      <span className="mono text-center text-[0.625rem] uppercase tracking-[0.16em] text-[var(--muted-ink)]">
        everything below this line is checkable
      </span>
      <span className="h-px flex-1 bg-[var(--hairline)]" />
    </div>
  );
}
