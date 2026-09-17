/**
 * Disposable end-to-end on Studio Next: a patched variant (past window
 * dates allowed, stake gate opened — BOTH patches printed) so resolution
 * runs TODAY against the real recorded weather of 2026-09-11:
 *   Open-Meteo daily max wind (Colón) = 5.22 m/s, NASA POWER = 3.84 m/s.
 *
 *   A  GTE 3.00  → both sources met      → YES, appeal upholds, claims pay
 *   B  GTE 5.00  → sources split         → VOID_CONFLICT, refunds
 *   C  window 2026-09-15 (POWER -999)    → RETRY: no corroboration, no settlement
 *   D  GTE 8.00  → neither source met    → NO   (the negative control)
 *   T  parlay A:YES + D:NO               → WON at 3.24×, reserve conserved
 *
 * Usage: node scripts/probe/live-disposable.mjs <patched-contract-address>
 */
import { createAccount, createClient } from "genlayer-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chain, rpc, sleep, FEE_FLOOR, waitFinal, leaderOf } from "../lib.mjs";

const ADDR = process.argv[2];
if (!ADDR) { console.error("usage: live-disposable.mjs 0x…"); process.exit(1); }
const KEYS_PATH = fileURLToPath(new URL("../../../.data/keys.json", import.meta.url));
const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
const OP = createAccount(keys.OPERATOR.pk);
const BUYER = createAccount(keys.BUYER?.pk ?? (() => { throw new Error("run fund-buyer first"); })());
const opClient = createClient({ chain, account: OP });
const buyerClient = createClient({ chain, account: BUYER });
const GEN = 10n ** 18n;

let step = 0;
const say = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const assert = (cond, what) => {
  if (!cond) { console.error(`ASSERT FAILED: ${what}`); process.exit(1); }
  say(`  ok: ${what}`);
};

function refusalText(t) {
  const res = leaderOf(t)?.result;
  if (typeof res !== "string") return "";
  const buf = Buffer.from(res, "base64");
  return buf.toString("utf-8").replace(/[^\x20-\x7e]/g, " ").trim();
}

async function write(client, functionName, args, { value = 0n, expectError = null } = {}) {
  step += 1;
  const who = client === opClient ? "op" : "buyer";
  say(`#${step} ${who} ${functionName}(${JSON.stringify(args).slice(0, 90)}) value=${value}`);
  const est = await client.estimateTransactionFees();
  const feeValue = est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR;
  const hash = await client.writeContract({
    address: ADDR, functionName, args, value,
    fees: { distribution: est.distribution, feeValue },
  });
  const t = await waitFinal(hash, { label: functionName, tries: 120 });
  const leader = leaderOf(t);
  say(`  ${hash} FINALIZED ${t.result_name} leader=${leader?.execution_result}`);
  if (expectError) {
    assert(leader?.execution_result === "ERROR", `${functionName} refused on chain`);
    const text = refusalText(t);
    assert(text.includes(expectError), `refusal names "${expectError}" (got: ${text.slice(0, 140)})`);
    return { t, refused: true };
  }
  if (leader?.execution_result !== "SUCCESS") {
    console.error("UNEXPECTED ERROR:", refusalText(t).slice(0, 400));
    console.error(String(leader?.genvm_result?.stderr ?? "").slice(-800));
    process.exit(1);
  }
  return { t };
}

const read = async (fn, args = []) =>
  JSON.parse(await opClient.readContract({ address: ADDR, functionName: fn, args }));

const params = (threshold, date = "2026-09-11") => JSON.stringify({
  location_id: "panama-colon", metric: "WIND_MAX", comparison: "GTE",
  threshold_x100: threshold, window_date: date,
});

say(`disposable E2E against ${ADDR}; operator ${OP.address}; buyer ${BUYER.address}`);

// ── seed the parlay reserve ─────────────────────────────────────────────────
await write(opClient, "seed_reserve", [], { value: 2n * GEN });

// ── create the four markets ─────────────────────────────────────────────────
await write(opClient, "create_market", [params(300)]);   // mk-000001 A → YES
await write(opClient, "create_market", [params(500)]);   // mk-000002 B → conflict
await write(opClient, "create_market", [params(300, "2026-09-15")]); // mk-000003 C → retry
await write(opClient, "create_market", [params(800)]);   // mk-000004 D → NO
const ids = await read("list_markets", [0, 10]);
assert(JSON.stringify(ids) === JSON.stringify(["mk-000001", "mk-000002", "mk-000003", "mk-000004"]), "four markets on the list");

// ── stakes: operator YES on A, buyer NO on A; both sides of B ──────────────
await write(opClient, "stake", ["mk-000001", "YES"], { value: GEN / 20n });
await write(buyerClient, "stake", ["mk-000001", "NO"], { value: GEN / 25n });
await write(opClient, "stake", ["mk-000002", "YES"], { value: GEN / 50n });
await write(buyerClient, "stake", ["mk-000002", "NO"], { value: GEN / 50n });
await write(buyerClient, "stake", ["mk-000003", "YES"], { value: GEN / 50n });

// ── the parlay before any verdict: A YES + D NO ────────────────────────────
const legs = JSON.stringify([{ market_id: "mk-000001", side: "YES" },
                             { market_id: "mk-000004", side: "NO" }]);
await write(buyerClient, "buy_ticket", [legs], { value: GEN / 10n });
const t0 = await read("get_ticket", ["tk-000001"]);
assert(t0.multiplier_x100 === 324 && t0.pricing === "DEMO_FLAT", "ticket priced 3.24x, labeled demo");
const stats0 = await read("get_stats");
assert(BigInt(stats0.reserved_exposure_wei) === (GEN / 10n) * 324n / 100n, "full exposure reserved at purchase");

// ── resolutions against the real recorded weather ──────────────────────────
const rA = await write(opClient, "resolve", ["mk-000001"]);
const outA = await read("get_market", ["mk-000001"]);
assert(outA.verdict === "YES" && outA.state === "RESOLVED", "A resolved YES (5.22 and 3.84 ≥ 3.00)");
const recA = await read("get_round", ["mk-000001", 1]);
const vals = Object.fromEntries(recA.snapshot.map((r) => [r.source, r.value_x100]));
assert(vals["open-meteo"] === 522 && vals["nasa-power"] === 384, `agreed readings recorded (${JSON.stringify(vals)})`);

const rB = await write(opClient, "resolve", ["mk-000002"]);
const outB = await read("get_market", ["mk-000002"]);
assert(outB.verdict === "VOID_CONFLICT", "B void: 5.22 ≥ 5.00 but 3.84 < 5.00 — sources split, nobody settles");

const rC = await write(buyerClient, "resolve", ["mk-000003"]);
const outC = await read("get_market", ["mk-000003"]);
assert(outC.state === "OPEN" && outC.rounds_count === 1, "C retried: POWER -999 for the 15th → no corroboration, no settlement");
const recC = await read("get_round", ["mk-000003", 1]);
assert(recC.outcome.kind === "RETRY", "C round recorded as RETRY");

const rD = await write(opClient, "resolve", ["mk-000004"]);
const outD = await read("get_market", ["mk-000004"]);
assert(outD.verdict === "NO", "D resolved NO — the negative control fired");

// ── walls, sent for real: stranger appeal, second resolve, early finalize ──
await write(opClient, "resolve", ["mk-000001"], { expectError: "re-judgment is an appeal" });
await write(opClient, "finalize", ["mk-000001"], { expectError: "appeal window is open" });

// ── the appeal: losing buyer appeals A; the record upholds ─────────────────
await write(buyerClient, "appeal", ["mk-000001", "The POWER reading looks low; please re-check the record."]);
const outA2 = await read("get_market", ["mk-000001"]);
assert(outA2.verdict === "YES" && outA2.appeal.prior_verdict === "YES", "appeal re-read the record and upheld YES");
const recA2 = await read("get_round", ["mk-000001", 2]);
assert(recA2.kind === "APPEAL" && recA2.reviewed_round === 1 && recA2.snapshot_reviewed === true, "appeal round names the reviewed record");
await write(buyerClient, "appeal", ["mk-000001", "again"], { expectError: "one appeal is already on the record" });

// ── finalize + settle + claim: real GEN moves ──────────────────────────────
await write(opClient, "finalize", ["mk-000001"]);
await write(opClient, "finalize", ["mk-000002"]);
await write(opClient, "finalize", ["mk-000004"]);
const balOp = await read("get_balance", [OP.address]);
const balBuyer = await read("get_balance", [BUYER.address]);
// A: op staked 0.05 YES vs buyer 0.04 NO → op gets 0.09; B refunds 0.02 each
assert(BigInt(balOp.claimable) === GEN * 9n / 100n + GEN / 50n, `op claimable = winnings + B refund (${balOp.claimable})`);
assert(BigInt(balBuyer.claimable) === GEN / 50n, "buyer claimable = B refund only");

await write(buyerClient, "settle_ticket", ["tk-000001"]);
const t1 = await read("get_ticket", ["tk-000001"]);
assert(t1.state === "WON", "parlay won: A hit YES, D hit NO");
const balBuyer2 = await read("get_balance", [BUYER.address]);
assert(BigInt(balBuyer2.claimable) === GEN / 50n + (GEN / 10n) * 324n / 100n, "ticket payout credited");
const stats1 = await read("get_stats");
assert(stats1.reserved_exposure_wei === "0", "exposure released after settlement");

const balBefore = BigInt((await rpc("eth_getBalance", [BUYER.address, "latest"])).result ?? "0x0");
await write(buyerClient, "claim", []);
await sleep(6000);
const balAfter = BigInt((await rpc("eth_getBalance", [BUYER.address, "latest"])).result ?? "0x0");
say(`buyer chain balance ${balBefore} → ${balAfter}`);
assert(balAfter > balBefore, "claim moved real value to the buyer's wallet");
await write(buyerClient, "claim", [], { expectError: "nothing claimable" });

say("DISPOSABLE E2E COMPLETE — every assertion held");
