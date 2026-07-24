/**
 * THE CATALOG REGISTRY — name → component.
 *
 * This map is the client-held approved catalog and therefore the security
 * boundary of the whole product. The agent emits component NAMES; it never
 * emits code, markup, or a module path. Anything not in this map cannot be
 * rendered, and the renderer's fallback makes an unknown name visible rather
 * than silently dropping it. There is no `eval`, no `dangerouslySetInnerHTML`,
 * and no dynamic import keyed on agent output anywhere in this directory.
 *
 * The `Record<ComponentName, …>` annotation is load-bearing: if a name is added
 * to `ALL_COMPONENTS` in contracts/catalog.ts and not implemented here,
 * `tsc --noEmit` fails. That is the whole point — the composer/renderer seam is
 * the likeliest place a parallel build silently diverges (see catalog.ts).
 */

import type { ComponentType } from "react";
import type { CatalogComponentProps, ComponentName } from "@/lib/contracts/catalog";
import { ALL_COMPONENTS } from "@/lib/contracts/catalog";

// display
import { MetricCard } from "./metric-card";
import { BarChart } from "./bar-chart";
import { GroupedBar } from "./grouped-bar";
import { TimeSeries } from "./time-series";
import { AreaStack } from "./area-stack";
import { Candlestick } from "./candlestick";
import { Leaderboard } from "./leaderboard";
import { Gauge } from "./gauge";
import { ProgressBar } from "./progress-bar";
import { ComparisonGrid } from "./comparison-grid";
import { Heatmap } from "./heatmap";
import { Distribution } from "./distribution";
import { FlowDiagram } from "./flow-diagram";
import { PositionCard } from "./position-card";
import { DataTable } from "./data-table";
import { AlertBanner } from "./alert-banner";

// action
import { ActionButton } from "./action-button";
import { ConfirmDialog } from "./confirm-dialog";
import { AmountInput } from "./amount-input";
import { AllowlistPicker } from "./allowlist-picker";
import { KillSwitch } from "./kill-switch";
import { TradeLog } from "./trade-log";
import { PolicyBadge } from "./policy-badge";

/**
 * Components may accept one optional renderer-supplied extra (`index`, the
 * `.snap-in` stagger). They must remain assignable to the frozen contract.
 */
export type CatalogComponent = ComponentType<CatalogComponentProps & { index?: number }>;

export const CATALOG: Record<ComponentName, CatalogComponent> = {
  metric_card: MetricCard,
  bar_chart: BarChart,
  grouped_bar: GroupedBar,
  time_series: TimeSeries,
  area_stack: AreaStack,
  candlestick: Candlestick,
  leaderboard: Leaderboard,
  gauge: Gauge,
  progress_bar: ProgressBar,
  comparison_grid: ComparisonGrid,
  heatmap: Heatmap,
  distribution: Distribution,
  flow_diagram: FlowDiagram,
  position_card: PositionCard,
  data_table: DataTable,
  alert_banner: AlertBanner,

  action_button: ActionButton,
  confirm_dialog: ConfirmDialog,
  amount_input: AmountInput,
  allowlist_picker: AllowlistPicker,
  kill_switch: KillSwitch,
  trade_log: TradeLog,
  policy_badge: PolicyBadge,
};

/** Narrowing guard — the only sanctioned way to go from string to component. */
export function isCatalogComponent(name: string): name is ComponentName {
  return Object.prototype.hasOwnProperty.call(CATALOG, name);
}

export function lookupCatalog(name: string): CatalogComponent | null {
  return isCatalogComponent(name) ? CATALOG[name] : null;
}

/**
 * Runtime completeness check. The type system already guarantees this, but the
 * catalog is also the thing we hand to the composer as a prompt fragment, so a
 * cheap assertion here catches a hand-edited registry during the demo.
 */
export function missingComponents(): ComponentName[] {
  return ALL_COMPONENTS.filter((n) => typeof CATALOG[n] !== "function");
}

export {
  MetricCard,
  BarChart,
  GroupedBar,
  TimeSeries,
  AreaStack,
  Candlestick,
  Leaderboard,
  Gauge,
  ProgressBar,
  ComparisonGrid,
  Heatmap,
  Distribution,
  FlowDiagram,
  PositionCard,
  DataTable,
  AlertBanner,
  ActionButton,
  ConfirmDialog,
  AmountInput,
  AllowlistPicker,
  KillSwitch,
  TradeLog,
  PolicyBadge,
};
