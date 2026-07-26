/**
 * PHASE 0 CONTRACT — the composer/renderer seam.
 *
 * This is the likeliest place a parallel build silently diverges: the composer
 * emits component names, the renderer implements them. If they disagree,
 * nothing renders and nobody notices until integration.
 *
 * A2UI's security property lives here — the client holds the approved catalog
 * and the agent may only reference it by name. The agent cannot inject code.
 *
 * RULE: no component ships without a selection rule that reaches it.
 * See prd.md Appendix A.
 */

export const DISPLAY_COMPONENTS = [
  "metric_card",
  "bar_chart",
  "grouped_bar",
  "time_series",
  "area_stack",
  "candlestick",
  "leaderboard",
  "gauge",
  "progress_bar",
  "comparison_grid",
  "heatmap",
  "distribution",
  "flow_diagram",
  "position_card",
  "data_table",
  "alert_banner",
] as const;

export const ACTION_COMPONENTS = [
  "action_button",
  "confirm_dialog",
  "amount_input",
  "allowlist_picker",
  "kill_switch",
  "trade_log",
  "policy_badge",
] as const;

export type DisplayComponent = (typeof DISPLAY_COMPONENTS)[number];
export type ActionComponent = (typeof ACTION_COMPONENTS)[number];
export type ComponentName = DisplayComponent | ActionComponent;

export const ALL_COMPONENTS: readonly ComponentName[] = [
  ...DISPLAY_COMPONENTS,
  ...ACTION_COMPONENTS,
];

/**
 * The shape of data that selects a component. The composer picks from the
 * SHAPE of the returned data, never from keywords in the prompt — a bounded
 * ratio becomes a gauge whether or not the user said "gauge".
 */
export type DataShape =
  | "scalar"
  | "scalar_with_delta"
  | "bounded_ratio"
  | "scalar_vs_target"
  | "categorical_one_metric"
  | "categorical_many_metrics"
  | "categorical_ranked"
  | "timeseries_one_metric"
  | "timeseries_many_metrics"
  | "timeseries_composition"
  | "ohlcv"
  | "entities_shared_metrics"
  | "two_categoricals_one_metric"
  | "many_observations"
  | "source_target_volume"
  | "held_position"
  | "triggered_condition"
  | "rows_arbitrary_columns";

/** Every component must appear here. This map IS the selection rule. */
export const SHAPE_TO_COMPONENT: Record<DataShape, DisplayComponent> = {
  scalar: "metric_card",
  scalar_with_delta: "metric_card",
  bounded_ratio: "gauge",
  scalar_vs_target: "progress_bar",
  categorical_one_metric: "bar_chart",
  categorical_many_metrics: "grouped_bar",
  categorical_ranked: "leaderboard",
  timeseries_one_metric: "time_series",
  timeseries_many_metrics: "time_series",
  timeseries_composition: "area_stack",
  ohlcv: "candlestick",
  entities_shared_metrics: "comparison_grid",
  two_categoricals_one_metric: "heatmap",
  many_observations: "distribution",
  source_target_volume: "flow_diagram",
  held_position: "position_card",
  triggered_condition: "alert_banner",
  rows_arbitrary_columns: "data_table",
};

/**
 * Components an autonomous mini app MUST render. An agent that spends money
 * shows its work — neither is optional. Enforced by the renderer, not left
 * to the composer's discretion.
 */
export const REQUIRED_FOR_AUTONOMOUS: readonly ComponentName[] = [
  "policy_badge",
  "trade_log",
  "kill_switch",
];

/** Props every catalog component receives. Keep this stable. */
export interface CatalogComponentProps {
  id: string;
  /** Resolved from the A2UI data model by the renderer. */
  data: unknown;
  label?: string;
  /** Dispatches an A2UI server event back to the agent. */
  onAction?: (event: { name: string; context: Record<string, unknown> }) => void;
}
