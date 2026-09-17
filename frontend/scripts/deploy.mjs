/**
 * Deploy Isobar to GenLayer Studio Next and verify the bytes.
 *
 *   node scripts/deploy.mjs keys                create .data/keys.json (operator) if absent, fund it
 *   node scripts/deploy.mjs                     deploy contracts/isobar.py, wait, print the address
 *   node scripts/deploy.mjs file <path>         deploy an arbitrary contract file (probes, variants)
 *   node scripts/deploy.mjs verify 0x…          fetch deployed source, diff byte-for-byte vs contracts/isobar.py
 *
 * Signs with the OPERATOR key in .data/keys.json (gitignored). Studio Next
 * refuses a transaction without a fee distribution and a non-zero deposit,
 * so the estimate is taken explicitly and floored.
 */
import { createAccount, createClient } from "genlayer-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { chain, rpc, sleep, FEE_FLOOR } from "./lib.mjs";
const SOURCE = fileURLToPath(new URL("../../contracts/isobar.py", import.meta.url));
const KEYS_PATH = fileURLToPath(new URL("../../.data/keys.json", import.meta.url));
const sha = (s) => createHash("sha256").update(s, "utf-8").digest("hex");

async function deployFile(path) {
  const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
  const account = createAccount(keys.OPERATOR.pk);
  const client = createClient({ chain, account });
  const code = readFileSync(path, "utf-8");
  if (code.includes("\r")) throw new Error("contract carries CR bytes — normalize to LF before deploying");
  console.log(`deploying ${path} (sha256 ${sha(code)}) as ${account.address} on chain ${chain.id}`);
  const est = await client.estimateTransactionFees();
  const feeValue = est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR;
  const hash = await client.deployContract({
    code,
    args: [],
    fees: { distribution: est.distribution, feeValue },
  });
  console.log(`deploy tx ${hash}`);
  for (let i = 0; i < 90; i++) {
    await sleep(4000);
    const t = (await rpc("eth_getTransactionByHash", [hash])).result;
    const status = t?.status ?? t?.statusName;
    if (status === "FINALIZED") {
      const arr = t.consensus_data?.leader_receipt ?? [];
      const leader = arr.find((x) => x?.mode !== "validator") ?? arr[0];
      console.log(`FINALIZED — ${t.result_name} — leader ${leader?.execution_result}`);
      if (leader?.execution_result !== "SUCCESS") {
        console.error(String(leader?.genvm_result?.stderr ?? "").slice(-1800));
        process.exit(1);
      }
      console.log(`CONTRACT ${t.data?.contract_address}`);
      process.exit(0);
    }
    if (status === "CANCELED" || status === "UNDETERMINED") { console.error(`deploy ${status}`); process.exit(1); }
    if (i % 5 === 4) console.log(`  … ${status ?? "pending"}`);
  }
  console.error("no finality after 6 minutes — check the hash on the explorer");
  process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === "keys") {
  if (existsSync(KEYS_PATH)) {
    const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
    console.log(`keys exist — operator ${keys.OPERATOR.addr}`);
  } else {
    const pk = "0x" + randomBytes(32).toString("hex");
    const account = createAccount(pk);
    mkdirSync(fileURLToPath(new URL("../../.data", import.meta.url)), { recursive: true });
    writeFileSync(KEYS_PATH, JSON.stringify({ OPERATOR: { pk, addr: account.address } }, null, 2));
    console.log(`operator created: ${account.address} (key in .data/keys.json — gitignored, never printed)`);
  }
  const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
  const fund = await rpc("sim_fundAccount", [keys.OPERATOR.addr, 500]);
  console.log(`faucet: ${JSON.stringify(fund.result ?? fund.error).slice(0, 90)}`);
  await sleep(4000);
  const bal = await rpc("eth_getBalance", [keys.OPERATOR.addr, "latest"]);
  console.log(`balance: ${BigInt(bal.result ?? "0x0")}`);
} else if (cmd === "verify") {
  const r = await rpc("gen_getContractCode", [arg]);
  const raw = typeof r.result === "string" ? r.result : (r.result?.code ?? "");
  const live = raw.startsWith("# ") ? raw : Buffer.from(raw, "base64").toString("utf-8");
  const repo = readFileSync(SOURCE, "utf-8");
  console.log(`live  sha256 ${sha(live)}  (${live.length} chars)`);
  console.log(`repo  sha256 ${sha(repo)}  (${repo.length} chars)`);
  if (live !== repo) {
    const a = live.split("\n"), b = repo.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) { console.log(`first difference at line ${i + 1}\n  live: ${a[i]}\n  repo: ${b[i]}`); break; }
    }
    console.error("verify: the deployed source does NOT match the repo file");
    process.exit(1);
  }
  console.log("verify: byte-for-byte identical");
} else if (cmd === "file") {
  await deployFile(arg);
} else if (cmd === undefined) {
  await deployFile(SOURCE);
} else {
  console.error(`unknown command ${cmd}`);
  process.exit(1);
}
