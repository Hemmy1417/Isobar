"""Walls and invariants: caps enforced in words, no state resurrects, no
double effects, and the round ceiling ends in the void path — every
non-terminal state has an exit somebody can actually call."""

import json

from conftest import (ALICE, BOB, CARA, DATE, GEN, OWNER, STRANGER, as_, c,
                      claimable, err, module, open_and_stake, panel_ok,
                      panel_says, pay, resolve_ok, serve_global, set_now)
import pytest


def test_stake_walls_speak_and_return_the_money(module, c):
    mid = open_and_stake(module, c)
    pay(module, ALICE, GEN)
    with pytest.raises(err(module), match="side must be YES or NO"):
        c.stake(mid, "MAYBE")
    pay(module, ALICE, 10**15)
    with pytest.raises(err(module), match="below the minimum"):
        c.stake(mid, "YES")
    pay(module, ALICE, 11 * GEN)
    with pytest.raises(err(module), match="per-market cap"):
        c.stake(mid, "YES")
    assert claimable(c, ALICE) == GEN + 10**15 + 11 * GEN


def test_unknown_market_speaks(module, c):
    as_(module, ALICE)
    with pytest.raises(err(module), match="unknown market"):
        c.stake("mk-424242", "YES")
    with pytest.raises(err(module), match="unknown market"):
        c.resolve("mk-424242")
    with pytest.raises(err(module), match="unknown ticket"):
        c.settle_ticket("tk-424242")


def test_two_stakes_from_one_wallet_are_additive_not_replacing(module, c):
    mid = open_and_stake(module, c)
    for _ in range(2):
        pay(module, ALICE, GEN)
        c.stake(mid, "YES")
    pos = json.loads(c.get_position(mid, ALICE))
    assert pos["yes"] == 2 * GEN
    m = json.loads(c.get_market(mid))
    assert m["yes_pool_wei"] == str(2 * GEN)


def test_finalize_twice_is_refused(module, c):
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    resolve_ok(module, c, mid, om_value=6.0, power_value=5.5)
    set_now("2026-09-25T07:01:00Z")
    c.finalize(mid)
    with pytest.raises(err(module), match="nothing to finalize"):
        c.finalize(mid)


def test_void_timeout_respects_a_standing_verdict(module, c):
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    resolve_ok(module, c, mid, om_value=6.0, power_value=5.5)
    set_now("2026-12-01T00:00:00Z")
    with pytest.raises(err(module), match="verdict stands"):
        c.void_timeout(mid)


def test_the_round_ceiling_leads_to_the_void_path(module, c):
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    serve_global(module, c, mid, om_value=6.0, power_missing=True)
    set_now("2026-09-25T06:00:00Z")
    for _ in range(5):  # MAX_ROUNDS_PER_MARKET retriable rounds
        panel_says(panel_ok({"open-meteo": 6.0, "nasa-power": None}))
        as_(module, ALICE)
        assert json.loads(c.resolve(mid))["kind"] == "RETRY"
    panel_says(panel_ok({"open-meteo": 6.0, "nasa-power": None}))
    as_(module, ALICE)
    with pytest.raises(err(module), match="rounds it allows"):
        c.resolve(mid)
    set_now("2026-10-10T00:00:01Z")
    as_(module, STRANGER)
    json.loads(c.void_timeout(mid))
    assert claimable(c, ALICE) == GEN and claimable(c, BOB) == GEN


def test_every_recorded_account_is_the_signer(module, c):
    """S43 structurally: creator, staker, appellant, ticket wallet and
    round requester all come from gl.message.sender_address — there is no
    account parameter anywhere in the write surface to forge."""
    from conftest import CONTRACT_PATH
    src = CONTRACT_PATH.read_text(encoding="utf-8")
    for verb in ("def create_market", "def stake", "def buy_ticket",
                 "def appeal", "def resolve", "def claim"):
        sig = src[src.index(verb):src.index(")", src.index(verb))]
        assert "account" not in sig and "wallet" not in sig, verb
    mid = open_and_stake(module, c, yes={CARA: GEN})
    m = json.loads(c.get_market(mid))
    assert m["creator"] == ALICE
    assert json.loads(c.get_stakers(mid)) == [CARA]


def test_staker_registry_caps_in_words(module, c):
    mid = open_and_stake(module, c)
    for i in range(200):
        addr = "0x" + format(0xB000 + i, "040x")
        pay(module, addr, GEN)
        c.stake(mid, "YES")
    addr = "0x" + format(0xF999, "040x")
    pay(module, addr, GEN)
    with pytest.raises(err(module), match="200 wallets it allows"):
        c.stake(mid, "YES")
    assert claimable(c, addr) == GEN


def test_rounding_dust_is_conserved_never_burned(module, c):
    """Three uneven YES stakes against an odd NO pool: pro-rata floors
    leave dust; the ledger total still equals the pools."""
    yes = {ALICE: GEN + 1, CARA: 2 * GEN + 1, STRANGER: GEN // 3}
    mid = open_and_stake(module, c, yes=yes, no={BOB: GEN + 7})
    resolve_ok(module, c, mid, om_value=6.0, power_value=5.5)
    set_now("2026-09-25T07:01:00Z")
    c.finalize(mid)
    total_in = sum(yes.values()) + GEN + 7
    total_out = sum(claimable(c, a) for a in (ALICE, CARA, STRANGER, BOB))
    assert total_out == total_in
