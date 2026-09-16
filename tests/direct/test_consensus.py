"""What a validator refuses: forged snapshots, split readings, ungrounded
panel claims. Every refusal prints its [DISAGREE] reason — a split you
cannot read is a split you debug by guesswork."""

import json

from conftest import (ALICE, BOB, DATE, GEN, as_, c, disagreements, downgrades,
                      err, fetches, forge_leader, module, open_and_stake,
                      panel_ok, panel_says, serve_global, set_now, to_resolving)
import pytest


def _armed(module, c, om=6.0, power=5.5):
    mid = open_and_stake(module, c, yes={ALICE: GEN}, no={BOB: GEN})
    urls = serve_global(module, c, mid, om_value=om, power_value=power)
    to_resolving(DATE)
    panel_says(panel_ok({"open-meteo": om, "nasa-power": power}))
    as_(module, ALICE)
    return mid, urls


def _snapshot_via_leader(module, c, mid):
    """Build the honest snapshot exactly as a node would."""
    m = json.loads(c.markets[mid])
    return c._fetch_snapshot(m)


def test_forged_snapshot_with_fabricated_reading_is_refused(module, c):
    mid, _ = _armed(module, c)
    honest = _snapshot_via_leader(module, c, mid)
    forged = json.loads(json.dumps(honest))
    forged[0]["value_x100"] = 999_00  # a hurricane nobody fetched
    forge_leader({"snapshot": forged,
                  "panel": panel_ok({"open-meteo": 6.0, "nasa-power": 5.5}),
                  "outcome": {"kind": "VERDICT", "verdict": "YES",
                              "readings": {}, "reason": None}})
    with pytest.raises(err(module), match="did not agree"):
        c.resolve(mid)
    assert any("reading differs" in d for d in disagreements())
    # the round wrote nothing
    assert json.loads(c.markets[mid])["rounds_count"] == 0


def test_forged_excerpt_behind_its_own_digest_is_refused(module, c):
    """S39: a digest over the leader's own bytes certifies nothing. The
    excerpt must be prefix-compatible with what this validator fetched."""
    mid, _ = _armed(module, c)
    honest = _snapshot_via_leader(module, c, mid)
    forged = json.loads(json.dumps(honest))
    fake = '{"daily": {"time": ["2026-09-20"], "wind_speed_10m_max": [99.9]}}'
    import hashlib
    forged[0]["excerpt"] = fake
    forged[0]["digest"] = hashlib.sha256(fake.encode()).hexdigest()  # self-consistent!
    forge_leader({"snapshot": forged,
                  "panel": panel_ok({"open-meteo": 6.0, "nasa-power": 5.5}),
                  "outcome": {"kind": "VERDICT", "verdict": "YES",
                              "readings": {}, "reason": None}})
    with pytest.raises(err(module), match="did not agree"):
        c.resolve(mid)
    assert any("not prefix-compatible" in d for d in disagreements())


def test_fetched_row_with_empty_excerpt_is_refused(module, c):
    """The empty string is a prefix of every page — guarded explicitly."""
    mid, _ = _armed(module, c)
    honest = _snapshot_via_leader(module, c, mid)
    forged = json.loads(json.dumps(honest))
    forged[0]["excerpt"] = ""
    forged[0]["digest"] = ""
    forge_leader({"snapshot": forged,
                  "panel": panel_ok({"open-meteo": 6.0, "nasa-power": 5.5}),
                  "outcome": {"kind": "VERDICT", "verdict": "YES",
                              "readings": {}, "reason": None}})
    with pytest.raises(err(module), match="did not agree"):
        c.resolve(mid)
    assert any("empty excerpt" in d for d in disagreements())


def test_digest_must_cover_the_stored_excerpt(module, c):
    mid, _ = _armed(module, c)
    honest = _snapshot_via_leader(module, c, mid)
    forged = json.loads(json.dumps(honest))
    forged[0]["digest"] = "00" * 32  # stored bytes nobody can re-check
    forge_leader({"snapshot": forged,
                  "panel": panel_ok({"open-meteo": 6.0, "nasa-power": 5.5}),
                  "outcome": {"kind": "VERDICT", "verdict": "YES",
                              "readings": {}, "reason": None}})
    with pytest.raises(err(module), match="did not agree"):
        c.resolve(mid)
    assert any("digest does not cover" in d for d in disagreements())


def test_leader_claiming_coverage_the_validator_cannot_fetch_is_refused(module, c):
    """A covering payload only the leader ever saw settles nothing."""
    from conftest import page_for
    mid, urls = _armed(module, c)
    page_for("validator", urls["nasa-power"], None)  # dark for the validator
    with pytest.raises(err(module), match="did not agree"):
        c.resolve(mid)
    assert any("leader fetched, I could not" in d for d in disagreements())


def test_split_readings_between_nodes_are_refused_with_the_reason(module, c):
    from conftest import page_for, power_body
    mid, urls = _armed(module, c)
    # the validator's fetch returns a different value for the same date
    page_for("validator", urls["nasa-power"], power_body(2.0))
    with pytest.raises(err(module), match="did not agree"):
        c.resolve(mid)
    # the divergence surfaces at the earliest byte-level check: the two
    # nodes' stable forms differ, so the excerpts cannot prefix-match
    assert any("not prefix-compatible" in d or "reading differs" in d
               for d in disagreements())


def test_panel_consequence_split_is_refused(module, c):
    """Leader and validator panels disagree on sufficiency — the only panel
    fields compared are the ones the derivation reads."""
    mid, _ = _armed(module, c)
    panel_says(panel_ok({"open-meteo": 6.0, "nasa-power": 5.5}, sufficient=True),
               panel_ok({"open-meteo": 6.0, "nasa-power": 5.5}, sufficient=False))
    with pytest.raises(err(module), match="did not agree"):
        c.resolve(mid)
    assert any("sufficiency" in d for d in disagreements())


def test_ungrounded_covered_claim_is_downgraded_not_trusted(module, c):
    """A panel that says covered without quoting the data line loses the
    claim; with one source left the round retries instead of settling."""
    mid, _ = _armed(module, c)
    good = panel_ok({"open-meteo": 6.0, "nasa-power": 5.5})
    good["sources"][1]["quote"] = "the vibes were fine"  # grounds nowhere
    panel_says(good)
    out = json.loads(c.resolve(mid))
    assert out["kind"] == "RETRY"
    assert any("without a grounded quote" in d for d in downgrades())


def test_validator_refetches_rather_than_trusting_the_leader(module, c):
    mid, urls = _armed(module, c)
    out = json.loads(c.resolve(mid))
    assert out["verdict"] == "YES"
    # both roles fetched both sources themselves
    assert fetches("leader").count(urls["open-meteo"]) == 1
    assert fetches("validator").count(urls["open-meteo"]) == 1
    assert fetches("validator").count(urls["nasa-power"]) == 1


def test_round_record_stores_the_agreed_snapshot(module, c):
    mid, _ = _armed(module, c)
    json.loads(c.resolve(mid))
    rec = json.loads(c.get_round(mid, 1))
    assert rec["kind"] == "RESOLUTION"
    assert rec["requested_by"] == ALICE
    srcs = {r["source"]: r for r in rec["snapshot"]}
    assert srcs["open-meteo"]["value_x100"] == 600
    assert srcs["nasa-power"]["value_x100"] == 550
    # volatile metadata never reaches the digested stable form
    assert "generationtime_ms" not in srcs["open-meteo"]["excerpt"]
    assert "header" not in srcs["nasa-power"]["excerpt"]
