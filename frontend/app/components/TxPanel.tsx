"use client";

/**
 * The write lifecycle, in this build's own design language, driven by the
 * Transaction Kit's headless flow: estimate → review → sign → track.
 * "Confirmed" appears only when the transaction reports FINALIZED with a
 * successful execution — an accepted write is shown as exactly that,
 * because this network can still walk it back.
 */
import {
  useTransactionFlow,
  describeError,
  describeOutcome,
  formatGen as kitFormatGen,
  type SubmitInput,
  type TransactionKit,
} from "@genlayer/transaction-kit-react";
import { useEffect, useRef, useState } from "react";

import { txUrl } from "../../lib/chain";

const PHASES = ["submitted", "pending", "processing", "decided", "finalized"] as const;
const PHASE_TEXT: Record<string, string> = {
  submitted: "Signed and submitted",
  pending: "Waiting in the queue",
  processing: "Validators are executing it",
  decided: "Decided, awaiting finality",
  finalized: "Finalized",
};

/**
 * One panel is one review of one transaction: the transaction, its value
 * and its label are frozen when the panel opens. Edits to the form behind
 * it, or a parent re-render building a new object, can neither re-price
 * the quote mid-review nor change what gets signed.
 */
export function TxPanel({ kit, tx: txProp, value: valueProp, onDone, onClose, confirmText: confirmProp }: {
  kit: TransactionKit;
  tx: SubmitInput;
  value?: bigint;
  onDone?: (successful: boolean) => void;
  /** Shown as a Close button once the transaction is done, so the outcome
   *  stays on screen until the person has read it. */
  onClose?: () => void;
  confirmText?: string;
}) {
  const [tx] = useState(txProp);
  const [value] = useState(valueProp);
  const [confirmText] = useState(confirmProp);
  const flow = useTransactionFlow({ kit, tx, userValue: value, trackUntil: "finalized" });
  const { state } = flow;
  const doneFired = useRef(false);

  useEffect(() => {
    if (state.step === "done" && !doneFired.current) {
      doneFired.current = true;
      onDone?.(state.status.phase === "finalized" && state.status.successful !== false);
    }
  }, [state, onDone]);

  if (state.step === "estimating") {
    return <div className="panel"><p className="fine">Pricing the transaction against live network fees…</p></div>;
  }

  if (state.step === "blocked") {
    return (
      <div className="notice notice-warn">
        The fee quote no longer matches the network&apos;s live fee policy, so nothing was signed.
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={() => flow.reset()}>Re-price and try again</button>
        </div>
      </div>
    );
  }

  if (state.step === "error") {
    const err = describeError(state.message);
    return (
      <div className="notice notice-bad">
        <b>{err.title}</b>
        <p className="fine" style={{ color: "inherit", marginTop: 4 }}>{err.detail}</p>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={() => flow.reset()}>Start over</button>
        </div>
      </div>
    );
  }

  if (state.step === "review" || state.step === "signing") {
    const q = state.quote;
    const signing = state.step === "signing";
    return (
      <div className="panel">
        <div className="spread">
          <p className="small" style={{ fontWeight: 600 }}>Review before signing</p>
          {q.verification.status === "verified" ? (
            <span className="chip final plain">fee policy verified</span>
          ) : null}
        </div>
        <div className="stack" style={{ gap: 4, marginTop: 8 }}>
          {value && value > 0n ? (
            <div className="spread small"><span className="muted">Your stake</span>
              <span className="reading">{kitFormatGen(value)} GEN</span></div>
          ) : null}
          <div className="spread small"><span className="muted">Refundable fee deposit</span>
            <span className="reading">{q.gasless ? "None (gasless network)" : `${kitFormatGen(q.feeValue)} GEN`}</span></div>
          <div className="spread small"><span className="muted">Total leaving the wallet</span>
            <span className="reading">{kitFormatGen(q.total)} GEN</span></div>
          {q.queue?.pendingAhead ? (
            <p className="fine">{q.queue.pendingAhead} transaction{q.queue.pendingAhead === 1 ? "" : "s"} ahead of this wallet in the queue.</p>
          ) : null}
          <p className="fine">
            {q.source === "developer"
              ? "Allocations come from this app's measured fee profile; prices are live."
              : "Allocations come from network defaults; prices are live."} Unused fees are refunded.
          </p>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" disabled={signing} onClick={() => void flow.approve()}>
            {signing ? "Waiting for your wallet…" : (confirmText ?? "Sign and send")}
          </button>
          <button className="btn btn-quiet" disabled={signing} onClick={() => flow.reset()}>Cancel</button>
        </div>
      </div>
    );
  }

  // tracking | done
  const status = state.step === "tracking" || state.step === "done" ? state.status : null;
  const phaseIdx = status ? PHASES.indexOf(status.phase as (typeof PHASES)[number]) : -1;
  const done = state.step === "done";
  const outcome = done && status
    ? describeOutcome(status.statusName, status.executionResultName)
    : null;
  // "Confirmed" is earned only by a FINALIZED transaction that executed
  // successfully: an accepted-but-unfinalized write can still be appealed
  // away, so it is never presented as settled.
  const finalized = status?.phase === "finalized";
  const succeeded = done && finalized && status?.successful !== false;
  const awaitingFinality = done && !finalized && status?.successful !== false;

  return (
    <div className="panel">
      <div className="rail" style={{ marginBottom: done ? 10 : 0 }}>
        {PHASES.map((p, i) => (
          <div key={p} className={`rail-step ${i < phaseIdx || done ? "done" : i === phaseIdx ? "now" : ""}`}>
            <div className="rail-dot"><i /><b /></div>
            <div className="rail-body" style={{ paddingBottom: 8 }}>
              <h4>{PHASE_TEXT[p]}</h4>
              {p === "pending" && status?.queuePosition !== undefined && i === phaseIdx ? (
                <p className="fine">position {status.queuePosition} in the queue</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {done && status && onClose ? (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      ) : null}
      {done && status ? (
        succeeded ? (
          <div className="notice notice-ok">
            Confirmed: finalized on chain with a successful execution.
            {status.genlayerTxId ? (
              <>
                {" "}
                <a href={txUrl(status.genlayerTxId)} target="_blank" rel="noreferrer">View the transaction</a>
              </>
            ) : null}
          </div>
        ) : awaitingFinality ? (
          <div className="notice notice-warn">
            <b>Decided, not yet final</b>
            <p className="fine" style={{ color: "inherit", marginTop: 4 }}>
              Validators accepted the transaction, but it can still be appealed until it finalizes.
            </p>
          </div>
        ) : (
          <div className="notice notice-warn">
            <b>{outcome?.title ?? "The round did not succeed"}</b>
            <p className="fine" style={{ color: "inherit", marginTop: 4 }}>{outcome?.detail}</p>
            {status.genlayerTxId ? (
              <p className="fine" style={{ marginTop: 4 }}>
                <a href={txUrl(status.genlayerTxId)} target="_blank" rel="noreferrer">The transaction record</a> carries the contract&apos;s own sentence.
              </p>
            ) : null}
          </div>
        )
      ) : (
        <div className="row" style={{ marginTop: 4 }}>
          {flow.canCancel ? (
            <button className="btn btn-quiet" onClick={() => void flow.cancel()}>Cancel while still queued</button>
          ) : null}
        </div>
      )}
    </div>
  );
}
