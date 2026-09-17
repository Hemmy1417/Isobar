"""Direct-mode harness for Isobar: the real contract module against a stub
`genlayer` that is AS STRICT AS the runtime where it matters — validator
functions actually run, a validator returning False fails the round, the
clock is the transaction's own datetime and every test controls it, and
value emission is captured so a suite can assert conservation to the wei.

Mocked with intent:

  THE CLOCK. `set_now(iso)` sets the next transactions' datetime; nothing
  advances implicitly, so both sides of every wall-clock boundary are
  testable to the second.

  THE WEB. `page(url, text)` fills a page table `gl.nondet.web.render`
  answers from; an absent URL is unreachable; `page_for(role, url, text)`
  serves different bytes to leader and validator so a test can force a
  reading split. Fetches are logged per role.

  THE PANEL. Successive exec_prompt calls walk a queue; the last entry
  repeats. `forge_leader(value)` replays a fabricated leader result to the
  validator instead of running the leader.

  MONEY. `gl.message.value` is set by `pay(wei)`; `_Payee(...).emit_transfer`
  appends to `transfers()`, so claims are assertable end to end.
"""

import importlib.util
import json
import os
import pathlib
import sys
import types
from datetime import datetime, timezone

import pytest

CONTRACT_PATH = (pathlib.Path(__file__).resolve().parents[2]
                 / "contracts" / "isobar.py")

OWNER = "0x0000000000000000000000000000000000000AAA"
ALICE = "0x1111111111111111111111111111111111111111"
BOB = "0x2222222222222222222222222222222222222222"
CARA = "0x3333333333333333333333333333333333333333"
STRANGER = "0x5555555555555555555555555555555555555555"

GEN = 10**18

_PAGES = {}
_ROLE_PAGES = {"leader": {}, "validator": {}}
_FETCHES = {"leader": [], "validator": []}
_ROLE = ["leader"]
_PANEL = []
_PANEL_CALLS = [0]
_PROMPTS = []
_FORGED = []
_DOWNGRADES = []
_DISAGREEMENTS = []
_TRANSFERS = []
_NOW = [datetime(2026, 9, 18, 12, 0, 0, tzinfo=timezone.utc)]


class _UserError(Exception):
    def __init__(self, data):
        super().__init__(data)
        self.data = data

    def __str__(self):
        return str(self.data)


class _VMError:
    def __init__(self, message):
        self.message = message


class _Return:
    def __init__(self, calldata):
        self.calldata = calldata


def _roundtrip(value):
    """Consensus serializes the leader's result; a dict with non-JSON
    content would not survive. Round-tripping enforces that in tests."""
    return json.loads(json.dumps(value))


def _run_nondet(leader_fn, validator_fn):
    if _FORGED:
        forged = _FORGED.pop(0)
        _ROLE[0] = "validator"
        try:
            ok = validator_fn(_Return(forged))
        except Exception:
            ok = False
        finally:
            _ROLE[0] = "leader"
        if not ok:
            raise _UserError("[LLM_ERROR] validators did not agree with the leader")
        return forged
    try:
        value = _roundtrip(leader_fn())
    except _UserError as e:
        _ROLE[0] = "validator"
        try:
            agreed = validator_fn(e)
        except Exception:
            agreed = False
        finally:
            _ROLE[0] = "leader"
        if agreed:
            raise _UserError(e.data)
        raise _UserError("[LLM_ERROR] validators disagreed with the leader's failure")
    _ROLE[0] = "validator"
    try:
        ok = validator_fn(_Return(value))
    except Exception:
        ok = False
    finally:
        _ROLE[0] = "leader"
    if not ok:
        raise _UserError("[LLM_ERROR] validators did not agree with the leader")
    return value


class _TreeMap(dict):
    def __class_getitem__(cls, item):
        return cls

    def get(self, k, default=None):
        return super().get(k, default)


class _U256(int):
    def __new__(cls, v):
        return super().__new__(cls, int(v))


class _Address(str):
    def __new__(cls, v):
        return super().__new__(cls, str(v))


class _ViewDeco:
    def __call__(self, fn):
        return fn


class _WriteDeco:
    payable = staticmethod(lambda fn: fn)

    def __call__(self, fn):
        return fn


class _Public:
    view = _ViewDeco()
    write = _WriteDeco()


class _NondetWeb:
    @staticmethod
    def get(url, **kw):
        raise AssertionError(f"unexpected GET: {url}")

    @staticmethod
    def post(url, **kw):
        raise AssertionError(f"unexpected POST: {url}")

    @staticmethod
    def render(url, mode="text"):
        role = _ROLE[0]
        _FETCHES[role].append(url)
        if url in _ROLE_PAGES[role]:
            body = _ROLE_PAGES[role][url]
            if body is None:
                raise RuntimeError("source unreachable")
            return body
        if url in _PAGES:
            return _PAGES[url]
        raise RuntimeError("source unreachable")


def _exec_prompt(prompt, response_format=None):
    _PROMPTS.append(prompt)
    if not _PANEL:
        raise AssertionError("test ran the panel without panel_says()")
    idx = min(_PANEL_CALLS[0], len(_PANEL) - 1)
    _PANEL_CALLS[0] += 1
    answer = _PANEL[idx]
    if isinstance(answer, BaseException):
        raise answer
    return answer


class _PayeeProxy:
    def __init__(self, addr):
        self.addr = str(addr)

    def emit_transfer(self, value=0):
        _TRANSFERS.append({"to": self.addr, "wei": int(value)})


def _contract_interface(cls):
    return _PayeeProxy


def _print_hook(*args, **kwargs):
    line = " ".join(str(a) for a in args)
    if "[DOWNGRADE]" in line:
        _DOWNGRADES.append(line)
    if "[DISAGREE]" in line:
        _DISAGREEMENTS.append(line)


class _MessageRaw(dict):
    def get(self, k, default=None):
        if k == "datetime":
            return _NOW[0]
        return super().get(k, default)


def _install():
    gl = types.ModuleType("genlayer")
    gl.IS_IN_VM = False
    gl.public = _Public()
    gl.contract = types.SimpleNamespace(Contract=type("Contract", (), {}))
    gl.storage = types.SimpleNamespace(TreeMap=_TreeMap,
                                       allow=lambda cls: cls)
    gl.vm = types.SimpleNamespace(UserError=_UserError, VMError=_VMError,
                                  Return=_Return, run_nondet=_run_nondet)
    gl.nondet = types.SimpleNamespace(web=_NondetWeb(),
                                      exec_prompt=_exec_prompt)
    gl.message = types.SimpleNamespace(sender_address=OWNER, value=0)
    gl.message_raw = _MessageRaw()
    gl.evm = types.SimpleNamespace(contract_interface=_contract_interface)
    gl.Address = _Address

    gl_types = types.ModuleType("genlayer.types")
    gl_types.u256 = _U256
    gl_types.Address = _Address
    gl_types.__all__ = ["u256", "Address"]
    gl.types = gl_types

    sys.modules["genlayer"] = gl
    sys.modules["genlayer.types"] = gl_types
    return gl


class _FakeDateTime(datetime):
    """The runtime wires datetime.now to the transaction datetime; the
    harness wires it to the test's controlled clock the same way."""

    @classmethod
    def now(cls, tz=None):
        return _NOW[0]


def _load():
    _install()
    spec = importlib.util.spec_from_file_location("isobar_contract", CONTRACT_PATH)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.print = _print_hook
    m.datetime = _FakeDateTime
    return m


@pytest.fixture
def module():
    # The stub SDK must not outlive its test: the official-runner suite
    # (test_sdk_runner.py) loads the real `genlayer` in the same session.
    saved = {k: v for k, v in sys.modules.items() if k == "genlayer" or k.startswith("genlayer.")}
    try:
        yield _load()
    finally:
        for k in [k for k in sys.modules if k == "genlayer" or k.startswith("genlayer.")]:
            del sys.modules[k]
        sys.modules.update(saved)


if sys.platform == "win32":
    # genlayer-test's direct loader unlinks a temp file it still holds open,
    # which POSIX allows and Windows refuses; tolerate exactly that locally.
    _real_unlink = os.unlink

    def _tolerant_unlink(path, *args, **kwargs):
        try:
            _real_unlink(path, *args, **kwargs)
        except PermissionError:
            pass

    os.unlink = _tolerant_unlink


_TREES = ("markets", "market_list", "positions", "market_stakers",
          "market_tickets", "rounds", "tickets", "wallet_markets",
          "wallet_tickets", "ledger", "counters", "reserve_wei")

_PUBLIC_WRITES = ("create_market", "stake", "buy_ticket", "resolve", "appeal",
                  "finalize", "void_timeout", "settle_ticket", "claim",
                  "seed_reserve", "withdraw_reserve")


def _revert_on_raise(inst, name):
    """The runtime reverts EVERY state change when a write raises — the
    platform lesson this harness once hid. Each public write snapshots the
    trees and restores them if the call escapes with an exception."""
    fn = getattr(inst, name)

    def wrapped(*args, **kwargs):
        snapshot = {t: dict(getattr(inst, t)) for t in _TREES}
        owner = inst.owner
        try:
            return fn(*args, **kwargs)
        except BaseException:
            for t, data in snapshot.items():
                tree = getattr(inst, t)
                tree.clear()
                tree.update(data)
            inst.owner = owner
            raise

    return wrapped


def _fresh_instance(module):
    inst = module.Isobar.__new__(module.Isobar)
    for name in _TREES:
        setattr(inst, name, _TreeMap())
    module.gl.message.sender_address = OWNER
    inst.__init__()
    for name in _PUBLIC_WRITES:
        setattr(inst, name, _revert_on_raise(inst, name))
    return inst


@pytest.fixture
def c(module):
    _reset()
    return _fresh_instance(module)


def _reset():
    _PAGES.clear()
    for d in _ROLE_PAGES.values():
        d.clear()
    for lst in _FETCHES.values():
        lst.clear()
    _ROLE[0] = "leader"
    _PANEL.clear()
    _PANEL_CALLS[0] = 0
    _PROMPTS.clear()
    _FORGED.clear()
    _DOWNGRADES.clear()
    _DISAGREEMENTS.clear()
    _TRANSFERS.clear()
    _NOW[0] = datetime(2026, 9, 18, 12, 0, 0, tzinfo=timezone.utc)


# ── helpers ──────────────────────────────────────────────────────────────────

def as_(module, who, value=0):
    module.gl.message.sender_address = who
    module.gl.message.value = value


def pay(module, who, wei):
    as_(module, who, wei)


def err(module):
    return module.gl.vm.UserError


def set_now(iso):
    _NOW[0] = datetime.fromisoformat(iso.replace("Z", "+00:00"))


def page(url, text):
    _PAGES[url] = text


def page_for(role, url, text):
    """Serve `text` (or None = unreachable) to one role only."""
    _ROLE_PAGES[role][url] = text


def fetches(role=None):
    if role:
        return list(_FETCHES[role])
    return list(_FETCHES["leader"]) + list(_FETCHES["validator"])


def prompts():
    return list(_PROMPTS)


def downgrades():
    return list(_DOWNGRADES)


def disagreements():
    return list(_DISAGREEMENTS)


def transfers():
    return list(_TRANSFERS)


def panel_says(*answers):
    _PANEL.clear()
    _PANEL.extend(answers)
    _PANEL_CALLS[0] = 0


def forge_leader(value):
    _FORGED.append(value)


# ── canonical fixture data ───────────────────────────────────────────────────

DATE = "2026-09-20"


def params(location="panama-colon", metric="WIND_MAX", comparison="GTE",
           threshold_x100=500, date=DATE):
    return json.dumps({"location_id": location, "metric": metric,
                       "comparison": comparison, "threshold_x100": threshold_x100,
                       "window_date": date})


def om_body(value=5.22, date=DATE, field="wind_speed_10m_max", missing=False):
    daily = {"time": [date], field: [None if missing else value]}
    return json.dumps({"latitude": 9.35, "longitude": -79.9,
                       "generationtime_ms": 0.123456,   # volatile on purpose
                       "daily_units": {field: "m/s"},
                       "daily": daily})


def power_body(value=5.1, date=DATE, field="WS10M_MAX", missing=False):
    key = date.replace("-", "")
    return json.dumps({"type": "Feature",
                       "header": {"generated": "now-ish, volatile"},
                       "properties": {"parameter": {
                           field: {key: -999.0 if missing else value}}}})


def nws_body(max_kmh=25.0, date=DATE, rows=30):
    feats = []
    for i in range(rows):
        v = max_kmh if i == rows // 2 else max(0.0, max_kmh - 5.0)
        feats.append({"properties": {
            "timestamp": f"{date}T{i % 24:02d}:{(i * 7) % 60:02d}:00+00:00",
            "windSpeed": {"unitCode": "wmoUnit:km_h-1", "value": v},
            "temperature": {"unitCode": "wmoUnit:degC", "value": 21.0},
        }})
    return json.dumps({"features": feats})


def market_urls(module, c, market_id):
    m = json.loads(c.get_market(market_id))
    return {s["source"]: s["url"] for s in m["sources"]}


def serve_global(module, c, market_id, om_value=5.22, power_value=5.1,
                 om_missing=False, power_missing=False):
    """Fill both global-lane sources for a market's date."""
    m = json.loads(c.get_market(market_id))
    urls = {s["source"]: s["url"] for s in m["sources"]}
    field = {"WIND_MAX": "wind_speed_10m_max", "PRECIP_SUM": "precipitation_sum",
             "TEMP_MAX": "temperature_2m_max"}[m["metric"]]
    pfield = {"WIND_MAX": "WS10M_MAX", "PRECIP_SUM": "PRECTOTCORR",
              "TEMP_MAX": "T2M_MAX"}[m["metric"]]
    page(urls["open-meteo"], om_body(om_value, m["window_date"], field, om_missing))
    page(urls["nasa-power"], power_body(power_value, m["window_date"], pfield,
                                        power_missing))
    return urls


def quote_for(value):
    """A grounded quote: the value as it appears in the stable form."""
    return json.dumps(value) if not isinstance(value, str) else value


def panel_ok(sources_values, sufficient=True):
    """A well-formed panel answer whose quotes ground in the stable forms.
    sources_values: {"open-meteo": 5.22, "nasa-power": 5.1} (None = not covered)."""
    rows = []
    for name, value in sources_values.items():
        covered = value is not None
        rows.append({"source": name, "covered": covered,
                     "anomaly": "" if covered else "no value for the date",
                     "quote": quote_for(value) if covered else ""})
    return {"reasoning": "The payloads carry one plausible value each for "
                         "the observation date; units are consistent.",
            "sources": rows, "sufficient": sufficient}


def create_market(module, c, who=ALICE, **kw):
    as_(module, who)
    return c.create_market(params(**kw))


def open_and_stake(module, c, yes=None, no=None, **kw):
    """Create a market and stake both sides. yes/no: {addr: wei}."""
    mid = create_market(module, c, **kw)
    for addr, wei in (yes or {}).items():
        pay(module, addr, wei)
        c.stake(mid, "YES")
    for addr, wei in (no or {}).items():
        pay(module, addr, wei)
        c.stake(mid, "NO")
    return mid


def to_resolving(mid_date=DATE, lane_days=4):
    """Advance the clock past resolve_after for a market's date."""
    set_now(f"2026-09-{int(mid_date[-2:]) + 1 + lane_days:02d}T06:00:00Z")


def resolve_ok(module, c, mid, om_value=5.22, power_value=5.1, sufficient=True,
               requested_by=ALICE):
    """Serve sources, queue matching panel answers, advance, resolve."""
    serve_global(module, c, mid, om_value, power_value)
    m = json.loads(c.get_market(mid))
    to_resolving(m["window_date"])
    panel_says(panel_ok({"open-meteo": om_value, "nasa-power": power_value},
                        sufficient))
    as_(module, requested_by)
    return json.loads(c.resolve(mid))


def claimable(c, addr):
    return int(json.loads(c.get_balance(addr))["claimable"])


def buy(c, legs_json, expect_ok=True):
    """Unwrap buy_ticket's uniform payable result: tid, or the reason."""
    out = json.loads(c.buy_ticket(legs_json))
    if expect_ok:
        assert out["refused"] is False, out
        return out["ticket_id"]
    assert out["refused"] is True, out
    return out["reason"]
