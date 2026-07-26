/**
 * `UiDoc` — the flat list of display blocks the offline draft speaks.
 *
 * Lifted out of `src/lib/seed.ts` when the kit became a publishable package.
 * The direction of the dependency was the whole reason: `seed-to-a2ui.ts`
 * translates a `UiDoc` into an A2UI document, so the translator owned the
 * behaviour while the app owned the type, and a package that has to import its
 * consumer's seed file to compile is not a package. Now the kit defines the
 * shape and `seed.ts` imports it back, which is the relationship those two
 * always had in fact.
 *
 * It names the same catalog components as `contracts/catalog.ts`. Nothing here
 * is A2UI — `spec: "a2ui/0.9.1"` is the version of the document it converts TO,
 * not a claim that this shape is one.
 */

export type Accent = "live" | "gain" | "loss" | "risk" | "spend" | "ink";

export type UiBlock =
  | {
      id: string;
      component: "metric_card";
      label: string;
      span?: number;
      data: { value: string; delta?: string; dir?: "up" | "down" | "flat"; sub?: string };
    }
  | {
      id: string;
      component: "leaderboard";
      label: string;
      span?: number;
      data: { unit: string; accentIndex?: number; rows: { label: string; value: number; note?: string }[] };
    }
  | {
      id: string;
      component: "bar_chart";
      label: string;
      span?: number;
      data: { unit: string; accentIndex?: number; rows: { label: string; value: number }[] };
    }
  | {
      id: string;
      component: "time_series";
      label: string;
      span?: number;
      data: { unit: string; accent?: Accent; points: number[]; xFirst: string; xLast: string };
    }
  | {
      id: string;
      component: "gauge";
      label: string;
      span?: number;
      data: { value: number; min: number; max: number; threshold: number; unit: string; status: Accent };
    }
  | {
      id: string;
      component: "progress_bar";
      label: string;
      span?: number;
      data: { value: number; target: number; unit: string; note?: string };
    }
  | {
      id: string;
      component: "comparison_grid";
      label: string;
      span?: number;
      data: { columns: string[]; rows: { label: string; cells: string[] }[] };
    }
  | {
      id: string;
      component: "data_table";
      label: string;
      span?: number;
      data: { columns: string[]; numeric: boolean[]; rows: string[][] };
    }
  | {
      id: string;
      component: "position_card";
      label: string;
      span?: number;
      data: { asset: string; rows: { k: string; v: string; accent?: Accent }[] };
    }
  | {
      id: string;
      component: "alert_banner";
      label: string;
      span?: number;
      data: { level: Accent; text: string };
    }
  | {
      id: string;
      component: "flow_diagram";
      label: string;
      span?: number;
      data: { unit: string; flows: { from: string; to: string; value: number }[] };
    }
  | {
      id: string;
      component: "distribution";
      label: string;
      span?: number;
      data: { unit: string; buckets: { label: string; count: number }[] };
    };

export interface UiDoc {
  spec: "a2ui/0.9.1";
  blocks: UiBlock[];
}

