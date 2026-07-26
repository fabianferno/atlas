/**
 * The containment argument, with its own proof attached.
 *
 * The toggle here is the shipped `SkinToggle`, not a copy of it — `data-skin`
 * lives on the document element, so pressing it re-expresses the hero, the
 * morph and every section on this page at once. That is a stronger
 * demonstration than any diagram of the same claim, and it costs one import.
 */
import { SectionHead } from "@/components/board/chrome";
import { SkinToggle } from "@/components/board/skin-toggle";

export function ContainmentSection() {
  return (
    <section className="py-16 sm:py-24">
      <SectionHead title="It sends a name. It never sends code." note="A2UI v0.9.1" />

      <div className="mt-6 max-w-[46rem] space-y-4 text-sm leading-relaxed">
        <p>
          The model emits a declarative document and a data model. No markup, no class names, no
          styles, no module path. Rendering is a map lookup:
        </p>
      </div>

      <pre className="mono mt-4 max-w-[46rem] overflow-x-auto rounded-[var(--radius)] border border-hairline bg-[var(--card-b)] p-4 text-xs">
        <code>{`lookupCatalog(name) ?? <UnknownComponent/>`}</code>
      </pre>

      <div className="mt-4 max-w-[46rem] space-y-4 text-sm leading-relaxed">
        <p>
          There is no <span className="fig">eval</span>, no <span className="fig">new Function</span>
          , no <span className="fig">dangerouslySetInnerHTML</span> and no dynamic import keyed on
          model output anywhere in the renderer. A name outside the catalog renders a visible, inert
          placeholder — never nothing, never something executable. For a generated interface that can
          move money, that containment is the entire safety argument.
        </p>
        <p>
          <strong>Press this.</strong> One attribute re-expresses the whole system in a different
          material — no component changes, no catalog changes, nothing round-trips to the agent. That
          the swap is possible at all is the proof the interface is data.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SkinToggle />
        <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
          re-skins this page, the deck above it, and every mini app on it
        </span>
      </div>
    </section>
  );
}
