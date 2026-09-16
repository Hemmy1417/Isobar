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
| Contract | [`0x85328a61Dc0d7630BdFcd3dC536e1d159Ef527b5`](https://explorer-studio-dev.genlayer.com/address/0x85328a61Dc0d7630BdFcd3dC536e1d159Ef527b5) |
| Network | GenLayer Studio Next (chain 61997) |
| Deploy tx | `0x57416a605bfbf074252b0558d3eb92e6b13528fde2177456e1b7a957c3670f0e` |
| Source | [`contracts/isobar.py`](contracts/isobar.py), ruleset `isobar-rules-1` |
| Byte verification | `node web/scripts/deploy.mjs verify 0x85328a61…` → sha256 `9839aeec…dbd0e3`, byte-for-byte identical |
| Frontend stack | Next.js + **Transaction Kit 0.1.0-rc.2** (headless flow), genlayer-js 2.0.0-rc.1 |

Superseded during development (probe and diagnosis only, patches disclosed
below): `0x316BFc2d…70F1`, `0x0E9B0566…E90c` (throwaway fetch/clock probes),
`0x8E837328…cc11`, `0x2b57BDCB…E3a2`, `0xFF60C795…6CE2` (patched disposables
for same-day end-to-end runs).

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

The settlement tail (void refunds, ticket payout, real-GEN claims, the
double-claim wall) runs in the same suite once the disposable's appeal
windows close; its receipts join this table. The deployment of record runs
the pristine rules on future-dated markets — its book was seeded on 16 Sep
with a certain-YES control (Panama ≥ 5 °C), a certain-NO control (Rotterdam
wind ≥ 60 m/s) and open questions across the catalog, resolving on their
honest lags over the following days.

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

```
# contract tests: 55 direct, mocks as strict as the runtime
python -m pytest tests/direct -q

# every floor mutation-checked: 12/12 killed
python <scratch>/mutate.py

# web: typecheck, 24 unit tests, production build
cd web && npm ci && npx tsc --noEmit && npx vitest run && npx next build

# dev server against the deployment of record
cd web && npm run dev     # http://localhost:3132
```

## Tests

| suite | scope | count |
|---|---|---|
| `tests/direct` | lifecycle, consensus refusals (forged snapshots, self-digests, empty excerpts, split readings), appeal, parlay, walls, wei conservation with dust | 55 |
| mutation sweep | every floor broken in place, suite must fail, restore-control | 12/12 killed |
| `web/tests` | the acts availability function at every status × role × clock boundary; the vocabulary layer | 24 |
| disposable E2E | the table above, against live APIs on Studio Next | scripted assertions |

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
