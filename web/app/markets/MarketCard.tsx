"use client";

import Link from "next/link";

import { formatGen } from "../../lib/config";
import { formatDocDate, marketNumber, marketQuestion } from "../../lib/present";
import type { ConfigView, MarketView } from "../../lib/types";
import { PhaseChip } from "../components/bits";

export function MarketCard({ market: m, config }: { market: MarketView; config: ConfigView }) {
  const loc = config.locations[m.location_id];
  const pool = BigInt(m.yes_pool_wei) + BigInt(m.no_pool_wei);
  return (
    <Link href={`/markets/${m.market_id}`} className="card" style={{ display: "block", color: "inherit", textDecoration: "none" }}>
      <div className="spread" style={{ alignItems: "flex-start", gap: 10 }}>
        <p className="eyebrow" style={{ color: "var(--faint)" }}>
          {marketNumber(m.market_id)} · {formatDocDate(m.window_date)}
        </p>
        <PhaseChip phase={m.phase} />
      </div>
      <h3 style={{ marginTop: 8, fontSize: 16, lineHeight: 1.35 }}>
        {marketQuestion(m, loc?.name ?? m.location_id)}
      </h3>
      <div className="spread" style={{ marginTop: 12 }}>
        <span className="fine">{loc?.name ?? m.location_id}</span>
        <span className="reading" style={{ fontSize: 13 }}>
          {pool > 0n ? `${formatGen(pool)} GEN staked` : "no positions yet"}
        </span>
      </div>
    </Link>
  );
}
