/**
 * Live proofs on the DEPLOYMENT OF RECORD — pristine rules, future-dated
 * markets, run when each market's honest lag allows. Every check is an
 * assertion; run it any day and it does whatever the calendar permits:
 *
 *   node scripts/live-record.mjs status      what is actionable today
 *   node scripts/live-record.mjs resolve     resolve every resolvable market, assert controls
 *   node scripts/live-record.mjs finalize    finalize every closed-window verdict
 *   node scripts/live-record.mjs settle      settle the ticket + claims when legs are final
 *   node scripts/live-record.mjs walls       negative controls that need no calendar
 *
 * Controls seeded 16 Sep: mk-000001 Panama TEMP_MAX ≥ 5 °C (certain YES),
 * mk-000002 Rotterdam WIND_MAX ≥ 60 m/s (certain NO). Ticket tk-000001 =
 * mk-1 YES + mk-2 NO (both sides picked right → WON at 3.24× demo).
 */
import { createAccount, createClient } from "genlayer-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chain, rpc, sleep, FEE_FLOOR, waitFinal, leaderOf } from "./lib.mjs";

const ADDR = "0x169cE1cD5aAa013adee55a4B3ed86752cc999375";
const KEYS_PATH = fileURLToPath(new URL("../../.data/keys.json", import.meta.url));
const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
const OP = createAccount(keys.OPERATOR.pk);
const BUYER = createAccount(keys.BUYER.pk);
const opClient = createClient({ chain, account: OP });
const buyerClient = createClient({ chain, account: BUYER });
const GEN = 10n ** 18n;

const say = (m) => console.log(`[${new Date().toISOString().slice(0, 19)}Z] ${m}`);
const assert = (cond, what) => {
  if (!cond) { console.error(`ASSERT FAILED: ${what}`); process.exit(1); }
  say(`  ok: ${what}`);
};

function refusalText(t) {
  const res = leaderOf(t)?.result;
  return typeof res === "string"
    ? Buffer.from(res, "base64").toString("utf-8").replace(/[^\x20-\x7e]/g, " ").trim()
    : "";
}

async function write(client, functionName, args, { value = 0n, expectError = null } = {}) {
  const who = client === opClient ? "op" : "buyer";
  say(`${who} ${functionName}(${JSON.stringify(args).slice(0, 70)})`);
  const est = await client.estimateTransactionFees();
  const feeValue = est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR;
  const hash = await client.writeContract({
    address: ADDR, functionName, args, value,
    fees: { distribution: est.distribution, feeValue },
  });
  const t = await waitFinal(hash, { label: functionName, tries: 150 });
  const leader = leaderOf(t);
  say(`  ${hash} ${t.result_name} leader=${leader?.execution_result}`);
  if (expectError) {
    assert(leader?.execution_result === "ERROR", `${functionName} refused on chain`);
    const text = refusalText(t);
    assert(text.includes(expectError), `refusal names "${expectError}" (got: ${text.slice(0, 120)})`);
    return { refused: true, text };
  }
  return { refused: leader?.execution_result !== "SUCCESS", t, text: refusalText(t) };
}

const read = async (fn, args = []) =>
  JSON.parse(await opClient.readContract({ address: ADDR, functionName: fn, args }));

const [cmd = "status"] = process.argv.slice(2);
const ids = await read("list_markets", [0, 20]);
const markets = {};
for (const id of ids) markets[id] = await read("get_market", [id]);

const CONTROLS = {
  "mk-000001": { verdict: "YES", label: "Panama TEMP ≥ 5 °C — the certain-YES control" },
  "mk-000002": { verdict: "NO", label: "Rotterdam WIND ≥ 60 m/s — the certain-NO control" },
};

if (cmd === "status") {
  for (const [id, m] of Object.entries(markets)) {
    say(`${id} ${m.phase.padEnd(10)} ${m.location_id} ${m.metric} ${m.comparison} ${m.threshold_x100 / 100}${m.unit} on ${m.window_date}` +
        (m.verdict ? ` → ${m.verdict}` : ""));
  }
  const stats = await read("get_stats");
  say(`stats ${JSON.stringify(stats)}`);
} else if (cmd === "resolve") {
  for (const [id, m] of Object.entries(markets)) {
    if (m.phase !== "RESOLVING") { say(`${id}: ${m.phase}, skipping`); continue; }
    const r = await write(opClient, "resolve", [id]);
    if (r.refused) { say(`  refused: ${r.text.slice(0, 120)}`); continue; }
    const after = await read("get_market", [id]);
    say(`  ${id} → ${after.verdict ?? "(retry)"} after round ${after.rounds_count}`);
    const control = CONTROLS[id];
    if (control && after.verdict) {
      assert(after.verdict === control.verdict, control.label);
      const rec = await read("get_round", [id, after.rounds_count]);
      const readings = Object.entries(rec.outcome.readings)
        .map(([s, x]) => `${s}=${x.covered ? x.value_x100 / 100 : "uncovered"}`).join(", ");
      say(`  readings: ${readings}`);
    }
  }
} else if (cmd === "finalize") {
  for (const [id, m] of Object.entries(markets)) {
    if (m.state !== "RESOLVED") continue;
    const r = await write(opClient, "finalize", [id]);
    say(r.refused ? `  ${id}: ${r.text.slice(0, 110)}` : `  ${id} finalized`);
  }
} else if (cmd === "settle") {
  const t = await read("get_ticket", ["tk-000001"]);
  if (t.state === "LIVE") {
    const r = await write(buyerClient, "settle_ticket", ["tk-000001"]);
    if (!r.refused) {
      const after = await read("get_ticket", ["tk-000001"]);
      assert(after.state === "WON",
             "the control ticket won: both certain legs landed as seeded");
    } else say(`  settle waiting: ${r.text.slice(0, 110)}`);
  } else say(`ticket already ${t.state}`);
  for (const [name, client, acct] of [["op", opClient, OP], ["buyer", buyerClient, BUYER]]) {
    const bal = await read("get_balance", [acct.address]);
    if (BigInt(bal.claimable) > 0n) {
      const before = BigInt((await rpc("eth_getBalance", [acct.address, "latest"])).result ?? "0x0");
      await write(client, "claim", []);
      await sleep(6000);
      const after = BigInt((await rpc("eth_getBalance", [acct.address, "latest"])).result ?? "0x0");
      assert(after > before, `${name}'s claim moved real value on the record deployment`);
    } else say(`${name}: nothing claimable yet`);
  }
} else if (cmd === "walls") {
  // Calendar-free negative controls on the pristine contract, sent for real.
  // Non-payable refusals revert with the contract's sentence; PAYABLE
  // refusals RETURN with the value credited back (rules-2: a revert would
  // strand the transaction's value — proven live on rules-1, then fixed).
  await write(buyerClient, "resolve", ["mk-000001"],
              { expectError: "resolves after its sources" });
  await write(buyerClient, "appeal", ["mk-000006", "premature"],
              { expectError: "needs a standing verdict" });
  const before = BigInt((await read("get_balance", [BUYER.address])).claimable);
  await write(buyerClient, "stake", ["mk-999999", "YES"], { value: GEN / 50n });
  await write(buyerClient, "seed_reserve", [], { value: GEN / 100n });
  const bal = await read("get_balance", [BUYER.address]);
  const credited = BigInt(bal.claimable) - before;
  assert(credited === GEN / 50n + GEN / 100n,
         `both refused payables credited back (${credited} wei claimable)`);
  const stats = await read("get_stats");
  assert(stats.reserve_wei === "5000000000000000000",
         "the stranger's value never reached the reserve");
  say("WALLS COMPLETE");
} else {
  console.error(`unknown command ${cmd}`);
  process.exit(1);
}
