/** Call the deployed WeatherProbe with the three real API URLs and print
 *  the consensus-recorded report. Usage: node scripts/probe/run-probe.mjs 0x… */
import { createAccount, createClient } from "genlayer-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chain, rpc } from "../lib.mjs";

const KEYS_PATH = fileURLToPath(new URL("../../../.data/keys.json", import.meta.url));
const addr = process.argv[2];
if (!addr) { console.error("usage: run-probe.mjs 0x…"); process.exit(1); }

const URLS = [
  "https://archive-api.open-meteo.com/v1/archive?latitude=9.35&longitude=-79.9&start_date=2026-09-12&end_date=2026-09-12&daily=wind_speed_10m_max&wind_speed_unit=ms&timezone=UTC",
  "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=WS10M_MAX&community=RE&latitude=9.35&longitude=-79.9&start=20260912&end=20260912&format=JSON",
  "https://api.weather.gov/stations/KEWR/observations?start=2026-09-15T00:00:00Z&end=2026-09-15T23:59:59Z&limit=500",
];

const keys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
const account = createAccount(keys.OPERATOR.pk);
const client = createClient({ chain, account });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const est = await client.estimateTransactionFees();
const feeValue = est.feeValue > 10n ** 15n ? est.feeValue : 10n ** 15n;
const hash = await client.writeContract({
  address: addr,
  functionName: "probe",
  args: [JSON.stringify(URLS)],
  fees: { distribution: est.distribution, feeValue },
});
console.log(`probe tx ${hash}`);
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
    const report = await client.readContract({ address: addr, functionName: "read", args: [] });
    const data = JSON.parse(report);
    console.log(`message_raw: type=${data.datetime_type} err=${data.datetime_err || "none"}`);
    console.log(`std datetime.now: ${data.std_now}`);
    for (const row of data.rows) {
      const host = new URL(row.url).host;
      if (row.ok) console.log(`  ${host}: ok chars=${row.chars} keys=${JSON.stringify(row.json_keys)}`);
      else console.log(`  ${host}: FAILED ${row.err}`);
    }
    process.exit(0);
  }
  if (status === "CANCELED" || status === "UNDETERMINED") { console.error(`probe ${status}`); process.exit(1); }
  if (i % 5 === 4) console.log(`  … ${status ?? "pending"}`);
}
console.error("no finality after 6 minutes");
process.exit(1);
