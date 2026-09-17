# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

```bash
# Python environment (Python >= 3.12)
pip install -r requirements.txt

# Linting (lint + SDK validation; see "Linting" for the one allowed finding)
genvm-lint check contracts/isobar.py

# Testing
pytest tests/direct/ -v                        # Direct mode: stub harness + official runner (fast, no network)
gltest tests/integration/ --network studio_devnet -v -s                # Integration on Studio Next (deploys a throwaway instance)
npm run test:fees                              # Same, measuring frontend/fee-profile.json (chainId 61997)

# Frontend (npm workspace)
npm ci                                         # from the repo root
npm run dev                                    # http://localhost:3132
npm run lint && npm test && npm run build      # typecheck, unit + component tests, production build

# Deployment
genlayer deploy                                # runs deploy/deployScript.ts
node frontend/scripts/deploy.mjs verify 0x…    # byte-for-byte check of the stored contract
node frontend/scripts/live-record.mjs status   # live proofs on the deployment of record
```

## Architecture

```
contracts/isobar.py      # the whole mechanism: markets, consensus, appeal, parlay, pull ledger
tests/
  direct/                # conftest.py stub harness (validators run on every call) + test_sdk_runner.py (official runner)
  integration/           # gltest suite against Studio Next
frontend/                # Next.js app ("the pressure room"); Vercel Root Directory: frontend
  lib/network.ts         # the one network config shared by wallet, genlayer-js and Transaction Kit
  lib/kit.ts             # Transaction Kit RC2 + simulated message allocations for payouts
  lib/read.ts            # budgeted, cached contract reads (Studio Next: 30 gen_call / rolling minute / IP)
  scripts/               # deploy, seed, live proofs (keys in .data/, gitignored)
deploy/deployScript.ts   # `genlayer deploy` entry point
docs/                    # PROBE-REPORT, ARCHITECTURE, THREAT-MODEL, DEMO-SCRIPT
```

**Network**: GenLayer Studio Next only: `https://studio-next.genlayer.com/api`, chain id 61997,
explorer `https://explorer-studio-dev.genlayer.com`.

**Deployment of record**: `frontend/lib/config.ts` (`DEPLOYMENT_OF_RECORD`). It is byte-verified
against `contracts/isobar.py`; ANY change to the contract file requires a redeploy, reseed and new
live proofs before the address in the app, README and scripts can move.

## Constraints that are not visible in the code

- **Runner pin**: the contract's `Depends` hash `5jycge4q…` is the runner Studio Next serves. The
  boilerplate's `9b8kjyda…` is rejected on deploy (`invalid_contract runner malformed`) and missing
  from the pinned linter's bundle. Do not "update" the header to it.
- **Clock**: `datetime.now(timezone.utc)` is the transaction datetime on this runner; `gl.message_raw`
  does not exist.
- **Payable refusals return, never raise**: on Studio Next a raise reverts a refund credit while the
  transaction's value is kept. Refused payables credit the value to the claim ledger and return
  `{"refused": true, "reason": …}`.
- **Payout fees**: a write that emits a transfer (`claim`) must carry the fee simulation's
  `messageAllocations`, or the leader refuses it while the tx still FINALIZES. Transaction Kit rc.2
  never sends them; `withTransferAllocations` in `frontend/lib/kit.ts` does.
- **Addresses**: the contract keys records by the checksummed signer and looks them up by exact
  string. Wallets report lowercase; `accountOf` in `frontend/lib/wallet.tsx` checksums. The faucet
  (`sim_fundAccount`, amount in atto) credits only checksummed addresses too.
- **Fee profile**: a gltest-measured profile (`npm run test:fees`) underfunds receipts on Studio
  Next: Kit-style writes priced from it finalized with `out_of receipt message`. Keep
  `frontend/fee-profile.json` at chainId 61997 with no method entries unless a new profile is
  proven by live writes first.
- **Line endings**: `.gitattributes` forces LF; a CRLF contract can never byte-verify.
- **"Confirmed"** in the UI only at FINALIZED + successful execution.

## Linting

`genvm-lint check` runs lint and SDK validation. Validation passes. Lint reports one finding, E022 on
the `@staticmethod` `_snapshot_agrees`, valid Python that runs in live consensus rounds; fixing it
changes contract bytes (redeploy). CI allows exactly that finding and fails on anything else.

## Writing tests

Direct mode has two instruments:

- `tests/direct/conftest.py`: a strict stub SDK. Every validator runs on every nondet call,
  leader and validators can be served different bytes, fetches are counted per role, the clock is
  set per test, public writes revert state on raise like the runtime. Use it for consensus attacks.
- `tests/direct/test_sdk_runner.py`: the official runner (`direct_vm`, `direct_deploy`), the real
  SDK. Validators run only via `direct_vm.run_validator()`; LLM mocks are double-JSON-encoded;
  pass checksummed addresses (`Address(addr).as_hex`) to views.

The stub fixture removes its fake `genlayer` modules after each test, so both run in one session.

## GenLayer references

| Resource | URL |
|----------|-----|
| SDK API (complete) | https://sdk.genlayer.com/main/_static/ai/api.txt |
| Full documentation | https://docs.genlayer.com/full-documentation.txt |
| GenLayerJS | https://docs.genlayer.com/api-references/genlayer-js |
| Boilerplate (v2-dev) | https://github.com/genlayerlabs/genlayer-project-boilerplate/tree/v2-dev |
