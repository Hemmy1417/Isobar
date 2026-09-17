<p align="center"><img src="assets/logo.svg" width="84" alt="Isobar"></p>

<h1 align="center">Isobar</h1>

<p align="center">Parimutuel weather-threshold markets, adjudicated on GenLayer with no oracle operator.<br>
Every validator fetches two independent public data sources itself; deterministic code derives the verdict;<br>
one appeal re-reads the agreed record before any money moves.</p>

---

**the product in one breath:** a market asks one falsifiable question: did a
daily weather metric at a fixed coordinate cross a fixed threshold on a fixed
UTC date? Stake GEN on yes or no at sixteen strategic logistics stations:
canals, straits, ports. When the day has passed, any wallet triggers a
resolution round: every validator fetches both evidence sources, the panel
agrees on the recorded readings line by line, and contract code (never a
model) turns them into the verdict. Chain markets into a parlay ticket whose
full payout is reserved on-chain the moment it is bought.

## The deployment of record

| | |
|---|---|
| Live app | [iso-bar.vercel.app](https://iso-bar.vercel.app) |
| Demo video | [youtu.be/qm7L5LDLtZE](https://youtu.be/qm7L5LDLtZE) (2:59) |
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
instead of reverting, because on this platform a revert strands the transaction's
value, so the walls receipt below became a fix).

## Why GenLayer is load-bearing

A forecast predicts the weather. A market has to settle what actually
happened, with money riding on the answer, and the usual tool for that is an
oracle: an operator reads a dataset and posts a number. Isobar has no
operator, because posting the number is not the hard part. Deciding whether
the number deserves to move money is.

Weather "truth" is plural. Two reputable datasets disagree at the margin,
stations go dark mid-window, archives return a null, a -999 fill value or
the wrong day, agencies revise readings. A price-feed oracle cannot
adjudicate that; a centralized backend must be trusted not to lean on it.
Here the money question is answered *inside consensus*:

- **Every validator fetches both sources itself.** Two independent public
  data sources (different organizations, different data lineages) whose URLs
  the contract builds from its catalog. No party supplies evidence, and a
  leader cannot record a page no other node saw.
- **Every validator audits the data itself.** An AI panel judges each
  payload (does it truly cover the date? any anomaly? trustworthy enough to
  settle on?), every "covered" judgment must quote the fetched bytes, and the
  panel is never told the threshold, the sides or the pools.
- **Validators agree on consequence.** The recorded readings, the coverage
  and sufficiency judgments, and the verdict pure code derives from them must
  all match, or nothing is recorded. The payout math reads only agreed,
  validated values.
- **Disagreement is an outcome, not a guess.** When the sources split,
  **nobody settles**: the market voids and every stake is refunded, in either
  direction. One appeal re-reads the recorded evidence, never a fresh fetch,
  before any money moves.

The same machinery goes where a numeric oracle cannot follow: v2's **event
markets**, settled from the official notices of port authorities, canal
authorities and coast guards (*was my port closed on 3 Oct?*). See the
[roadmap](#roadmap-v2).

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
- **The panel never touches money.** It judges data quality only (it is
  never told the threshold, the sides, or the pools), and each judgment
  needs a verbatim quote from the payload it judges. Insufficient data
  blocks *both* verdicts.
- **One appeal, against the record.** A wallet with money at stake may force
  one fresh round that re-reads the recorded snapshot with zero refetches, so
  the appellant argues against the same bytes the first panel saw. It can
  uphold or void; it cannot invent an outcome. Settlement never front-runs
  the window.
- **No fund traps.** Finalize and settle are permissionless; a market that
  can never reach a verdict voids on a timeout anyone can trigger; claims
  are pull-payment and idempotent; a refused payable write credits its value
  straight back to the sender's claimable balance.
- **The parlay reserves at purchase.** Tickets (2 to 4 legs, flat multipliers
  **labeled demo pricing on every surface**) reserve their full payout from
  a deployer-seeded on-chain reserve at buy time or are refused in words. A
  voided leg drops out of the multiplier; a ticket of voids refunds.

## Lifecycle

```
open ──(window date begins)── observing ──(sources cover: +2d fast / +5d global)── resolving
                                                                                      │
                       every validator fetches both sources; code derives             ▼
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

## Live, on chain: the disposable proving ground (16 Sep 2026)

The mechanism was proven same-day on a **disposable variant** of the real
contract with four printed patches (past dates allowed; stake, ticket and
resolve-lag gates opened, nothing else), so resolution could run against
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
(`0x24cd035aa6e4cbf7589b2be93ede586130f23ef0b2061cd88d0c903a2f569719`).
Consensus agreed the write failed, the ledger stayed intact, nothing was
lost. Transaction Kit 0.1.0-rc.2 prices from defaults and submits without
allocations, so the app wraps it: `claim` is priced by
`estimateTransactionFeesForWrite` and signed with the allocations it
measured, every other write goes through the kit unchanged
([`frontend/lib/kit.ts`](frontend/lib/kit.ts), tested in `frontend/tests/kit.test.ts`).

The deployment of record runs
the pristine rules on future-dated markets. Its book was seeded on 16 Sep
with a certain-YES control (Panama ≥ 5 °C), a certain-NO control (Rotterdam
wind ≥ 60 m/s) and open questions across the catalog, resolving on their
honest lags over the following days. Two more markets opened on 17 Sep keep
the book open through review: market #9 (Panama Canal wind, 24 Sep) and
market #10 (Port of Hamburg wind, 1 Oct), the ones the demo stakes on and
chains into a parlay.

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
620 KB day of observations included); and the transaction clock: the
standard-library `datetime.now` *is* the tx datetime on this runner, and
`gl.message_raw` is gone.

## Running it

Built on the [GenLayer project boilerplate (v2-dev)](https://github.com/genlayerlabs/genlayer-project-boilerplate/tree/v2-dev):
same layout (`contracts/`, `tests/direct`, `tests/integration`, `frontend/`, `deploy/`),
same toolchain pins, same CI jobs.

### Try it in the app

1. **Connect a wallet.** Open [iso-bar.vercel.app](https://iso-bar.vercel.app) and click Connect
   wallet; approve the network request in MetaMask. The app keeps you connected after a refresh.
2. **Get test GEN.** On any market that is open for positions, click Get 10 test GEN.
3. **Open a market.** Markets → Open a market: a location, a metric, a threshold and a date
   within the next three weeks. The new market opens for positions right away.
4. **Take a position.** Pick Yes or No, enter a small stake, review the fee quote and sign;
   the position appears in the pool once the transaction finalizes.
5. **Build a parlay.** Pick a side on two to four open markets and buy; the full payout is
   reserved on chain at purchase (flat demo pricing, labeled).
6. **Check your positions.** My positions lists every market and ticket the wallet holds.
7. **See how verdicts are reached.** How it works, plus the proving-ground table above for
   resolved markets: a Yes with an upheld appeal, and a void when the sources disagreed.

### Requirements

- Python >= 3.12, Node 22
- [GenLayer CLI](https://github.com/genlayerlabs/genlayer-cli): `npm install -g genlayer`
- Nothing else for the app: the deployment of record and Studio Next are compiled in

### Quick start

```shell
# 1. Python toolchain (genlayer-py, genlayer-test, genvm-linter: the boilerplate pins)
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
(network and contract address; the wallet, genlayer-js and Transaction Kit share one network config).

### Testing strategy

| layer | command | what it proves | count |
|---|---|---|---|
| **Lint** | `genvm-lint check contracts/isobar.py` | SDK validation passes (23 methods); lint clean apart from one documented finding (below) | n/a |
| **Direct, stub harness** | `pytest tests/direct/` | lifecycle, consensus refusals (forged snapshots, self-digests, empty excerpts, split readings), appeal, parlay, walls, wei conservation with dust; every validator runs on every call | 55 |
| **Direct, official runner** | `pytest tests/direct/test_sdk_runner.py` | the same mechanism on the real SDK (`direct_vm`): YES round, validator agree / disagree, forged leader refused, void refunds, retry, payable refusal credited, claim, checksummed-signer keys | 8 |
| **Mutation sweep** | `python tests/mutation/mutate.py` | every safety floor broken in place is caught; restore-control passes | 14/14 killed |
| **Frontend** | `npm test` | acts availability at every boundary, vocabulary, read budget, refusal decoding, kit wiring + payout allocations, network config, pinned releases, checksummed accounts, transaction panel finality, deploy script, wallet session restore, faucet, read concurrency | 73 |
| **Integration** | `gltest tests/integration/ --network studio_devnet` | on Studio Next: deploy, catalog, market + stake, refusal walls, refused payable credited back, real-GEN claim with message allocations | 4 |
| **Live proofs** | `node frontend/scripts/live-record.mjs` | the tables above, on the deployment of record and the disposable | scripted assertions |

**Fee profile: measured, and deliberately not wired.** `npm run test:fees` measures a
gltest profile on Studio Next (chainId 61997). Priced exactly the way Transaction Kit applies
a developer profile, those allocations **failed live**: `create_market` and `stake` both
finalized with the leader refusing `out_of receipt message`
(`0x9b949022823d452d3a22a402b6bd04ab5b36481cf4b8642a8688561c9297748b`,
`0xc2035db18df5a67e90df79018f226c4e436cc3e740e05a16181529dcfee2a53a`, on the disposable).
The measured budgets cover execution but underfund receipts. The app therefore passes a profile
that names chain 61997 with no method entries, so the kit sizes every write from live network
defaults, the path every in-app and scripted write on this deployment has used. `claim` is
additionally priced by simulation for its message allocations.

**The one lint finding.** `genvm-lint check` (v0.11-dev) reports E022 ("method must have
`self`") on the `@staticmethod` helper `_snapshot_agrees`. It is valid Python that already runs
inside live consensus rounds; changing it would change the byte-verified contract and require a
redeploy. CI allows exactly that finding and fails on any other.

## Honest limits

- Verdicts are **daily UTC thresholds**, not minute-level claims and not
  causation ("this storm delayed that ship" is a later milestone with a
  different evidence bar; see the v2 roadmap below).
- Reanalysis datasets genuinely disagree sometimes; the split rule **voids
  instead of guessing**, and single-source days never settle.
- Parlay multipliers are **flat demo pricing**, not market odds, labeled on
  every surface; the reserve is deployer-seeded protocol capital, disclosed,
  taking no third-party deposits.
- The appeal window is 60 minutes on this deployment: long enough to
  dispute, short enough to demo; it is a config constant, stated everywhere
  it matters.
- Test GEN on Studio Next. A working mechanism, not a licensed financial
  product.

## Roadmap: v2

v1 settles numbers. v2 leans into what only GenLayer can do: judge messy
real-world facts, not just thresholds. It is a new deployment, so contract
changes land together (including the one documented lint finding).

### The headline: event markets

A market can ask whether something **happened**, not only what a number
read:

> *Did the Port of Rotterdam suspend vessel traffic on 3 Oct?*
> *Did the Panama Canal Authority restrict transits this week?*

Validators read the official notices of port authorities, canal authorities
and coast guards from a catalog of sources, and must agree on what the
record says, under the same rules v1 enforces today: nobody supplies a URL,
evidence is corroborated where it enters the record, the panel's findings
are grounded in quotes from the fetched text, code derives the verdict, and
an appeal re-reads the record instead of refetching it. This is the question
logistics actually asks (*was my port closed?*), and no price-feed oracle
can answer it.

### Planned

| feature | what it changes | why |
|---|---|---|
| **Event markets** | Yes/No questions settled from official port, canal and coast-guard notices, consensus over the recorded notice text | The question shippers actually ask; the clearest case for decentralized judgment |
| **Pool-implied parlay pricing** | Each leg priced from its live Yes/No pools at purchase, with a margin and a cap; full payout still reserved on chain at purchase | Retires v1's flat demo multipliers, so the parlay becomes a real product |
| **Isobar Cover** | Parametric protection: a shipper pays a premium and is paid if the threshold is crossed on their date; underwriters commit capacity reserved per policy at sale | Hedging for real businesses on the same verdict engine; capacity is per policy, never one pooled pot |
| **Resolver rewards** | A small share of the pool pays the wallet that triggers a successful resolution or finalize; retries pay nothing | Markets settle on time with no backend and no keeper service |
| **Third source, 2-of-3 agreement** | METAR airport reports for ports near an airport, Open-Meteo Marine for wave height; two agreeing sources settle | Far fewer voids, and new metrics: wave height, visibility, multi-day windows |

### Also on the list

- **Base rates on every market:** how often the threshold was crossed at
  that station on recent days, computed in the browser from public
  archives, so positions are priced from evidence.
- **Appeal bonds and a longer window:** the appellant posts a bond that is
  refunded when the appeal changes the outcome; the window grows from v1's
  demo-sized 60 minutes to 24 hours.
- **Verdicts other contracts can read,** e.g. a shipping escrow whose
  force-majeure clause checks an Isobar verdict, making Isobar
  infrastructure rather than only an app.
- **Community-proposed locations:** anyone proposes a port; validators
  confirm the coordinates are a real port before it joins the catalog.

## The docs

[PROBE-REPORT](docs/PROBE-REPORT.md): measurements with receipts ·
[ARCHITECTURE](docs/ARCHITECTURE.md): how the pieces fit ·
[THREAT-MODEL](docs/THREAT-MODEL.md): who can cheat whom, and what stops them
