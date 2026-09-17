/**
 * Seed the deployment of record: the parlay reserve, a spread of future
 * markets across the catalog (with a certain-YES and a certain-NO control
 * among genuinely uncertain ones), starter stakes so the shopfront shows
 * a living book, and one demo ticket.
 *
 * Usage: node scripts/seed-record.mjs 0x…
 */
import { createAccount, createClient } from "genlayer-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chain, FEE_FLOOR, leaderOf, rpc, waitFinal } from "./lib.mjs";

const ADDR = process.argv[2];
if (!ADDR) { console.error("usage: seed-record.mjs 0x…"); process.exit(1); }
const KEYS_PATH = fileURLToPath(new URL("../../.data/keys.json", import.meta.url));
const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
const OP = createAccount(keys.OPERATOR.pk);
const BUYER = createAccount(keys.BUYER.pk);
const opClient = createClient({ chain, account: OP });
const buyerClient = createClient({ chain, account: BUYER });
const GEN = 10n ** 18n;

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const D1 = day(1);
const D2 = day(2);

// The book: two controls with known answers among genuinely open questions.
const MARKETS = [
  { location_id: "panama-colon", metric: "TEMP_MAX", comparison: "GTE", threshold_x100: 500, window_date: D1 },   // YES control: tropics beat 5 °C
  { location_id: "rotterdam", metric: "WIND_MAX", comparison: "GTE", threshold_x100: 6000, window_date: D1 },     // NO control: 60 m/s is beyond hurricane
  { location_id: "newark", metric: "WIND_MAX", comparison: "GTE", threshold_x100: 700, window_date: D1 },         // fast lane, open question
  { location_id: "singapore", metric: "PRECIP_SUM", comparison: "GTE", threshold_x100: 800, window_date: D1 },    // tropical rain, open question
  { location_id: "houston", metric: "TEMP_MAX", comparison: "GTE", threshold_x100: 3300, window_date: D1 },       // fast lane heat line
  { location_id: "gibraltar", metric: "WIND_MAX", comparison: "GTE", threshold_x100: 1000, window_date: D2 },
  { location_id: "hormuz", metric: "WIND_MAX", comparison: "GTE", threshold_x100: 900, window_date: D2 },
  { location_id: "shanghai", metric: "PRECIP_SUM", comparison: "GTE", threshold_x100: 500, window_date: D2 },
];

let step = 0;
async function write(client, functionName, args, value = 0n) {
  step += 1;
  const who = client === opClient ? "op" : "buyer";
  console.log(`#${step} ${who} ${functionName}(${JSON.stringify(args).slice(0, 80)}) value=${value}`);
  const est = await client.estimateTransactionFees();
  const feeValue = est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR;
  const hash = await client.writeContract({
    address: ADDR, functionName, args, value,
    fees: { distribution: est.distribution, feeValue },
  });
  const t = await waitFinal(hash, { label: functionName, tries: 120 });
  const leader = leaderOf(t);
  console.log(`  ${hash} ${t.result_name} leader=${leader?.execution_result}`);
  if (leader?.execution_result !== "SUCCESS") {
    console.error(String(leader?.genvm_result?.stderr ?? "").slice(-500));
    throw new Error(`${functionName} failed`);
  }
}

console.log(`seeding ${ADDR}; window dates ${D1} / ${D2}`);
await write(opClient, "seed_reserve", [], 5n * GEN);
for (const m of MARKETS) await write(opClient, "create_market", [JSON.stringify(m)]);

// A living book: both sides hold something on the open questions.
await write(opClient, "stake", ["mk-000003", "YES"], GEN / 10n);
await write(buyerClient, "stake", ["mk-000003", "NO"], GEN / 12n);
await write(opClient, "stake", ["mk-000004", "NO"], GEN / 10n);
await write(buyerClient, "stake", ["mk-000004", "YES"], GEN / 14n);
await write(opClient, "stake", ["mk-000001", "YES"], GEN / 20n);
await write(buyerClient, "stake", ["mk-000002", "NO"], GEN / 20n);
await write(opClient, "stake", ["mk-000005", "YES"], GEN / 25n);

// One live ticket: the YES control + the NO control, both sides picked right.
await write(buyerClient, "buy_ticket", [JSON.stringify([
  { market_id: "mk-000001", side: "YES" },
  { market_id: "mk-000002", side: "NO" },
])], GEN / 10n);

const stats = JSON.parse(await opClient.readContract({ address: ADDR, functionName: "get_stats", args: [] }));
console.log("stats:", JSON.stringify(stats));
console.log("SEED COMPLETE");
