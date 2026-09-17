"""Integration tests on GenLayer Studio Next — real consensus, real fees.

Each run deploys a THROWAWAY Isobar instance (the deployment of record is
never touched) and walks the calendar-free path: catalog, market creation,
a stake, the refusal walls, a refused payable credited back, and a real-GEN
claim whose fees carry the simulation's message allocations.

Resolution needs the real weather calendar (days of source lag) and is
proven on the deployment of record instead: `node frontend/scripts/live-record.mjs`.

Run:           gltest tests/integration --network studio_devnet -v -s
Fee profile:   npm run test:fees   (writes frontend/fee-profile.json, chainId 61997)
Needs:         ISOBAR_TEST_PRIVATE_KEY in .env — a funded Studio Next key.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest
from gltest import get_contract_factory, get_default_account
from gltest.assertions import tx_execution_failed, tx_execution_succeeded
from gltest.clients import get_gl_client

pytestmark = pytest.mark.integration

GEN = 10**18
FEE_FLOOR = 10**15


def plain_fees():
    estimate = get_gl_client().estimate_transaction_fees({})
    return {"distribution": estimate["distribution"],
            "feeValue": max(int(estimate["feeValue"]), FEE_FLOOR)}


def transfer_fees(contract, method, args):
    """A write that emits a value transfer must carry the message allocations
    the fee SIMULATION measured, or the leader refuses it
    ('fee no_matching_allocation # external') while the tx still finalizes."""
    estimate = get_gl_client().estimate_transaction_fees_for_write(
        address=contract.address, function_name=method, args=args, value=0,
        account=get_default_account())
    fees = {"distribution": estimate["distribution"],
            "feeValue": max(int(estimate["feeValue"]), FEE_FLOOR)}
    allocations = estimate.get("messageAllocations") or estimate.get("message_allocations")
    assert allocations, "the claim simulation must measure a transfer allocation"
    fees["messageAllocations"] = allocations
    return fees


def wait_until():
    return "finalized"


@pytest.fixture(scope="module")
def isobar():
    factory = get_contract_factory("Isobar")
    return factory.deploy(args=[], fees=plain_fees(), wait_until=wait_until())


def future_date(days=3):
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%d")


def test_deployment_serves_the_rules_and_catalog(isobar):
    config = json.loads(isobar.get_config(args=[]).call())
    assert config["ruleset"] == "isobar-rules-2"
    assert len(config["locations"]) == 16
    assert config["owner"].lower() == get_default_account().address.lower()


def test_create_market_and_stake(isobar):
    params = {"location_id": "panama-colon", "metric": "WIND_MAX", "comparison": "GTE",
              "threshold_x100": 500, "window_date": future_date()}
    created = isobar.create_market(args=[json.dumps(params)]).transact(
        fees=plain_fees(), wait_until=wait_until())
    assert tx_execution_succeeded(created)

    ids = json.loads(isobar.list_markets(args=[0, 50]).call())
    mid = ids[-1]
    staked = isobar.stake(args=[mid, "YES"]).transact(
        value=GEN // 100, fees=plain_fees(), wait_until=wait_until())
    assert tx_execution_succeeded(staked)

    market = json.loads(isobar.get_market(args=[mid]).call())
    assert market["yes_pool_wei"] == str(GEN // 100)
    assert market["phase"] == "OPEN"


def test_walls_refuse_in_the_contracts_own_words(isobar):
    ids = json.loads(isobar.list_markets(args=[0, 50]).call())
    early = isobar.resolve(args=[ids[-1]]).transact(fees=plain_fees(), wait_until=wait_until())
    assert tx_execution_failed(early)
    premature = isobar.appeal(args=[ids[-1], "premature"]).transact(fees=plain_fees(), wait_until=wait_until())
    assert tx_execution_failed(premature)


def test_refused_payable_is_credited_back_and_claimed_for_real(isobar):
    me = get_default_account().address
    before = int(json.loads(isobar.get_balance(args=[me]).call())["claimable"])

    refused = isobar.stake(args=["mk-999999", "YES"]).transact(
        value=GEN // 50, fees=plain_fees(), wait_until=wait_until())
    assert tx_execution_succeeded(refused)   # returns {"refused": true}; never raises
    credited = int(json.loads(isobar.get_balance(args=[me]).call())["claimable"]) - before
    assert credited == GEN // 50

    claim = isobar.claim(args=[]).transact(
        fees=transfer_fees(isobar, "claim", []), wait_until=wait_until())
    assert tx_execution_succeeded(claim)
    assert int(json.loads(isobar.get_balance(args=[me]).call())["claimable"]) == 0
