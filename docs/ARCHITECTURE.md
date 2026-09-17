# Architecture

One intelligent contract, one Next.js app, nothing in between. No backend,
no database, no worker, no secrets. The chain is the record and the
browser reads it directly.

```
contracts/isobar.py        the entire mechanism (isobar-rules-2)
tests/direct/              55 tests on a runtime-strict stub + 8 on the official runner
tests/integration/         gltest suite on Studio Next (throwaway deployments)
tests/mutation/            14 safety floors broken in place, all caught
frontend/                  the pressure room (Next.js, Vercel Root Directory)
  lib/                     network config · budgeted cached reads · pure acts · vocabulary
  lib/kit.ts               Transaction Kit bound to the CONNECTED wallet's provider;
                           payouts priced by simulation (message allocations)
  app/                     8 routes; every act via the kit's headless flow
  scripts/                 deploy / verify / probes / disposable E2E / seed
deploy/deployScript.ts     `genlayer deploy` entry point (boilerplate shape)
docs/                      probe report · this file · threat model · demo script
```

## On-chain vs off

**On-chain (the contract owns it all):** the market catalog and every rule;
markets, positions, tickets, rounds, the claim ledger, the parlay reserve;
evidence fetching, snapshot agreement, the panel, the derivation; every
window (tx-datetime clock); every refusal sentence.

**Off-chain (the browser only):** rendering, wallet discovery (EIP-6963),
fee estimation and submission through Transaction Kit, budgeted reads (the
gen_call bucket is 30 per rolling minute per IP: reads run concurrently up
to 22 starts a minute, shared across tabs, cached 30 s, and each visitor
spends their own budget; a server proxy would pool them).

**Nowhere:** user accounts, private data, custody, API keys. The evidence
APIs are public and keyless by design: a public contract cannot carry a
secret, so sources that need one were never candidates.

## The resolution round, step by step

1. Any wallet calls `resolve` once both sources can cover the date
   (`window date + 1 + lag days`; lag measured, per lane, in the probe
   report).
2. The leader, and independently every validator, fetches both URLs the
   contract built, normalizes each payload to its **stable form** (the
   measured series only; volatile per-request metadata stripped, because it
   splits honest validators), extracts the reading **in code** with units
   normalized in code, and excerpts the stable form.
3. Validators compare the leader's recorded snapshot against their own
   fetch: row identity, `covered`, the reading, prefix-compatible excerpts,
   a digest that covers exactly the stored excerpt, no empty excerpt behind
   `fetched`. Any mismatch prints a `[DISAGREE]` reason and fails the round.
4. The panel (an LLM prompt run by each node) judges data quality per
   source (covered, anomaly, a verbatim grounding quote) plus one
   sufficiency bit. Validators compare **consequences only** (the covered
   flags and the sufficiency bit), never wording; an ungrounded "covered"
   is downgraded in code before it can matter.
5. `_derive`, pure code, maps agreed readings to
   YES / NO / VOID_CONFLICT / RETRY. The round record (snapshot, panel
   findings, outcome) is written once agreed and is what any appeal re-reads.

## The appeal

One per market, wallet-with-stake only, inside a 60-minute tx-datetime
window. The appeal panel re-reads the **recorded** snapshot (nothing
refetched, asserted in tests by a fetch log) plus the appellant's grounds,
defused so party text cannot impersonate an evidence fence. The same
derivation runs on the same recorded readings: uphold or void. The record
of both rounds stays readable forever (`get_round`).

## Money

All value moves through a pull ledger: finalization credits shares exactly
once (dust conserved to a staker, never burned); `claim()` zeroes the
balance, then emits the transfer through an empty EVM-interface payee
proxy, the platform's supported shape for paying a bare wallet. Payable
refusals credit the incoming value back. The parlay reserve is
deployer-seeded, its exposure is debited at ticket purchase and released at
settlement, and the deployer can withdraw only what no live ticket needs.

## The frontend contract

- `lib/acts.ts` is a pure function `(market, config, account, position,
  tickets, now) → acts with reasons`. Every button the app shows comes
  from it, every blocked act is a sentence, and it is unit-tested at each
  clock boundary to the second.
- `lib/present.ts` owns the vocabulary: no raw enum, id, wei value or URL
  reaches a primary surface; hashes and URLs live behind a labeled
  verification view.
- Writes run through `useTransactionFlow` (Transaction Kit) rendered in the
  app's own panel: estimate → review (fee receipt, queue depth, live
  fee-policy verification) → sign → track. "Confirmed" appears only at
  FINALIZED with a successful execution.
