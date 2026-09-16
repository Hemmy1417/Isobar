"""The market lifecycle end to end: create → stake → resolve → appeal
window → finalize → claim, with the clock controlled to the second."""

import json

from conftest import (ALICE, BOB, CARA, DATE, GEN, OWNER, STRANGER, as_,
                      claimable, create_market, err, module, c, open_and_stake,
                      pay, panel_ok, panel_says, params, resolve_ok, serve_global,
                      set_now, to_resolving, transfers)
import pytest


def test_create_market_records_the_signer_as_creator(module, c):
    mid = create_market(module, c, who=ALICE)
    m = json.loads(c.get_market(mid))
    assert m["creator"] == ALICE
    assert m["market_id"] == "mk-000001"
    assert m["state"] == "OPEN"
    assert m["lane"] == "GLOBAL"
    assert m["unit"] == "m/s"


def test_market_urls_are_built_in_code_from_the_catalog(module, c):
    mid = create_market(module, c)
    m = json.loads(c.get_market(mid))
    urls = {s["source"]: s["url"] for s in m["sources"]}
    assert "archive-api.open-meteo.com" in urls["open-meteo"]
    assert "power.larc.nasa.gov" in urls["nasa-power"]
    assert "9.35" in urls["open-meteo"] and DATE in urls["open-meteo"]
    # two registrable domains — independence is structural, not declared
    assert len({u.split("/")[2].split(".", 1)[1] for u in urls.values()}) == 2


def test_fast_lane_market_reads_the_station_and_om(module, c):
    mid = create_market(module, c, location="newark")
    m = json.loads(c.get_market(mid))
    urls = {s["source"]: s["url"] for s in m["sources"]}
    assert "api.weather.gov/stations/KEWR" in urls["nws"]
    assert m["lane"] == "FAST"


def test_creation_refuses_off_catalog_and_past_dates(module, c):
    as_(module, ALICE)
    with pytest.raises(err(module), match="unknown location"):
        c.create_market(params(location="atlantis"))
    with pytest.raises(err(module), match="unknown metric"):
        c.create_market(params(metric="VIBES"))
    with pytest.raises(err(module), match="GTE or LT"):
        c.create_market(params(comparison="NEAR"))
    with pytest.raises(err(module), match="positive integer"):
        c.create_market(params(threshold_x100=-5))
    set_now("2026-09-21T00:00:00Z")
    with pytest.raises(err(module), match="must lie in the future"):
        c.create_market(params(date=DATE))


def test_stakes_pool_by_side_and_close_at_window_start(module, c):
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: 2 * GEN})
    m = json.loads(c.get_market(mid))
    assert m["yes_pool_wei"] == str(GEN)
    assert m["no_pool_wei"] == str(2 * GEN)
    assert json.loads(c.get_position(mid, ALICE)) == {"yes": GEN, "no": 0}
    set_now(f"{DATE}T00:00:00Z")  # the boundary second: observation begins
    pay(module, CARA, GEN)
    out = json.loads(c.stake(mid, "YES"))
    # a payable refusal RETURNS (a raise would revert the refund credit
    # while the platform keeps the value): reason carried, value claimable
    assert out["refused"] is True and "positions close" in out["reason"]
    assert claimable(c, CARA) == GEN


def test_resolution_yes_pays_winners_pro_rata_after_the_window(module, c):
    mid = open_and_stake(module, c, yes={ALICE: GEN, CARA: GEN}, no={BOB: 2 * GEN})
    out = resolve_ok(module, c, mid, om_value=6.0, power_value=5.5)
    assert out == {"round": 1, "kind": "VERDICT", "verdict": "YES", "reason": None}
    m = json.loads(c.get_market(mid))
    assert m["state"] == "RESOLVED" and m["verdict"] == "YES"
    # settlement cannot front-run the appeal window
    with pytest.raises(err(module), match="appeal window is open"):
        c.finalize(mid)
    set_now("2026-09-25T07:01:00Z")  # 61 minutes after the 06:00 resolution
    c.finalize(mid)
    m = json.loads(c.get_market(mid))
    assert m["state"] == "FINAL"
    # 2 GEN losing pool splits between two equal YES stakes + stakes back
    assert claimable(c, ALICE) == 2 * GEN
    assert claimable(c, CARA) == 2 * GEN
    assert claimable(c, BOB) == 0


def test_resolution_no_mirrors_yes_with_the_same_derivation(module, c):
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    out = resolve_ok(module, c, mid, om_value=3.0, power_value=2.5)
    assert out["verdict"] == "NO"
    set_now("2026-09-25T07:01:00Z")
    c.finalize(mid)
    assert claimable(c, BOB) == 2 * GEN
    assert claimable(c, ALICE) == 0


def test_conflicting_sources_void_the_market_in_both_directions(module, c):
    # split favouring YES on the primary
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    out = resolve_ok(module, c, mid, om_value=6.0, power_value=3.0)
    assert out["verdict"] == "VOID_CONFLICT"
    set_now("2026-09-25T07:01:00Z")
    c.finalize(mid)
    assert claimable(c, ALICE) == GEN and claimable(c, BOB) == GEN
    # the mirror: split favouring NO on the primary derives identically
    set_now("2026-09-18T12:00:00Z")
    mid2 = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN},
                          date="2026-09-21")
    serve_global(module, c, mid2, om_value=3.0, power_value=6.0)
    set_now("2026-09-26T06:00:00Z")
    panel_says(panel_ok({"open-meteo": 3.0, "nasa-power": 6.0}))
    as_(module, ALICE)
    out2 = json.loads(c.resolve(mid2))
    assert out2["verdict"] == "VOID_CONFLICT"


def test_single_covered_source_retries_and_never_settles(module, c):
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    serve_global(module, c, mid, om_value=6.0, power_missing=True)
    to_resolving(DATE)
    panel_says(panel_ok({"open-meteo": 6.0, "nasa-power": None}))
    as_(module, ALICE)
    out = json.loads(c.resolve(mid))
    assert out["kind"] == "RETRY"
    assert "no corroboration, no settlement" in out["reason"]
    m = json.loads(c.get_market(mid))
    assert m["state"] == "OPEN" and m["verdict"] is None  # still resolvable
    assert m["rounds_count"] == 1


def test_insufficient_gates_every_conclusive_verdict(module, c):
    # sufficient=false blocks a would-be YES …
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    serve_global(module, c, mid, om_value=6.0, power_value=5.5)
    to_resolving(DATE)
    panel_says(panel_ok({"open-meteo": 6.0, "nasa-power": 5.5}, sufficient=False))
    as_(module, ALICE)
    out = json.loads(c.resolve(mid))
    assert out["kind"] == "RETRY" and "insufficient" in out["reason"]
    # … and the mirror: it blocks a would-be NO identically
    set_now("2026-09-18T12:00:00Z")
    mid2 = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN},
                          date="2026-09-21")
    serve_global(module, c, mid2, om_value=2.0, power_value=2.1)
    set_now("2026-09-26T06:00:00Z")
    panel_says(panel_ok({"open-meteo": 2.0, "nasa-power": 2.1}, sufficient=False))
    as_(module, BOB)
    out2 = json.loads(c.resolve(mid2))
    assert out2["kind"] == "RETRY"


def test_resolve_refuses_before_the_lag_and_after_a_verdict(module, c):
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    set_now(f"{DATE}T12:00:00Z")  # observing, sources cannot cover yet
    as_(module, ALICE)
    with pytest.raises(err(module), match="resolves after its sources"):
        c.resolve(mid)
    out = resolve_ok(module, c, mid, om_value=6.0, power_value=5.5)
    assert out["verdict"] == "YES"
    with pytest.raises(err(module), match="re-judgment is an appeal"):
        c.resolve(mid)


def test_claim_zeroes_then_transfers_and_is_idempotent(module, c):
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    resolve_ok(module, c, mid, om_value=6.0, power_value=5.5)
    set_now("2026-09-25T07:01:00Z")
    c.finalize(mid)
    as_(module, ALICE)
    out = json.loads(c.claim())
    assert out["claimed_wei"] == str(2 * GEN)
    assert transfers() == [{"to": ALICE, "wei": 2 * GEN}]
    with pytest.raises(err(module), match="nothing claimable"):
        c.claim()
    assert json.loads(c.get_balance(ALICE))["claimed"] == 2 * GEN


def test_empty_winning_pool_refunds_everyone(module, c):
    mid = open_and_stake(module, c, no={BOB: GEN})  # nobody on YES
    out = resolve_ok(module, c, mid, om_value=6.0, power_value=5.5)
    assert out["verdict"] == "YES"
    set_now("2026-09-25T07:01:00Z")
    c.finalize(mid)
    assert claimable(c, BOB) == GEN  # stake home, not burned


def test_void_timeout_is_the_permissionless_escape(module, c):
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    as_(module, STRANGER)
    with pytest.raises(err(module), match="timeout has not elapsed"):
        c.void_timeout(mid)
    set_now("2026-10-10T06:00:01Z")  # resolve_after 25th + 14 days < now
    as_(module, STRANGER)  # anyone: liveness needs no standing
    out = json.loads(c.void_timeout(mid))
    assert out["state"] == "VOID"
    assert claimable(c, ALICE) == GEN and claimable(c, BOB) == GEN


def test_wei_conservation_across_a_full_market(module, c):
    stakes = {ALICE: 3 * GEN, CARA: GEN}
    mid = open_and_stake(module, c, yes=stakes, no={BOB: 2 * GEN})
    resolve_ok(module, c, mid, om_value=6.0, power_value=5.5)
    set_now("2026-09-25T07:01:00Z")
    c.finalize(mid)
    total_in = 6 * GEN
    total_out = sum(claimable(c, a) for a in (ALICE, BOB, CARA))
    assert total_out == total_in  # every wei accounted, dust included
