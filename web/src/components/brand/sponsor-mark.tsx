/**
 * Sponsor marks — whose infrastructure a fact on screen came from.
 *
 * Three protocols do real work in this product and the UI names all three in
 * prose, scattered across a dozen files: The Graph answers every query, ENS
 * holds every name, 0G runs the planner and mints the Agentic ID. A reader
 * scanning a card cannot tell which sentence is about which, because the words
 * are the same weight as the words around them.
 *
 * So each one gets its own mark, and the mark goes exactly where the fact is —
 * beside the `.eth` name, beside the token id, beside the deployment list. It is
 * an attribution, not a badge: it says *this row came from there*, and it must
 * never be read as a claim that the thing is live or healthy. Those are already
 * said, in colour, by `LiveDot`, `ArmedLamp` and the source pips, and §6 Rule 2
 * reserves `--live`/`--gain`/`--loss` for exactly that. A logo carries a brand's
 * own colours and none of ours, so it cannot borrow that vocabulary — which is
 * the property that makes it safe to put one next to a status lamp.
 *
 * Two consequences that are worth stating because they are easy to undo later:
 *
 *   - The mark is NEVER rendered against an absence. An app with no subname
 *     reads "unpublished — no ENS subname issued" and gets no ENS mark; an app
 *     with no token gets no 0G mark. §8 makes the name a safety primitive — the
 *     thing a human checks before funding a wallet — and a sponsor logo beside
 *     "not minted" is precisely the decoration that would make an absence look
 *     like a credential. Every call site below guards on the value existing.
 *   - The files are served from `public/sponsors/`, not hotlinked. A demo that
 *     loses its identity marks because a CDN is slow or a hackathon venue's wifi
 *     blocks a host is a worse trade than 138KB in the repo.
 *
 * Round by request and by luck: the ENS and Graph tokens are already discs on
 * transparent ground, and 0G ships a square with generous padding, so
 * `rounded-full` crops nothing on any of them.
 */
import Image from "next/image";
import { cn } from "@/lib/utils";

export type Sponsor = "graph" | "ens" | "zerog";

/**
 * `title` is the hover text and the accessible name both. It names the protocol
 * AND what it did, because "The Graph" alone on a row of numbers tells a screen
 * reader nothing about why the mark is there.
 */
const MARKS: Record<Sponsor, { src: string; title: string }> = {
  graph: {
    src: "/sponsors/the-graph.png",
    title: "The Graph — this data came from a standardized subgraph or a Substreams package",
  },
  ens: {
    src: "/sponsors/ens.png",
    title: "ENS — this name is an ENS subname, and it is what resolves to the app",
  },
  zerog: {
    src: "/sponsors/0g.png",
    title: "0G — inference and the Agentic ID token live on 0G",
  },
};

export function SponsorMark({
  of,
  /**
   * px. 12 sits on a 0.625rem mono line, 14 on 0.6875–0.75rem, 16 on a heading.
   * Passed to `next/image` as the real intrinsic size so nothing is downloaded
   * at 2000px to be drawn at twelve.
   */
  size = 12,
  className,
  title,
}: {
  of: Sponsor;
  size?: number;
  className?: string;
  title?: string;
}): React.JSX.Element {
  const mark = MARKS[of];
  const label = title ?? mark.title;

  return (
    <Image
      src={mark.src}
      alt={label}
      title={label}
      width={size}
      height={size}
      // `shrink-0` on every one of them: these sit inside flex rows that truncate
      // names and CIDs, and a mark that squeezes to 3px wide as a name grows is
      // worse than no mark. `align-middle` keeps it on the baseline of the mono
      // text it annotates rather than riding the line box.
      className={cn("inline-block shrink-0 select-none rounded-full align-middle", className)}
      style={{ width: size, height: size }}
      // Decorative-adjacent but not decorative — see the header. Unoptimized is
      // wrong here (the sources are 480–2000px), so it goes through the
      // optimizer like any other local asset.
      draggable={false}
    />
  );
}

/**
 * The three of them in a row, for chrome that credits the whole stack at once
 * rather than annotating a single fact — the board footer, and nowhere else so
 * far. Deliberately not a "powered by" strip: the line beside it already says
 * which parts run and which do not, and this only puts faces to those words.
 */
export function SponsorRow({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <SponsorMark of="graph" size={size} />
      <SponsorMark of="ens" size={size} />
      <SponsorMark of="zerog" size={size} />
    </span>
  );
}
