"use client";

/**
 * Opening a market: every choice comes from the contract's own catalog —
 * a location, a metric, a comparison, a threshold, a UTC date. Nobody
 * types a URL; the contract builds the evidence sources in code.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { SubmitInput } from "@genlayer/transaction-kit-react";

import { CONTRACT_ADDRESS } from "../../../lib/config";
import { useTransactionKit } from "../../../lib/kit";
import { formatDocDate, marketQuestion, metricLabel, sourceName } from "../../../lib/present";
import { getConfig, getMarkets, invalidateReads, listMarketIds, pollUntil } from "../../../lib/read";
import { useWallet } from "../../../lib/wallet";
import type { ConfigView } from "../../../lib/types";
import { ErrorNotice, Loading } from "../../components/bits";
import { TxPanel } from "../../components/TxPanel";
import { TestGen } from "../../components/TestGen";
import { WalletChoices } from "../../components/WalletButton";

const THRESHOLD_HINTS: Record<string, string> = {
  WIND_MAX: "Gale force begins around 17 m/s; a stiff breeze is 8–10.",
  PRECIP_SUM: "10 mm is a wet day; 50 mm is a deluge.",
  TEMP_MAX: "Pick the line that matters — heat limits for port work often sit near 35 °C.",
};

export default function NewMarketPage() {
  const router = useRouter();
  const { address, chainOk, wallets, connect, error: walletError } = useWallet();
  const kit = useTransactionKit();
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [location, setLocation] = useState("");
  const [metric, setMetric] = useState("WIND_MAX");
  const [comparison, setComparison] = useState<"GTE" | "LT">("GTE");
  const [threshold, setThreshold] = useState("12");
  const [date, setDate] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    getConfig().then((c) => {
      setConfig(c);
      setLocation(Object.keys(c.locations)[0] ?? "");
    }).catch(setError);
  }, []);

  const tomorrow = useMemo(() => {
    const d = new Date(Date.now() + 86_400_000);
    return d.toISOString().slice(0, 10);
  }, []);
  useEffect(() => { if (!date) setDate(tomorrow); }, [date, tomorrow]);

  if (!config) return error ? <ErrorNotice error={error} /> : <Loading what="the catalog" />;

  const loc = config.locations[location];
  const fast = !!loc?.nws && (metric === "WIND_MAX" || metric === "TEMP_MAX");
  const lag = fast ? config.fast_lane_lag_days : config.global_lane_lag_days;
  const thresholdX100 = Math.round(parseFloat(threshold || "0") * 100);
  const valid = loc && thresholdX100 > 0 && date > new Date().toISOString().slice(0, 10);
  const unit = config.metrics[metric]?.unit ?? "";
  const maxDate = new Date(Date.now() + config.max_open_days_ahead * 86_400_000).toISOString().slice(0, 10);

  const tx: SubmitInput = {
    kind: "write",
    address: CONTRACT_ADDRESS,
    method: "create_market",
    args: [JSON.stringify({ location_id: location, metric, comparison, threshold_x100: thresholdX100, window_date: date })],
  };

  async function afterCreate(successful: boolean) {
    if (!successful) return;
    invalidateReads();
    // The new market is the newest id whose creator is this wallet.
    let found = "";
    await pollUntil(async () => {
      const ids = (await listMarketIds(0, 50, true)).slice(-5).reverse();
      const recent = await getMarkets(ids, { fresh: true });
      const mine = recent.find((m) => m.creator.toLowerCase() === address.toLowerCase()
        && m.window_date === date && m.location_id === location);
      found = mine?.market_id ?? "";
      return !!mine;
    }, { tries: 10 });
    router.push(found ? `/markets/${found}` : "/markets");
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ fontSize: 30 }}>Open a market</h1>
      <p className="muted small" style={{ marginTop: 6, marginBottom: 22 }}>
        A market is one falsifiable question. Every choice below comes from the contract&apos;s
        catalog; the evidence URLs are built in code, so no market can smuggle its own source.
      </p>

      <div className="card stack" style={{ gap: 4 }}>
        <div className="field">
          <label htmlFor="loc">Location</label>
          <select id="loc" value={location} onChange={(e) => setLocation(e.target.value)}>
            {Object.entries(config.locations).map(([id, l]) => (
              <option key={id} value={id}>{l.name}</option>
            ))}
          </select>
          <span className="hint">
            {fast
              ? `Fast lane: a US weather station plus Open-Meteo — resolvable about ${1 + lag} days after the date.`
              : `Global lane: Open-Meteo plus NASA POWER — resolvable about ${1 + lag} days after the date.`}
          </span>
        </div>
        <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 2, minWidth: 200 }}>
            <label htmlFor="metric">Metric</label>
            <select id="metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
              {Object.keys(config.metrics).map((k) => (
                <option key={k} value={k}>{metricLabel(k)}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 120 }}>
            <label htmlFor="cmp">Condition</label>
            <select id="cmp" value={comparison} onChange={(e) => setComparison(e.target.value as "GTE" | "LT")}>
              <option value="GTE">reaches ≥</option>
              <option value="LT">stays under</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 130 }}>
            <label htmlFor="th">Threshold ({unit})</label>
            <input id="th" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
        </div>
        <p className="fine" style={{ marginTop: -6 }}>{THRESHOLD_HINTS[metric]}</p>
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor="date">Observation date (UTC)</label>
          <input id="date" type="date" min={tomorrow} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} />
          <span className="hint">
            Positions close when this date begins, so nobody bets on weather already measured.
          </span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <p className="small" style={{ fontWeight: 600 }}>The question this opens</p>
        <p style={{ marginTop: 6, fontFamily: "var(--font-display)", fontSize: 19 }}>
          {loc ? marketQuestion({ metric, comparison, threshold_x100: thresholdX100 || 0, unit, window_date: date }, loc.name) : "—"}
        </p>
        <p className="fine" style={{ marginTop: 8 }}>
          Judged against {fast ? `${sourceName("nws")} and ${sourceName("open-meteo")}` : `${sourceName("open-meteo")} and ${sourceName("nasa-power")}`} on {formatDocDate(date)}.
          If the two disagree, the market voids and every stake comes home.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        {!address ? (
          <>
            <p className="small" style={{ fontWeight: 600, marginBottom: 10 }}>Connect the opening wallet</p>
            <WalletChoices wallets={wallets} error={walletError} connect={connect} />
          </>
        ) : reviewing && kit ? (
          <TxPanel kit={kit} tx={tx} onDone={afterCreate} confirmText="Open the market" />
        ) : (
          <div className="spread" style={{ flexWrap: "wrap", gap: 10 }}>
            <p className="fine" style={{ maxWidth: 380 }}>
              Opening a market is one transaction and gives you no special powers over it.
            </p>
            <button className="btn btn-primary" disabled={!valid || !chainOk || !kit} onClick={() => setReviewing(true)}>
              Review and open
            </button>
          </div>
        )}
        {address && !chainOk ? <p className="fine" style={{ marginTop: 8 }}>Your wallet is on another network — switch from the header.</p> : null}
        {address ? <div style={{ marginTop: 10 }}><TestGen /></div> : null}
      </div>
    </div>
  );
}
