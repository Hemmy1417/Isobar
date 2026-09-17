/**
 * Finish the disposable E2E: markets B and D carry appeal windows of
 * their own (a void verdict is appealable too — the script take 3
 * forgot; the contract did not). Retry their finalizes until the
 * windows close, then run the settlement assertions:
 * refunds for B, ticket A:YES + D:NO settles WON, real claims move GEN,
 * and the double claim is refused.
 *
 * Usage: node scripts/probe/finish-disposable.mjs 0x…
 */
import { createAccount, createClient } from "genlayer-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chain, rpc, sleep, FEE_FLOOR, waitFinal, leaderOf, transferFees } from "../lib.mjs";

const ADDR = process.argv[2];
if (!ADDR) { console.error("usage: finish-disposable.mjs 0x…"); process.exit(1); }
const KEYS_PATH = fileURLToPath(new URL("../../../.data/keys.json", import.meta.url));
const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
const OP = createAccount(keys.OPERATOR.pk);
const BUYER = createAccount(keys.BUYER.pk);
const opClient = createClient({ chain, account: OP });
const buyerClient = createClient({ chain, account: BUYER });
const GEN = 10n ** 18n;

const say = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const assert = (cond, what) => {
  if (!cond) { console.error(`ASSERT FAILED: ${what}`); process.exit(1); }
  say(`  ok: ${what}`);
};

function refusalText(t) {
  const res = leaderOf(t)?.result;
  if (typeof res !== "string") return "";
  return Buffer.from(res, "base64").toString("utf-8").replace(/[^\x20-\x7e]/g, " ").trim();
}

async function write(client, functionName, args, { value = 0n, expectError = null } = {}) {
  const who = client === opClient ? "op" : "buyer";
  say(`${who} ${functionName}(${JSON.stringify(args).slice(0, 70)})`);
  let fees;
  if (functionName === "claim" && !expectError) {
    fees = await transferFees(client, { address: ADDR, functionName, args, value });
  } else {
    const est = await client.estimateTransactionFees();
    fees = { distribution: est.distribution, feeValue: est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR };
  }
  const hash = await client.writeContract({ address: ADDR, functionName, args, value, fees });
  const t = await waitFinal(hash, { label: functionName, tries: 120 });
  const leader = leaderOf(t);
  say(`  ${hash} ${t.result_name} leader=${leader?.execution_result}`);
  if (expectError) {
    assert(leader?.execution_result === "ERROR", `${functionName} refused on chain`);
    const text = refusalText(t);
    assert(text.includes(expectError), `refusal names "${expectError}" (got: ${text.slice(0, 120)})`);
    return { refused: true, text };
  }
  if (leader?.execution_result !== "SUCCESS") {
    return { refused: true, text: refusalText(t) };
  }
  return { refused: false, t };
}

const read = async (fn, args = []) =>
  JSON.parse(await opClient.readContract({ address: ADDR, functionName: fn, args }));

/** Finalize, waiting out the appeal window if the contract says it is open. */
async function finalizeWhenWindowCloses(mid) {
  for (let i = 0; i < 40; i++) {
    const r = await write(opClient, "finalize", [mid]);
    if (!r.refused) return;
    if (!/appeal window is open/.test(r.text)) {
      console.error(`unexpected refusal on ${mid}: ${r.text}`);
      process.exit(1);
    }
    say(`  window still open on ${mid}; waiting 3 minutes`);
    await sleep(180_000);
  }
  console.error("window never closed");
  process.exit(1);
}

const CLAIMS_ONLY = process.argv.includes("--claims");

say(`finishing E2E on ${ADDR}${CLAIMS_ONLY ? " (claims only — settlement already asserted)" : ""}`);
if (!CLAIMS_ONLY) {
await finalizeWhenWindowCloses("mk-000002");
const mB = await read("get_market", ["mk-000002"]);
assert(mB.state === "VOID", "B finalized VOID — conflicted sources settle nobody");
await finalizeWhenWindowCloses("mk-000004");
const mD = await read("get_market", ["mk-000004"]);
assert(mD.state === "FINAL" && mD.verdict === "NO", "D finalized NO");

const balOp = await read("get_balance", [OP.address]);
const balBuyer = await read("get_balance", [BUYER.address]);
// A: op 0.05 YES vs buyer 0.04 NO → op 0.09; B void refunds 0.02 each.
assert(BigInt(balOp.claimable) === GEN * 9n / 100n + GEN / 50n,
       `op claimable = A winnings + B refund (${balOp.claimable})`);
// Buyer: A NO lost (0), B refund 0.02; the C stake stays in the still-open market.
assert(BigInt(balBuyer.claimable) === GEN / 50n,
       `buyer claimable = the B refund alone (${balBuyer.claimable})`);

const settle = await write(buyerClient, "settle_ticket", ["tk-000001"]);
assert(!settle.refused, "ticket settled");
const t1 = await read("get_ticket", ["tk-000001"]);
assert(t1.state === "WON", "parlay won: A hit YES, D hit NO");
const balBuyer2 = await read("get_balance", [BUYER.address]);
assert(BigInt(balBuyer2.claimable) === BigInt(balBuyer.claimable) + (GEN / 10n) * 324n / 100n,
       "ticket payout 0.324 GEN credited");
const stats = await read("get_stats");
assert(stats.reserved_exposure_wei === "0", "exposure released after settlement");
}

const owed = BigInt((await read("get_balance", [BUYER.address])).claimable);
say(`buyer claimable before the claim: ${owed}`);

const before = BigInt((await rpc("eth_getBalance", [BUYER.address, "latest"])).result ?? "0x0");
const claim = await write(buyerClient, "claim", []);
assert(!claim.refused, "claim executed");
await sleep(6000);
const after = BigInt((await rpc("eth_getBalance", [BUYER.address, "latest"])).result ?? "0x0");
say(`buyer chain balance ${before} → ${after}`);
assert(after > before, "claim moved real value to the buyer's wallet");
const drained = await read("get_balance", [BUYER.address]);
assert(BigInt(drained.claimable) === 0n && BigInt(drained.claimed) >= owed,
       `ledger drained exactly once (claimed ${drained.claimed})`);
await write(buyerClient, "claim", [], { expectError: "nothing claimable" });

say("DISPOSABLE E2E FINISHED — every settlement assertion held");
