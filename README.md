<p align="center"><img src="assets/logo.svg" width="84" alt="Isobar"></p>

<h1 align="center">Isobar</h1>

<p align="center">Parimutuel weather-threshold markets, adjudicated on GenLayer.<br>
Every validator fetches two independent agencies itself; deterministic code derives the verdict;<br>
one appeal re-reads the agreed record before any money moves.</p>

---

**the product in one breath** — a market asks one falsifiable question: did a
daily weather metric at a fixed coordinate cross a fixed threshold on a fixed
UTC date? Stake GEN on yes or no at sixteen strategic logistics stations —
canals, straits, ports. When the day has passed, any wallet triggers a
resolution round: every validator fetches both evidence sources, the panel
agrees on the recorded readings line by line, and contract code — never a
model — turns them into the verdict. Chain markets into a parlay ticket whose
full payout is reserved on-chain the moment it is bought.

## The deployment of record

| | |
|---|---|
| Contract | [`0x169cE1cD5aAa013adee55a4B3ed86752cc999375`](https://explorer-studio-dev.genlayer.com/address/0x169cE1cD5aAa013adee55a4B3ed86752cc999375) |
| Network | GenLayer Studio Next (chain 61997) |
| Deploy tx | `0x172624caa71e7b5470eda8094a0fb5b52b74ed985ec7bd55682e597f9eb9e67c` |
| Source | [`contracts/isobar.py`](contracts/isobar.py), ruleset `isobar-rules-2` |
| Byte verification | `node frontend/scripts/deploy.mjs verify 0x169cE1cD…` → sha256 `b5ea1af9…20890f`, byte-for-byte identical |
| Frontend stack | Next.js + **Transaction Kit 0.1.0-rc.2** (headless flow), genlayer-js 2.0.0-rc.1 |

Superseded during development (probe and diagnosis only, patches disclosed
below): `0x316BFc2d…70F1`, `0x0E9B0566…E90c` (throwaway fetch/clock probes),
`0x8E837328…cc11`, `0x2b57BDCB…E3a2`, `0xFF60C795…6CE2` (patched disposables
for same-day end-to-end runs); `0x85328a61…27b5` (rules-1 record, superseded
by rules-2's fix: a payable refusal now RETURNS the value to the claim ledger
instead of reverting — on this platform a revert strands the transaction's
value, so the walls receipt below became a fix).

## Why GenLayer is load-bearing

Weather "truth" is plural. Two reputable datasets disagree at the margin,
stations go dark mid-window, agencies revise readings. A price-feed oracle
cannot adjudicate that; a centralized backend must be trusted not to. Here
the money question is answered *inside consensus*: validators each fetch two
independent public agencies — different organizations, different data
lineages — agree on the recorded evidence row by row, and judge the messy
parts (does this payload truly cover the date? is it trustworthy enough to
settle on?) with quotes that must appear in the fetched bytes. The payout
math reads only agreed, validated values. When the sources split, **nobody
settles**: the market voids and every stake is refunded — in either
direction, because honesty about disagreement beats a guess.

## What the contract owns, and what it refuses to

- **Nobody supplies a URL.** A market is a catalog location × metric ×
  comparison × threshold × UTC date; the contract builds both evidence URLs
  in code. There is no party-chosen source to tamper with, mislabel, or
  smuggle credentials into.
- **Every recorded account is the signing wallet.** No write takes an
  account parameter; the creator, stakers, ticket holders and appellants are
  whoever signed.
- **The snapshot is agreed where it is written.** Validators re-fetch both
  sources and compare the recorded rows: readings exactly, excerpts of the
  normalized payload by prefix, digests that must cover exactly the stored
  bytes, a fetched row with an empty excerpt refused outright. A leader
  cannot store a page no other node ever saw.
- **The panel never touches money.** It judges data quality only — it is
  never told the threshold, the sides, or the pools — and each judgment
  needs a verbatim quote from the payload it judges. Insufficient data
  blocks *both* verdicts.
- **One appeal, against the record.** A wallet with money at stake may force
  one fresh round that re-reads the recorded snapshot — zero refetches, so
  the appellant argues against the same bytes the first panel saw. It can
  uphold or void; it cannot invent an outcome. Settlement never front-runs
  the window.
- **No fund traps.** Finalize and settle are permissionless; a market that
  can never reach a verdict voids on a timeout anyone can trigger; claims
  are pull-payment and idempotent; a refused payable write credits its value
  straight back to the sender's claimable balance.
- **The parlay reserves at purchase.** Tickets (2–4 legs, flat multipliers
  **labeled demo pricing on every surface**) reserve their full payout from
  a deployer-seeded on-chain reserve at buy time or are refused in words. A
  voided leg drops out of the multiplier; a ticket of voids refunds.

## Lifecycle

```
open ──(window date begins)── observing ──(sources cover: +2d fast / +5d global)── resolving
                                                                                      │
                       every validator fetches both agencies; code derives            ▼
  YES / NO ◄──────────────────────────────────────────────────────────── resolution round
     │                                                    │                    │
     │                              sources split → VOID_CONFLICT       <2 covered → RETRY
     ▼                                                                     (round recorded,
  appeal window (60 min, disclosed) ── one appeal by money at stake ──┐     market stays
     │                                                                │     resolvable; cap 5
     ▼                                                                ▼     rounds → timeout)
  finalize (permissionless) ◄──────────────────────── appeal upholds or voids
     │
     ▼
  pools settle pro-rata → pull ledger → claim()          unresolved forever → void_timeout()
```

## Live, on chain — the disposable proving ground (16 Sep 2026)

The mechanism was proven same-day on a **disposable variant** of the real
contract with four printed patches (past dates allowed; stake, ticket and
resolve-lag gates opened — nothing else), so resolution could run against
the real recorded weather of **11 Sep 2026 at Colón**, where the two
reanalyses genuinely disagree: Open-Meteo 5.22 m/s, NASA POWER 3.84 m/s.
Contract `0xFF60C795…6CE2`; every transaction FINALIZED under
`MAJORITY_AGREE`; explorer: `https://explorer-studio-dev.genlayer.com/tx/<hash>`.

| proof | asserted | tx |
|---|---|---|
| threshold 3.00 → **YES** | both sources over; agreed readings `{open-meteo: 5.22, nasa-power: 3.84}` recorded in the round | `0x6af4cf1f28a4a05ddacc1a3fe0d1abe2926fb58d10ca0a5570450b7bc0f2976b` |
| threshold 5.00 → **VOID_CONFLICT** | a genuine reanalysis split settles nobody | `0xf906845693d0d183038d08eb3cc0a4c52bc612b8d4bd974bbdf39ee555d56b1b` |
| window 15 Sep → **RETRY** | POWER still `-999`: *no corroboration, no settlement*; round recorded, market stays resolvable | `0x6b751a2e92c03639a6aa015b09750539a8aab442dfa118ceba0c2c63b1eb1213` |
| threshold 8.00 → **NO** | the negative control fired | `0xb4559f21d8b49d8484d4926993dfa5141eb412c0378d41f310bd309cb0ac809b` |
| re-resolve refused | `[EXPECTED] a verdict already stands; a re-judgment is an appeal` | `0x3f77f6d710ea101edeb7fe6f96f954a2d42d6ec7b75c3991690bc24d3a58f0a5` |
| early finalize refused | `[EXPECTED] the appeal window is open for 3600 seconds after resolution` | `0x2e1569c1a37159b8bf69f56237422cb7394752689f5fdd4e1e1ac47927494935` |
| the appeal | re-read the recorded snapshot (zero fetches), **upheld YES**, round names the reviewed record | `0xff1c55e548c2d531a753b44fedb400f7c4c0d0bf389720253c34534b7f4f21d2` |
| second appeal refused | `[EXPECTED] the market's one appeal is already on the record` | `0xcf0b80367be0e459e11f7b6a6f373b98ecfdbb7849e14d8774b71ab6e32ba769` |
| finalize after the appeal | pools settled exactly once | `0xe53b530da806ee4d18fb52698073f6a2a83e4c87cdf0e275b856aa45b239a489` |
| parlay ticket | 3.24×, labeled `DEMO_FLAT`, full exposure reserved at purchase | `0x7992a56ac6e0021b04c684b4179f42a9cf3f7b3d037b2f25d18de96183ad9d3c` |
| void finalized | B settles nobody; both stakes refunded to the claim ledger | `0xd29f6054919505fccca7f0acb6e3b6081178f9e92366e5213a393119b8b9272b` |
| negative control finalized | D final **NO** | `0x45660b4027d048845dc02349d77aa7c46e813dbed6c76719f4f0a70d066ff0c5` |
| parlay settled | A YES + D NO → ticket **WON**, 0.324 GEN credited, exposure released to zero | `0x9a0fc3f96b21ed5c95f064d0a1e5cfff0e8b6540299bfee22cbd6c8b5b353dba` |
| real-GEN claim | 0.344 GEN (void refund + ticket payout) left the contract for the buyer's wallet; ledger drained exactly once | `0x5cd993fc2d6a77189e7c6be03472a50d62de7fbf8545121959c69cc07c903359` |
| double claim refused | `[EXPECTED] nothing claimable for this wallet` | `0x0e5604e34dbe21b0d6a59ded960b5ce727c16695a8ecafaaf4d3fb41f4b990e5` |

**A claim needs the fee simulation's message allocations.** The first claim
attempt was sent with a plain fee estimate and finalized with the leader
refusing `fee no_matching_allocation # external`
(`0x24cd035aa6e4cbf7589b2be93ede586130f23ef0b2061cd88d0c903a2f569719`) —
consensus agreed the write failed, the ledger stayed intact, nothing was
lost. Transaction Kit 0.1.0-rc.2 prices from defaults and submits without
allocations, so the app wraps it: `claim` is priced by
`estimateTransactionFeesForWrite` and signed with the allocations it
measured, every other write goes through the kit unchanged
([`frontend/lib/kit.ts`](frontend/lib/kit.ts), tested in `frontend/tests/kit.test.ts`).

The deployment of record runs
the pristine rules on future-dated markets — its book was seeded on 16 Sep
with a certain-YES control (Panama ≥ 5 °C), a certain-NO control (Rotterdam
wind ≥ 60 m/s) and open questions across the catalog, resolving on their
honest lags over the following days.

### Walls on the deployment of record (17 Sep 2026)

Calendar-free negative controls sent for real against `0x169cE1cD…9375`
(`node frontend/scripts/live-record.mjs walls`), all FINALIZED under `MAJORITY_AGREE`:

| wall | asserted | tx |
|---|---|---|
| early resolve refused | `[EXPECTED] the market resolves after its sources can cover 2026-09-17 (4 day lag)` | `0x09b2fbd0d46c5b0162b6d90a236701b4b358f4d0d87ee09797a7695ce9248911` |
| premature appeal refused | `[EXPECTED] an appeal needs a standing verdict` | `0x56ed1b4a8082fedf4a66fed6893b275b8f63d09219b8a610895727bee98253ac` |
| stake on an unknown market | returned as refused; 0.02 GEN credited back to the sender | `0x47ef4c2bdb11712fbaafe58412d873b3c268d2e05ad2f3bcd546b2f1ce6180ad` |
| stranger seeds the reserve | returned as refused; 0.01 GEN credited back, reserve unchanged at 5.1 GEN | `0x62cec11951ff65833826233e210f89cd0aaee8101d5b7721ee02e64f05efc724` |

The two payable refusals are the rules-1 fund-stranding fix, proven on the
pristine contract: 0.03 GEN claimable back, none of it absorbed.

## The evidence model, measured before it was coded

Receipts in [docs/PROBE-REPORT.md](docs/PROBE-REPORT.md): source latencies
from the browser (Open-Meteo carries yesterday; NASA POWER trails ~3 days,
`-999` fill parsed as *not covered*, never a reading; NWS is minutes old,
km/h converted in code); the boilerplate's newer runner rejected by Studio
Next; all three APIs fetched and parsed inside a consensus round (NWS's
620 KB day of observations included); and the transaction clock — the
standard-library `datetime.now` *is* the tx datetime on this runner, and
`gl.message_raw` is gone.

## Running it

Built on the [GenLayer project boilerplate (v2-dev)](https://github.com/genlayerlabs/genlayer-project-boilerplate/tree/v2-dev):
same layout (`contracts/`, `tests/direct`, `tests/integration`, `frontend/`, `deploy/`),
same toolchain pins, same CI jobs.

### Requirements

- Python >= 3.12, Node 22
- [GenLayer CLI](https://github.com/genlayerlabs/genlayer-cli): `npm install -g genlayer`
- Nothing else for the app: the deployment of record and Studio Next are compiled in

### Quick start

```shell
# 1. Python toolchain (genlayer-py, genlayer-test, genvm-linter — the boilerplate pins)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Lint + validate the contract against the SDK its Depends header pins
genvm-lint check contracts/isobar.py

# 3. Direct mode tests (in-memory, no network)
pytest tests/direct/ -v

# 4. Frontend (npm workspace, from the repo root)
npm ci
npm run dev                  # http://localhost:3132
npm run lint && npm test && npm run build

# 5. Integration tests on Studio Next (deploys a throwaway instance)
echo "ISOBAR_TEST_PRIVATE_KEY=0x…" >> .env      # a funded Studio Next key, gitignored
gltest tests/integration/ --network studio_devnet -v -s
npm run test:fees            # same run, measuring frontend/fee-profile.json (chainId 61997)

# 6. Deploy your own instance
genlayer deploy              # runs deploy/deployScript.ts
node frontend/scripts/deploy.mjs verify 0x…     # byte-for-byte against contracts/isobar.py
```

**Deploying the frontend on Vercel**: import the repo, set **Root Directory** to `frontend`.
No environment variables are required; `frontend/.env.example` lists the optional overrides
(network and contract address — the wallet, genlayer-js and Transaction Kit share one network config).

### Testing strategy

| layer | command | what it proves | count |
|---|---|---|---|
| **Lint** | `genvm-lint check contracts/isobar.py` | SDK validation passes (23 methods); lint clean apart from one documented finding (below) | — |
| **Direct, stub harness** | `pytest tests/direct/` | lifecycle, consensus refusals (forged snapshots, self-digests, empty excerpts, split readings), appeal, parlay, walls, wei conservation with dust — every validator runs on every call | 55 |
| **Direct, official runner** | `pytest tests/direct/test_sdk_runner.py` | the same mechanism on the real SDK (`direct_vm`): YES round, validator agree / disagree, forged leader refused, void refunds, retry, payable refusal credited, claim, checksummed-signer keys | 8 |
| **Mutation sweep** | `python tests/mutation/mutate.py` | every safety floor broken in place is caught; restore-control passes | 14/14 killed |
| **Frontend** | `npm test` | acts availability at every boundary, vocabulary, read budget, refusal decoding, kit wiring + payout allocations, network config, pinned releases, checksummed accounts, transaction panel finality, deploy script | 62 |
| **Integration** | `gltest tests/integration/ --network studio_devnet` | on Studio Next: deploy, catalog, market + stake, refusal walls, refused payable credited back, real-GEN claim with message allocations | 4 |
| **Live proofs** | `node frontend/scripts/live-record.mjs` | the tables above, on the deployment of record and the disposable | scripted assertions |

**Fee profile — measured, and deliberately not wired.** `npm run test:fees` measures a
gltest profile on Studio Next (chainId 61997). Priced exactly the way Transaction Kit applies
a developer profile, those allocations **failed live**: `create_market` and `stake` both
finalized with the leader refusing `out_of receipt message`
(`0x9b949022823d452d3a22a402b6bd04ab5b36481cf4b8642a8688561c9297748b`,
`0xc2035db18df5a67e90df79018f226c4e436cc3e740e05a16181529dcfee2a53a`, on the disposable).
The measured budgets cover execution but underfund receipts. The app therefore passes a profile
that names chain 61997 with no method entries, so the kit sizes every write from live network
defaults — the path every in-app and scripted write on this deployment has used. `claim` is
additionally priced by simulation for its message allocations.

**The one lint finding.** `genvm-lint check` (v0.11-dev) reports E022 — "method must have
`self`" — on the `@staticmethod` helper `_snapshot_agrees`. It is valid Python that already runs
inside live consensus rounds; changing it would change the byte-verified contract and require a
redeploy. CI allows exactly that finding and fails on any other.

## Honest limits

- Verdicts are **daily UTC thresholds** — not minute-level claims, not
  causation ("this storm delayed that ship" is a later milestone with a
  different evidence bar).
- Reanalysis datasets genuinely disagree sometimes; the split rule **voids
  instead of guessing**, and single-source days never settle.
- Parlay multipliers are **flat demo pricing**, not market odds, labeled on
  every surface; the reserve is deployer-seeded protocol capital, disclosed,
  taking no third-party deposits.
- The appeal window is 60 minutes on this deployment — long enough to
  dispute, short enough to demo; it is a config constant, stated everywhere
  it matters.
- Test GEN on Studio Next. A working mechanism, not a licensed financial
  product.

## The docs

[PROBE-REPORT](docs/PROBE-REPORT.md) — measurements with receipts ·
[ARCHITECTURE](docs/ARCHITECTURE.md) — how the pieces fit ·
[THREAT-MODEL](docs/THREAT-MODEL.md) — who can cheat whom, and what stops them
