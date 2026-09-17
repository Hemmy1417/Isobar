"use client";

import { useEffect, useRef, useState } from "react";

import { truncAddr } from "../../lib/chain";
import { formatGen } from "../../lib/config";
import { getBalance } from "../../lib/read";
import { useWallet, type Discovered } from "../../lib/wallet";
import { TestGen } from "./TestGen";

export function WalletButton() {
  const { address, chainOk, connecting, restoring, wallets, error, connect, disconnect, switchNetwork } = useWallet();
  const [open, setOpen] = useState(false);
  const [claimable, setClaimable] = useState<bigint | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open || !address) return;
    getBalance(address).then((b) => setClaimable(BigInt(b.claimable))).catch(() => setClaimable(null));
  }, [open, address]);

  if (address) {
    return (
      <div style={{ position: "relative" }} ref={boxRef}>
        {!chainOk ? (
          <button type="button" className="btn btn-ghost" style={{ marginRight: 8, color: "var(--warn)" }}
                  onClick={() => void switchNetwork()}>
            Wrong network — switch
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost mono" onClick={() => setOpen((v) => !v)}
                aria-expanded={open} title={address}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: chainOk ? "var(--good)" : "var(--warn)" }} />
          {truncAddr(address)}
        </button>
        {open ? (
          <div className="card" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 250, zIndex: 60, display: "flex", flexDirection: "column", gap: 8 }}>
            <p className="fine">
              {claimable === null ? "Reading your claimable balance…" : `${formatGen(claimable)} GEN claimable in the contract`}
            </p>
            <TestGen compact />
            <button className="btn btn-quiet" onClick={() => { void navigator.clipboard?.writeText(address); setOpen(false); }}>
              Copy address
            </button>
            <button className="btn btn-quiet" onClick={() => { disconnect(); setOpen(false); }}>Disconnect</button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={boxRef}>
      <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {restoring ? "Reconnecting…" : connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open ? (
        <div className="card" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 250, zIndex: 60 }}>
          <WalletChoices wallets={wallets} error={error} connect={connect} onDone={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

export function WalletChoices({ wallets, error, connect, onDone }: {
  wallets: Discovered[];
  error: string;
  connect: (w: Discovered) => Promise<void>;
  onDone?: () => void;
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {wallets.length === 0 ? (
        <p className="fine">No wallet extension found in this browser. Install MetaMask or another EVM wallet, then reload.</p>
      ) : null}
      {wallets.map((w) => (
        <button key={w.info.uuid} className="btn btn-ghost" style={{ justifyContent: "flex-start" }}
                onClick={() => { void connect(w).then(() => onDone?.()).catch(() => {}); }}>
          {w.info.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={w.info.icon} alt="" width={18} height={18} />
          ) : null}
          {w.info.name}
        </button>
      ))}
      {error ? <p className="notice notice-bad">{error}</p> : null}
    </div>
  );
}
