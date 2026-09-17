"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getConfig, getMarkets, listMarketIds } from "../../lib/read";
import type { ConfigView, MarketView } from "../../lib/types";
import { ErrorNotice, Loading, ReadProgress } from "../components/bits";
import { MarketCard } from "../markets/MarketCard";
import { PHASE_COLOR, PHASE_LEGEND, stationsFrom, WorldMap } from "./WorldMap";

export default function MapPage() {
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await getConfig();
        if (!alive) return;
        setConfig(cfg);
        const ids = await listMarketIds(0, 50);
        if (!alive) return;
        setProgress({ answered: 0, total: ids.length });
        const all = await getMarkets(ids, {
          onProgress: (ms, answered, total) => {
            if (!alive) return;
            setMarkets(ms);
            setProgress({ answered, total });
          },
        });
        if (alive) setMarkets(all);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const stations = useMemo(() => (config ? stationsFrom(config, markets) : []), [config, markets]);
  const here = useMemo(() => markets.filter((m) => m.location_id === selected), [markets, selected]);
  const selectedName = selected && config ? config.locations[selected]?.name : null;

  if (!config) return error ? <ErrorNotice error={error} /> : <Loading what="the map" />;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="spread" style={{ flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 30 }}>The map</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            Sixteen strategic stations: canals, straits, ports. Click one to see its markets.
          </p>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          {PHASE_LEGEND.map((l) => (
            <span key={l.phase} className="fine row" style={{ gap: 5 }}>
              <i style={{ width: 8, height: 8, borderRadius: "50%", background: PHASE_COLOR[l.phase] }} />
              {l.text}
            </span>
          ))}
        </div>
      </div>

      <ErrorNotice error={error} />
      <ReadProgress answered={progress.answered} total={progress.total} />
      <div className="map-stage">
        <WorldMap stations={stations} selected={selected} onSelect={setSelected} />
      </div>

      {selected ? (
        <div className="stack" style={{ gap: 12 }}>
          <div className="spread">
            <h2 style={{ fontSize: 20 }}>{selectedName}</h2>
            <Link className="btn btn-ghost" href="/markets/new">Open a market here</Link>
          </div>
          {here.length === 0 ? (
            <p className="muted small">No markets at this station yet{loaded ? "" : " (still reading)"}. It is waiting for its first question.</p>
          ) : (
            <div className="grid-2">
              {here.map((m) => <MarketCard key={m.market_id} market={m} config={config} />)}
            </div>
          )}
        </div>
      ) : (
        <p className="fine">
          Dots pulse where a verdict is near. A station with no color has no market yet;
          the catalog covers it the moment someone opens one.
        </p>
      )}
    </div>
  );
}
