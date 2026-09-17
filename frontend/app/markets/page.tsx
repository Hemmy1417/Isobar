"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getConfig, getMarkets, listMarketIds } from "../../lib/read";
import type { ConfigView, MarketView } from "../../lib/types";
import { Empty, ErrorNotice, Loading, ReadProgress } from "../components/bits";
import { MarketCard } from "./MarketCard";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "OPEN", label: "Open for positions" },
  { key: "live", label: "Awaiting verdict" },
  { key: "settled", label: "Settled" },
] as const;

export default function MarketsPage() {
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [markets, setMarkets] = useState<MarketView[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [error, setError] = useState<unknown>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await getConfig();
        if (!alive) return;
        setConfig(cfg);
        const ids = (await listMarketIds(0, 50)).slice().reverse();
        if (!alive) return;
        setProgress({ answered: 0, total: ids.length });
        const all = await getMarkets(ids, {
          onProgress: (ms, answered, total) => {
            if (!alive) return;
            if (ms.length > 0) setMarkets(ms);
            setProgress({ answered, total });
          },
        });
        if (alive) setMarkets(all);
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => { alive = false; };
  }, []);

  const shown = (markets ?? []).filter((m) =>
    filter === "all" ? true
      : filter === "OPEN" ? m.phase === "OPEN"
      : filter === "live" ? ["OBSERVING", "RESOLVING", "RESOLVED"].includes(m.phase)
      : ["FINAL", "VOID"].includes(m.phase));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="spread" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 30 }}>Markets</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            Falsifiable weather questions at strategic logistics locations, settled by consensus.
          </p>
        </div>
        <Link className="btn btn-primary" href="/markets/new">Open a market</Link>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`btn ${filter === f.key ? "btn-ghost" : "btn-quiet"}`}
                  style={{ paddingBlock: 6 }} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <ErrorNotice error={error} />
      {!markets && !error ? <Loading what="the docket" /> : null}
      <ReadProgress answered={progress.answered} total={progress.total} />
      {markets && shown.length === 0 && progress.answered >= progress.total ? (
        <Empty>
          {filter === "all"
            ? "No markets yet on this deployment. Open the first one — the catalog has sixteen strategic locations waiting."
            : "Nothing in this state right now."}
        </Empty>
      ) : null}
      <div className="grid-2">
        {config && shown.map((m) => <MarketCard key={m.market_id} market={m} config={config} />)}
      </div>
    </div>
  );
}
