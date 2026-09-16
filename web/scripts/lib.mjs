/** Shared chain config and transport for every Isobar script. */
import { studioDevnet } from "genlayer-js/chains";

export const RPC = process.env.GENLAYER_RPC_URL ?? "https://studio-next.genlayer.com/api";
export const chain = { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: [RPC] } } };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const FEE_FLOOR = 10n ** 15n;

export async function rpc(method, params) {
  let lastErr;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 isobar-scripts" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      return JSON.parse(await res.text());
    } catch (e) {
      lastErr = e;
      await sleep(3000 * (i + 1));
    }
  }
  throw lastErr;
}

/** Wait for finality; returns the tx object. Throws on CANCELED/UNDETERMINED. */
export async function waitFinal(hash, { tries = 90, label = "tx" } = {}) {
  for (let i = 0; i < tries; i++) {
    await sleep(4000);
    const t = (await rpc("eth_getTransactionByHash", [hash])).result;
    const status = t?.status ?? t?.statusName;
    if (status === "FINALIZED") return t;
    if (status === "CANCELED" || status === "UNDETERMINED")
      throw new Error(`${label} ${status}`);
    if (i % 5 === 4) console.log(`  … ${label} ${status ?? "pending"}`);
  }
  throw new Error(`${label}: no finality after ${(tries * 4) / 60} minutes`);
}

export function leaderOf(t) {
  const arr = t?.consensus_data?.leader_receipt ?? [];
  return arr.find((x) => x?.mode !== "validator") ?? arr[0];
}
