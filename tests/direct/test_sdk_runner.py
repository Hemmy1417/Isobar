"""Isobar on the OFFICIAL direct-mode runner (genlayer-test's `direct_vm`,
the boilerplate's harness): the real GenLayer SDK pinned by the contract's
Depends header, not a stub.

The stub harness in conftest.py stays the stricter instrument — it runs every
validator on every call, serves different bytes to leader and validators, and
counts fetches per role. This suite proves the same mechanism holds on the
real SDK: calldata, storage, the transaction clock, payable value, the
`run_nondet` validator (replayed with `run_validator`), and the claim path.

Run: pytest tests/direct/test_sdk_runner.py -v
"""

import copy
import json

import pytest

GEN = 10**18
DATE = "2026-09-20"
OPEN = "2026-09-18T12:00:00Z"
RESOLVABLE = "2026-09-25T06:00:00Z"      # DATE + 1 + global-lane lag
WINDOW_CLOSED = "2026-09-25T07:01:00Z"   # 61 minutes after resolution


def hexaddr(addr):
    """The account as the contract records it: EIP-55, what str(sender) gives."""
    from genlayer.types import Address
    return Address(addr).as_hex


def om_body(value, date=DATE, missing=False):
    return json.dumps({"latitude": 9.35, "longitude": -79.9, "generationtime_ms": 0.12,
                       "daily_units": {"wind_speed_10m_max": "m/s"},
                       "daily": {"time": [date], "wind_speed_10m_max": [None if missing else value]}})


def power_body(value, date=DATE, missing=False):
    return json.dumps({"type": "Feature", "header": {"generated": "volatile"},
                       "properties": {"parameter": {"WS10M_MAX": {
                           date.replace("-", ""): -999.0 if missing else value}}}})


def panel(values, sufficient=True):
    """Double-encoded: the direct runner's LLM boundary is raw text."""
    answer = {"reasoning": "one plausible value each for the observation date",
              "sources": [{"source": s, "covered": v is not None,
                           "anomaly": "" if v is not None else "no value for the date",
                           "quote": json.dumps(v) if v is not None else ""}
                          for s, v in values.items()],
              "sufficient": sufficient}
    return json.dumps(json.dumps(answer))


def serve(vm, om, power, om_missing=False, power_missing=False):
    vm.clear_mocks()
    vm.mock_web(r".*open-meteo\.com.*", {"method": "GET", "status": 200, "body": om_body(om, missing=om_missing)})
    vm.mock_web(r".*power\.larc\.nasa\.gov.*", {"method": "GET", "status": 200,
                                                "body": power_body(power, missing=power_missing)})
    vm.mock_llm(r"(?s).*", panel({"open-meteo": None if om_missing else om,
                                  "nasa-power": None if power_missing else power}))


@pytest.fixture
def market(direct_vm, direct_deploy, direct_alice, direct_bob):
    """A global-lane Panama wind market (≥ 5 m/s) with 1 GEN on each side."""
    direct_vm.warp(OPEN)
    c = direct_deploy("contracts/isobar.py")
    direct_vm.sender = direct_alice
    mid = c.create_market(json.dumps({"location_id": "panama-colon", "metric": "WIND_MAX",
                                      "comparison": "GTE", "threshold_x100": 500,
                                      "window_date": DATE}))
    direct_vm.value = GEN
    assert json.loads(c.stake(mid, "YES"))["refused"] is False
    direct_vm.sender = direct_bob
    assert json.loads(c.stake(mid, "NO"))["refused"] is False
    direct_vm.value = 0
    return c, mid


def claimable(c, addr):
    return int(json.loads(c.get_balance(hexaddr(addr)))["claimable"])


def test_the_pinned_runner_is_the_real_sdk(direct_vm, direct_deploy):
    c = direct_deploy("contracts/isobar.py")
    cfg = json.loads(c.get_config())
    assert cfg["ruleset"] == "isobar-rules-2"
    import genlayer
    assert hasattr(genlayer, "vm") and hasattr(genlayer.vm, "run_nondet")


def test_yes_round_validators_agree_then_settle_and_claim(direct_vm, market, direct_alice, direct_bob):
    c, mid = market
    with direct_vm.expect_revert("resolves after its sources"):
        c.resolve(mid)

    serve(direct_vm, 6.0, 5.5)
    direct_vm.warp(RESOLVABLE)
    out = json.loads(c.resolve(mid))
    assert out["kind"] == "VERDICT" and out["verdict"] == "YES"

    # a validator fetching the same agency bytes agrees with the record
    assert direct_vm.run_validator() is True

    with direct_vm.expect_revert("appeal window is open"):
        c.finalize(mid)
    direct_vm.warp(WINDOW_CLOSED)
    c.finalize(mid)
    assert claimable(c, direct_alice) == 2 * GEN
    assert claimable(c, direct_bob) == 0

    direct_vm.sender = direct_alice
    assert json.loads(c.claim())["claimed_wei"] == str(2 * GEN)
    assert claimable(c, direct_alice) == 0
    with direct_vm.expect_revert("nothing claimable"):
        c.claim()


def test_a_validator_that_fetched_different_readings_refuses_the_record(direct_vm, market):
    c, mid = market
    serve(direct_vm, 6.0, 5.5)
    direct_vm.warp(RESOLVABLE)
    c.resolve(mid)
    serve(direct_vm, 3.0, 2.5)
    assert direct_vm.run_validator() is False


def test_a_forged_leader_snapshot_is_refused(direct_vm, market):
    c, mid = market
    serve(direct_vm, 6.0, 5.5)
    direct_vm.warp(RESOLVABLE)
    c.resolve(mid)
    stored = direct_vm._captured_validators[-1][0]
    forged = copy.deepcopy(stored)
    forged["snapshot"][0]["value_x100"] = 900   # a reading nobody fetched
    assert direct_vm.run_validator(leader_result=forged) is False
    assert direct_vm.run_validator(leader_result=stored) is True


def test_split_sources_void_the_market_and_refund_everyone(direct_vm, market, direct_alice, direct_bob):
    c, mid = market
    serve(direct_vm, 6.0, 3.0)
    direct_vm.warp(RESOLVABLE)
    assert json.loads(c.resolve(mid))["verdict"] == "VOID_CONFLICT"
    direct_vm.warp(WINDOW_CLOSED)
    c.finalize(mid)
    assert claimable(c, direct_alice) == GEN
    assert claimable(c, direct_bob) == GEN


def test_one_covered_source_retries_and_never_settles(direct_vm, market):
    c, mid = market
    serve(direct_vm, 6.0, 0, power_missing=True)
    direct_vm.warp(RESOLVABLE)
    out = json.loads(c.resolve(mid))
    assert out["kind"] == "RETRY"
    assert "no corroboration, no settlement" in out["reason"]
    m = json.loads(c.get_market(mid))
    assert m["verdict"] is None and m["rounds_count"] == 1


def test_a_refused_payable_returns_and_credits_the_value(direct_vm, market, direct_charlie):
    c, _ = market
    direct_vm.sender = direct_charlie
    direct_vm.value = GEN // 50
    out = json.loads(c.stake("mk-999999", "YES"))
    direct_vm.value = 0
    assert out["refused"] is True
    assert claimable(c, direct_charlie) == GEN // 50


def test_records_are_keyed_by_the_checksummed_signer(direct_vm, market, direct_alice):
    c, mid = market
    mine = hexaddr(direct_alice)
    assert json.loads(c.my_markets(mine)) == [mid]
    # the exact-string lookup is why the app checksums wallet addresses
    assert json.loads(c.my_markets(mine.lower())) == []
