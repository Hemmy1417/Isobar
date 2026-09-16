"""The parlay: exposure reserved at purchase, demo multipliers capped and
labeled, void legs dropping out, and the reserve conserved to the wei."""

import json

from conftest import (ALICE, BOB, CARA, DATE, GEN, OWNER, STRANGER, as_, buy, c,
                      claimable, err, module, open_and_stake, panel_ok,
                      panel_says, pay, resolve_ok, serve_global, set_now)
import pytest


def _two_markets(module, c):
    m1 = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    m2 = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN},
                        date="2026-09-21")
    return m1, m2


def _seed(module, c, wei=20 * GEN):
    pay(module, OWNER, wei)
    c.seed_reserve()


def _legs(*pairs):
    return json.dumps([{"market_id": m, "side": s} for m, s in pairs])


def test_only_the_deployer_seeds_the_reserve(module, c):
    pay(module, STRANGER, GEN)
    out = json.loads(c.seed_reserve())
    assert out["refused"] is True and "only the deployer" in out["reason"]
    assert claimable(c, STRANGER) == GEN  # refused value is claimable back
    assert json.loads(c.get_stats())["reserve_wei"] == "0"


def test_ticket_reserves_full_exposure_at_purchase(module, c):
    m1, m2 = _two_markets(module, c)
    _seed(module, c)
    pay(module, CARA, GEN)
    tid = buy(c, _legs((m1, "YES"), (m2, "NO")))
    t = json.loads(c.get_ticket(tid))
    assert t["multiplier_x100"] == 324           # 1.8 × 1.8
    assert t["payout_wei"] == str(GEN * 324 // 100)
    assert t["pricing"] == "DEMO_FLAT"           # labeled, never market odds
    stats = json.loads(c.get_stats())
    assert stats["reserved_exposure_wei"] == t["payout_wei"]
    assert stats["reserve_wei"] == str(21 * GEN)  # stake joins the reserve


def test_ticket_without_reserve_headroom_is_refused(module, c):
    m1, m2 = _two_markets(module, c)
    _seed(module, c, wei=1 * GEN)  # far below a 3.24 GEN exposure
    pay(module, CARA, GEN)
    assert "reserve cannot cover" in buy(c, _legs((m1, "YES"), (m2, "NO")), expect_ok=False)
    assert claimable(c, CARA) == GEN


def test_ticket_walls(module, c):
    m1, m2 = _two_markets(module, c)
    _seed(module, c)
    pay(module, CARA, GEN)
    assert "2 to 4 legs" in buy(c, _legs((m1, "YES")), expect_ok=False)
    pay(module, CARA, GEN)
    assert "appears in this ticket twice" in buy(c, _legs((m1, "YES"), (m1, "NO")), expect_ok=False)
    pay(module, CARA, GEN)
    assert "unknown market" in buy(c, _legs((m1, "YES"), ("mk-999999", "NO")), expect_ok=False)
    set_now(f"{DATE}T00:00:00Z")
    pay(module, CARA, GEN)
    assert "still be open" in buy(c, _legs((m1, "YES"), (m2, "NO")), expect_ok=False)
    # every refused stake is claimable back, none kept
    assert claimable(c, CARA) == 4 * GEN


def test_winning_ticket_pays_stake_times_multiplier(module, c):
    m1, m2 = _two_markets(module, c)
    _seed(module, c)
    pay(module, CARA, GEN)
    tid = buy(c, _legs((m1, "YES"), (m2, "NO")))
    resolve_ok(module, c, m1, om_value=6.0, power_value=5.5)   # YES
    serve_global(module, c, m2, om_value=2.0, power_value=2.2)  # NO
    set_now("2026-09-26T06:00:00Z")
    panel_says(panel_ok({"open-meteo": 2.0, "nasa-power": 2.2}))
    as_(module, ALICE)
    c.resolve(m2)
    set_now("2026-09-26T08:00:00Z")  # both windows passed
    c.finalize(m1)
    c.finalize(m2)
    as_(module, STRANGER)  # settlement is permissionless
    out = json.loads(c.settle_ticket(tid))
    assert out["state"] == "WON"
    assert out["payout_wei"] == str(GEN * 324 // 100)
    assert claimable(c, CARA) == GEN * 324 // 100
    stats = json.loads(c.get_stats())
    assert stats["reserved_exposure_wei"] == "0"
    # reserve: 20 + 1 stake − 3.24 payout
    assert stats["reserve_wei"] == str(21 * GEN - GEN * 324 // 100)


def test_lost_leg_loses_the_ticket_and_the_stake_stays_in_reserve(module, c):
    m1, m2 = _two_markets(module, c)
    _seed(module, c)
    pay(module, CARA, GEN)
    tid = buy(c, _legs((m1, "YES"), (m2, "YES")))
    resolve_ok(module, c, m1, om_value=6.0, power_value=5.5)   # YES: hits
    serve_global(module, c, m2, om_value=2.0, power_value=2.2)  # NO: misses
    set_now("2026-09-26T06:00:00Z")
    panel_says(panel_ok({"open-meteo": 2.0, "nasa-power": 2.2}))
    as_(module, ALICE)
    c.resolve(m2)
    set_now("2026-09-26T08:00:00Z")
    c.finalize(m1)
    c.finalize(m2)
    out = json.loads(c.settle_ticket(tid))
    assert out["state"] == "LOST" and out["payout_wei"] == "0"
    assert claimable(c, CARA) == 0
    stats = json.loads(c.get_stats())
    assert stats["reserve_wei"] == str(21 * GEN)   # stake absorbed, disclosed
    assert stats["reserved_exposure_wei"] == "0"   # exposure released


def test_void_leg_drops_out_of_the_multiplier(module, c):
    m1, m2 = _two_markets(module, c)
    _seed(module, c)
    pay(module, CARA, GEN)
    tid = buy(c, _legs((m1, "YES"), (m2, "YES")))
    resolve_ok(module, c, m1, om_value=6.0, power_value=5.5)      # YES
    serve_global(module, c, m2, om_value=6.0, power_value=2.0)     # conflict
    set_now("2026-09-26T06:00:00Z")
    panel_says(panel_ok({"open-meteo": 6.0, "nasa-power": 2.0}))
    as_(module, ALICE)
    c.resolve(m2)                                                  # VOID
    set_now("2026-09-26T08:00:00Z")
    c.finalize(m1)
    c.finalize(m2)
    out = json.loads(c.settle_ticket(tid))
    assert out["state"] == "WON"
    assert out["payout_wei"] == str(GEN * 180 // 100)  # one live leg
    t = json.loads(c.get_ticket(tid))
    assert t["settled_multiplier_x100"] == 180
    legs = {l["market_id"]: l["outcome"] for l in t["legs"]}
    assert legs[m2] == "VOID"


def test_all_legs_void_refunds_the_stake(module, c):
    m1, m2 = _two_markets(module, c)
    _seed(module, c)
    pay(module, CARA, GEN)
    tid = buy(c, _legs((m1, "YES"), (m2, "YES")))
    for mid, when in ((m1, "2026-09-25T06:00:00Z"), (m2, "2026-09-26T06:00:00Z")):
        serve_global(module, c, mid, om_value=6.0, power_value=2.0)
        set_now(when)
        panel_says(panel_ok({"open-meteo": 6.0, "nasa-power": 2.0}))
        as_(module, ALICE)
        c.resolve(mid)
    set_now("2026-09-26T08:00:00Z")
    c.finalize(m1)
    c.finalize(m2)
    out = json.loads(c.settle_ticket(tid))
    assert out["state"] == "REFUNDED"
    assert claimable(c, CARA) == GEN


def test_settlement_waits_for_every_leg_and_never_repeats(module, c):
    m1, m2 = _two_markets(module, c)
    _seed(module, c)
    pay(module, CARA, GEN)
    tid = buy(c, _legs((m1, "YES"), (m2, "NO")))
    resolve_ok(module, c, m1, om_value=6.0, power_value=5.5)
    set_now("2026-09-25T07:01:00Z")
    c.finalize(m1)
    with pytest.raises(err(module), match="not final yet"):
        c.settle_ticket(tid)
    serve_global(module, c, m2, om_value=2.0, power_value=2.2)
    set_now("2026-09-26T06:00:00Z")
    panel_says(panel_ok({"open-meteo": 2.0, "nasa-power": 2.2}))
    as_(module, ALICE)
    c.resolve(m2)
    set_now("2026-09-26T08:00:00Z")
    c.finalize(m2)
    c.settle_ticket(tid)
    with pytest.raises(err(module), match="already WON"):
        c.settle_ticket(tid)


def test_owner_withdraws_only_unreserved_capital(module, c):
    m1, m2 = _two_markets(module, c)
    _seed(module, c, wei=5 * GEN)
    pay(module, CARA, GEN)
    buy(c, _legs((m1, "YES"), (m2, "NO")))  # exposure 3.24 GEN
    as_(module, STRANGER)
    with pytest.raises(err(module), match="only the deployer"):
        c.withdraw_reserve(str(GEN))
    as_(module, OWNER)
    with pytest.raises(err(module), match="exceeds the unreserved"):
        c.withdraw_reserve(str(4 * GEN))  # 6 − 3.24 = 2.76 available
    c.withdraw_reserve(str(2 * GEN))
    assert claimable(c, OWNER) == 2 * GEN


def test_reserve_conservation_across_win_and_loss(module, c):
    """Wei in == wei out across the whole parlay book."""
    m1, m2 = _two_markets(module, c)
    _seed(module, c)
    for who, sides in ((CARA, ("YES", "NO")), (STRANGER, ("YES", "YES"))):
        pay(module, who, GEN)
        buy(c, _legs((m1, sides[0]), (m2, sides[1])))
    resolve_ok(module, c, m1, om_value=6.0, power_value=5.5)   # YES
    serve_global(module, c, m2, om_value=2.0, power_value=2.2)  # NO
    set_now("2026-09-26T06:00:00Z")
    panel_says(panel_ok({"open-meteo": 2.0, "nasa-power": 2.2}))
    as_(module, ALICE)
    c.resolve(m2)
    set_now("2026-09-26T08:00:00Z")
    c.finalize(m1)
    c.finalize(m2)
    c.settle_ticket("tk-000001")   # CARA: YES,NO → both hit → 3.24
    c.settle_ticket("tk-000002")   # STRANGER: YES,YES → m2 missed → lost
    stats = json.loads(c.get_stats())
    reserve = int(stats["reserve_wei"])
    # 20 seed + 2 stakes in − 3.24 out
    assert reserve == 22 * GEN - GEN * 324 // 100
    assert stats["reserved_exposure_wei"] == "0"
    assert claimable(c, CARA) == GEN * 324 // 100
    assert claimable(c, STRANGER) == 0
