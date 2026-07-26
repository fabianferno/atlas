/**
 * The pipeline trace — resolve, health-check, fan-out, compose — printing a
 * line at a time between the prompt and the interface.
 *
 * It is here because the jump from a sentence to a finished UI is too large to
 * read as anything but magic, and "the agent did something clever" is the wrong
 * takeaway. Four lines of what actually happened make the interface look
 * derived rather than dreamt.
 *
 * Lines hold their space from the first frame (`opacity-0`, not unmounted) so
 * the block does not grow line by line and shove the frame beside it down four
 * times per scene.
 */
export function Trace({ lines, shown }: { lines: readonly string[]; shown: number }) {
  return (
    <ul
      className="mono mt-3 space-y-1 text-[0.6875rem] text-[var(--muted-ink)]"
      // Not a live region: these are decorative narration of a demonstration,
      // and announcing four lines per scene on a loop would make the page
      // unusable with a screen reader.
      aria-hidden
    >
      {lines.map((line, i) => (
        <li
          key={line}
          className={i < shown ? "opacity-100 transition-opacity duration-200" : "opacity-0"}
        >
          {line}
        </li>
      ))}
    </ul>
  );
}
