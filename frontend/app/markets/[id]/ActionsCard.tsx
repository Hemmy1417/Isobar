"use client";

/**
 * The acts a wallet can take on this market — stake, resolve, appeal,
 * finalize, void — each either live with the Transaction Kit flow, or
 * blocked with the contract's reason in words.
 */
import { useMemo, useState } from "react";
import type { SubmitInput } from "@genlayer/transaction-kit-react";

import { actsFor, type Act } from "../../../lib/acts";
import { CONTRACT_ADDRESS, formatGen, parseGen } from "../../../lib/config";
import { marketNumber } from "../../../lib/present";
import { invalidateReads } from "../../../lib/read";
import { useTransactionKit } from "../../../lib/kit";
import { useWallet } from "../../../lib/wallet";
import type { ConfigView, MarketView, PositionView, TicketView } from "../../../lib/types";
import { ActBlocked } from "../../components/bits";
import { TestGen } from "../../components/TestGen";
import { TxPanel } from "../../components/TxPanel";

type Verb = "stake" | "resolve" | "appeal" | "finalize" | "void_timeout";

export function ActionsCard({ market: m, config, position, tickets, nowMs, onChange }: {
  market: MarketView;
  config: ConfigView;
  position: PositionView | null;
  tickets: TicketView[];
  nowMs: number;
  onChange: () => void;
}) {
  const { address, chainOk, wallets, connect, error: walletError } = useWallet();
  const kit = useTransactionKit();
  const [verb, setVerb] = useState<Verb | null>(null);
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("0.05");
  const [grounds, setGrounds] = useState("");

  const acts = actsFor({ market: m, config, account: address, position, tickets, nowMs });
  const byId = Object.fromEntries(acts.map((a) => [a.id, a])) as Record<Verb, Act>;

  const stakeWei = parseGen(amount);
  const tx: SubmitInput | null = useMemo(() => {
    if (!verb) return null;
    const base = { kind: "write" as const, address: CONTRACT_ADDRESS };
    if (verb === "stake") return { ...base, method: "stake", args: [m.market_id, side] };
    if (verb === "appeal") return { ...base, method: "appeal", args: [m.market_id, grounds.trim()] };
    if (verb === "resolve") return { ...base, method: "resolve", args: [m.market_id] };
    if (verb === "finalize") return { ...base, method: "finalize", args: [m.market_id] };
    return { ...base, method: "void_timeout", args: [m.market_id] };
  }, [verb, m.market_id, side, grounds]);

  // The result stays on screen until closed; the next read is fresh either way.
  const done = () => { invalidateReads(); };
  const close = () => { setVerb(null); setGrounds(""); onChange(); };

  if (!address) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Take part</h3>
        <p className="fine" style={{ marginBottom: 10 }}>
          Positions, appeals and settlements are signed by your own wallet — there is no account to create.
        </p>
        <div className="stack" style={{ gap: 8 }}>
          {wallets.map((w) => (
            <button key={w.info.uuid} className="btn btn-ghost" style={{ justifyContent: "flex-start" }}
                    onClick={() => void connect(w).catch(() => {})}>
              Connect {w.info.name}
            </button>
          ))}
          {wallets.length === 0 ? <p className="fine">No wallet extension found — install MetaMask or another EVM wallet.</p> : null}
          {walletError ? <p className="notice notice-bad">{walletError}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 12 }}>Take part</h3>

      {/* stake */}
      {byId.stake.available ? (
        <div className="panel" style={{ marginBottom: 12 }}>
          <p className="small" style={{ fontWeight: 600, marginBottom: 8 }}>Take a position</p>
          <div className="row" style={{ marginBottom: 8 }}>
            <button className={`btn btn-side ${side === "YES" ? "picked-yes" : ""}`} onClick={() => setSide("YES")}>
              Yes — it happens
            </button>
            <button className={`btn btn-side ${side === "NO" ? "picked-no" : ""}`} onClick={() => setSide("NO")}>
              No — it does not
            </button>
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="stake-amount">Stake in GEN</label>
            <input id="stake-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="hint">
              Minimum {formatGen(BigInt(config.min_stake_wei))} GEN. Winners split the losing pool
              pro-rata; a void market refunds every stake. A stake the contract declines is
              credited straight to your claimable balance — never kept.
            </span>
          </div>
          <div style={{ marginBottom: 8 }}><TestGen /></div>
          {verb === "stake" && kit && tx && stakeWei ? (
            <TxPanel kit={kit} tx={tx} value={stakeWei} onDone={done} onClose={close}
                     confirmText={`Stake ${amount} GEN on ${side === "YES" ? "Yes" : "No"}`} />
          ) : (
            <button className="btn btn-primary" disabled={!chainOk || !stakeWei || stakeWei < BigInt(config.min_stake_wei)}
                    onClick={() => setVerb("stake")}>
              Review the stake
            </button>
          )}
          {!chainOk ? <p className="fine" style={{ marginTop: 6 }}>Your wallet is on another network — switch from the header.</p> : null}
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}><ActBlocked label="Take a position" reason={byId.stake.reason} /></div>
      )}

      {/* resolve / finalize / void — the permissionless verbs */}
      {(["resolve", "finalize", "void_timeout"] as const).map((v) => {
        const act = byId[v];
        const blurb = v === "resolve"
          ? "Every validator fetches both agencies and the panel judges the payload quality; code derives the verdict. A round takes a few minutes."
          : v === "finalize"
            ? "Credits every wallet's share to its claimable balance, exactly once."
            : "Frees every stake from a market that could never reach a verdict.";
        return act.available ? (
          <div key={v} className="panel" style={{ marginBottom: 12 }}>
            <p className="small" style={{ fontWeight: 600 }}>{act.label}</p>
            <p className="fine" style={{ marginBottom: 8 }}>{blurb}</p>
            {verb === v && kit && tx ? (
              <TxPanel kit={kit} tx={tx} onDone={done} onClose={close} confirmText={act.label} />
            ) : (
              <button className="btn btn-ghost" disabled={!chainOk} onClick={() => setVerb(v)}>{act.label}</button>
            )}
          </div>
        ) : (
          <div key={v} style={{ marginBottom: 12 }}><ActBlocked label={act.label} reason={act.reason} /></div>
        );
      })}

      {/* appeal */}
      {byId.appeal.available ? (
        <div className="panel">
          <p className="small" style={{ fontWeight: 600 }}>Appeal the verdict</p>
          <p className="fine" style={{ marginBottom: 8 }}>
            The one appeal {marketNumber(m.market_id)} allows. A fresh panel re-reads the
            RECORDED evidence — the same bytes the first round agreed on — and the same code
            re-derives. It can uphold the verdict or void the market; it never invents a new one.
          </p>
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="grounds">Your grounds (on the record)</label>
            <textarea id="grounds" rows={3} maxLength={800} value={grounds}
                      onChange={(e) => setGrounds(e.target.value)}
                      placeholder="Which recorded reading looks wrong, and why" />
          </div>
          {verb === "appeal" && kit && tx ? (
            <TxPanel kit={kit} tx={tx} onDone={done} onClose={close} confirmText="File the appeal" />
          ) : (
            <button className="btn btn-primary" disabled={!chainOk || !grounds.trim()} onClick={() => setVerb("appeal")}>
              Review the appeal
            </button>
          )}
        </div>
      ) : (
        <ActBlocked label="Appeal the verdict" reason={byId.appeal.reason} />
      )}
    </div>
  );
}
