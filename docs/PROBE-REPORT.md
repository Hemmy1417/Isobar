# Probe report

Measurements against the systems Isobar depends on, run before the code
that depends on them was frozen. Every claim carries its receipt: an
explorer transaction (`https://explorer-studio-dev.genlayer.com/tx/<hash>`)
or a saved HTTP response.

## Source latency, from the browser (16 Sep 2026)

Direct requests to the three evidence APIs, asking for recent days:

| source | asked | answered | conclusion |
|---|---|---|---|
| Open-Meteo archive (ERA5T) | 8 to 15 Sep | values through **15 Sep** (yesterday) | ~1-day lag |
| NASA POWER (GEOS-IT for these dates) | 1 to 15 Sep | values through **13 Sep**, `-999.0` for 14/15 | ~3-day lag, `-999` fill |
| NWS station obs (KEWR) | latest | observations minutes old, `windSpeed` in km/h | real-time; convert units in code |

These numbers set the contract's lanes: `resolve_after = window date + 1 +
lag` with lag 1 (fast lane) / 4 (global lane), and the `-999` fill parses
as *not covered*, never as a reading.

*Added 17 Sep, after an audit:* POWER's response header for these dates
reads `"sources": ["GEOSIT", "POWER"]` and `"time_standard": "LST"`. The
contract's URL does not request `time-standard=UTC`, so POWER's daily values
cover the local solar day, not the UTC day a market names (Colón, 10 Sep:
3.71 m/s local solar vs 3.90 m/s UTC; 11 Sep: 3.84 both ways). See the
README's honest limits.

## The runner (16 Sep 2026)

The project boilerplate (`v2-dev`) pins runner `py-genlayer:9b8kjyda…`.
Studio Next rejects it:

- deploy tx `0xbbceccce77128924c32d55a14928cbb0b0ad3c206947e4f9e84bd1bdd1b0be4d`:
  FINALIZED, leader ERROR, decoded result `invalid_contract runner malformed`.

The runner two sibling deployments already run on works:

- `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`
- probe deploy tx `0x2c8dc4c93f61db05d002612abcc805bd03fd0deecf5813e671e8af6ba18d4efd`:
  FINALIZED, MAJORITY_AGREE, SUCCESS.

Isobar pins the working runner.

## On-chain fetch and clock (16 Sep 2026)

A throwaway probe contract ([weather_probe.py](../frontend/scripts/probe/weather_probe.py),
deployed at `0x0E9B0566ed4419f1F9B2121c86A763a6D8b9E90c`) fetched all three
APIs inside a consensus round and reported on the clock. Probe tx
`0x93e4b777f01128dbed91e10b8bc62ec15ba9ecc476ff4409f44a283d29b3175e`,
FINALIZED, MAJORITY_AGREE:

- `archive-api.open-meteo.com`: fetched, 289 chars, parses as JSON with
  the expected `daily` keys.
- `power.larc.nasa.gov`: fetched, 505 chars, parses with `properties`.
- `api.weather.gov`: fetched, **620,740 chars** (a full day of station
  observations), parses with `features`. Large but handled.
- `gl.message_raw` does **not** exist on this runner
  (`AttributeError`); the tx-datetime idiom from an older runner is gone.
- `datetime.now(timezone.utc)` returned `2026-09-16T17:07:21Z` inside the
  round, and the write reached MAJORITY_AGREE: the standard-library clock
  is the transaction datetime, identical across validators. The contract's
  `_now()` uses exactly this.

## Disposable end-to-end (16 Sep 2026)

A variant of the real contract with two printed patches (past window dates
allowed; the stake gate opened) deployed at
`0x8E837328FE3d1f305d1FB1275e8aC8F40520cc11` (deploy tx `0xf23121a8…36ba1`),
so resolution could run same-day against the real recorded weather of
**11 Sep 2026 at Colón** (Open-Meteo 5.22 m/s, NASA POWER 3.84 m/s), a
genuine inter-reanalysis disagreement the scenario matrix exploits:

| market | threshold (GTE) | expected | why |
|---|---|---|---|
| A | 3.00 m/s | YES | both sources over |
| B | 5.00 m/s | VOID_CONFLICT | 5.22 over, 3.84 under: a split never settles |
| C | (window 15 Sep) | RETRY | POWER still `-999`: no corroboration, no settlement |
| D | 8.00 m/s | NO | both sources under: the negative control |
| ticket | A:YES + D:NO | WON 3.24× | exposure reserved at purchase, released at settlement |

Plus, sent for real: a second resolve (refused: *a re-judgment is an
appeal*), an early finalize (refused: *appeal window is open*), the losing
side's appeal re-reading the recorded snapshot (upheld), a second appeal
(refused), claims moving real GEN, and a double claim (refused).

Results: **appended when the background run completes**; the run log is
the source of every row above becoming an assertion receipt.

The deployment of record carries none of the patches; its own live proofs
run on future-dated markets under the pristine rules.
