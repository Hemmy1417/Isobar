/**
 * Keep the book open: two markets whose positions stay open for one and two
 * weeks (dates are relative to today, so this is safe to re-run) — enough
 * for staking and a two-leg parlay — with a little on both sides so the
 * pools show a living price.
 *
 * Usage: node scripts/seed-fresh.mjs [0x…]   (defaults to the deployment of record)
 */
import { createAccount, createClient } from "genlayer-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chain, FEE_FLOOR, leaderOf, rpc, waitFinal } from "./lib.mjs";

const ADDR = process.argv[2] ?? "0x169cE1cD5aAa013adee55a4B3ed86752cc999375";
const KEYS_PATH = fileURLToPath(new URL("../../.data/keys.json", import.meta.url));
const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
const OP = createAccount(keys.OPERATOR.pk);
const BUYER = createAccount(keys.BUYER.pk);
const opClient = createClient({ chain, account: OP });
const buyerClient = createClient({ chain, account: BUYER });
const GEN = 10n ** 18n;

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const MARKETS = [
  { location_id: "panama-colon", metric: "WIND_MAX", comparison: "GTE", threshold_x100: 500, window_date: day(7) },
  { location_id: "hamburg", metric: "WIND_MAX", comparison: "GTE", threshold_x100: 1000, window_date: day(14) },
];

async function faucet(address) {
  const res = await rpc("sim_fundAccount", [address, (10n * GEN).toString()]);
  if (res.error) throw new Error(`faucet: ${res.error.message}`);
}

let step = 0;
async function write(client, functionName, args, value = 0n) {
  step += 1;
  const who = client === opClient ? "op" : "buyer";
  console.log(`#${step} ${who} ${functionName}(${JSON.stringify(args).slice(0, 90)}) value=${value}`);
  const est = await client.estimateTransactionFees();
  const feeValue = est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR;
  const hash = await client.writeContract({
    address: ADDR, functionName, args, value,
    fees: { distribution: est.distribution, feeValue },
  });
  const t = await waitFinal(hash, { label: functionName, tries: 150 });
  const leader = leaderOf(t);
  const out = typeof leader?.result === "string" ? Buffer.from(leader.result, "base64").toString("utf8").replace(/^[\x00-\x1f]+/, "") : "";
  console.log(`  ${hash} ${t.result_name} leader=${leader?.execution_result} ${out.slice(0, 90)}`);
  if (leader?.execution_result !== "SUCCESS" || out.includes('"refused": true')) {
    throw new Error(`${functionName} did not succeed: ${out.slice(0, 200)}`);
  }
  return out;
}

const read = async (fn, args = []) => JSON.parse(await opClient.readContract({ address: ADDR, functionName: fn, args }));

console.log(`fresh markets on ${ADDR}: ${MARKETS.map((m) => `${m.location_id}@${m.window_date}`).join(", ")}`);
await faucet(OP.address);
await faucet(BUYER.address);

const before = await read("list_markets", [0, 50]);
for (const m of MARKETS) await write(opClient, "create_market", [JSON.stringify(m)]);
const ids = (await read("list_markets", [0, 50])).slice(before.length);
if (ids.length !== MARKETS.length) throw new Error(`expected ${MARKETS.length} new markets, got ${ids.length}`);

// A living price on most of them: both sides hold something.
const STAKES = [[0, 10n, 12n], [1, 20n, 16n]];
for (const [i, yesDiv, noDiv] of STAKES) {
  await write(opClient, "stake", [ids[i], "YES"], GEN / yesDiv);
  await write(buyerClient, "stake", [ids[i], "NO"], GEN / noDiv);
}

for (const id of ids) {
  const m = await read("get_market", [id]);
  console.log(`${id} ${m.phase} ${m.location_id} ${m.metric} ≥ ${m.threshold_x100 / 100} on ${m.window_date}  yes=${m.yes_pool_wei} no=${m.no_pool_wei}`);
}
console.log("stats:", JSON.stringify(await read("get_stats")));
console.log("SEED FRESH COMPLETE");
