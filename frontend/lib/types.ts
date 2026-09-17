/** The shapes the contract's views return, parsed. */

export interface SourceRef {
  source: string;
  url: string;
}

export interface MarketView {
  market_id: string;
  ruleset: string;
  creator: string;
  created_at: string;
  location_id: string;
  metric: string;
  comparison: "GTE" | "LT";
  threshold_x100: number;
  unit: string;
  window_date: string;
  lane: "FAST" | "GLOBAL";
  state: "OPEN" | "RESOLVED" | "FINAL" | "VOID";
  /** Derived by the contract from the tx clock at read time. */
  phase: "OPEN" | "OBSERVING" | "RESOLVING" | "RESOLVED" | "FINAL" | "VOID";
  sources: SourceRef[];
  yes_pool_wei: string;
  no_pool_wei: string;
  rounds_count: number;
  verdict: "YES" | "NO" | "VOID_CONFLICT" | null;
  resolved_at: string | null;
  appeal: { appellant: string; at: string; prior_verdict: string | null; final_verdict: string } | null;
  finalized_at: string | null;
  void_reason: string | null;
}

export interface SnapshotRow {
  source: string;
  url: string;
  fetched: boolean;
  covered: boolean;
  value_x100: number | null;
  excerpt: string;
  digest: string;
}

export interface PanelSource {
  covered: boolean;
  anomaly: string;
  quote: string;
}

export interface RoundView {
  round: number;
  kind: "RESOLUTION" | "APPEAL";
  market_id: string;
  requested_by?: string;
  appellant?: string;
  grounds?: string;
  at: string;
  reviewed_round?: number;
  snapshot_reviewed?: boolean;
  snapshot?: SnapshotRow[];
  panel: { sources: Record<string, PanelSource>; sufficient: boolean };
  outcome: { kind: "VERDICT" | "RETRY"; verdict: string | null; reason: string | null;
             readings: Record<string, { covered: boolean; value_x100: number | null }> };
  ruleset: string;
}

export interface TicketLeg {
  market_id: string;
  side: "YES" | "NO";
  outcome: string | null;
}

export interface TicketView {
  ticket_id: string;
  wallet: string;
  stake_wei: string;
  multiplier_x100: number;
  payout_wei: string;
  pricing: string;
  legs: TicketLeg[];
  state: "LIVE" | "WON" | "LOST" | "REFUNDED";
  bought_at: string;
  settled_at: string | null;
  settled_multiplier_x100?: number | null;
}

export interface LocationInfo {
  name: string;
  lat: number;
  lon: number;
  nws: string | null;
}

export interface ConfigView {
  ruleset: string;
  owner: string;
  min_stake_wei: string;
  max_stake_per_wallet_wei: string;
  max_stakers_per_market: number;
  max_markets: number;
  max_rounds_per_market: number;
  appeal_window_seconds: number;
  void_timeout_seconds: number;
  max_open_days_ahead: number;
  min_legs: number;
  max_legs: number;
  leg_multiplier_x100: number;
  multiplier_cap_x100: number;
  min_ticket_stake_wei: string;
  max_ticket_stake_wei: string;
  max_tickets_per_market: number;
  max_tickets_per_wallet: number;
  fast_lane_lag_days: number;
  global_lane_lag_days: number;
  locations: Record<string, LocationInfo>;
  metrics: Record<string, { unit: string }>;
  comparisons: string[];
  reserve_wei: string;
  reserved_exposure_wei: string;
}

export interface BalanceView {
  claimable: number | string;
  claimed: number | string;
}

export interface StatsView {
  markets: number;
  tickets: number;
  reserve_wei: string;
  reserved_exposure_wei: string;
}

export interface PositionView {
  yes: number | string;
  no: number | string;
}
