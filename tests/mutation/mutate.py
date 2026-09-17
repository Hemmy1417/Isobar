"""Mutation check: break each safety floor of contracts/isobar.py in place and
prove the direct suite fails, then restore and prove it passes again.

Run from the repo root:  python tests/mutation/mutate.py
Exit status 0 only if every mutant is killed and the restore-control passes.
The contract is always restored byte for byte, even if the run is interrupted.
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "contracts" / "isobar.py"
ORIGINAL = CONTRACT.read_bytes()
TEXT = ORIGINAL.decode("utf-8")

MUTATIONS = [
    ("empty-excerpt guard removed",
     "                if not t_excerpt:\n"
     "                    print(f\"[DISAGREE] {me['source']}: fetched row with empty excerpt\")\n"
     "                    return False",
     "                if False:\n"
     "                    print('mutant')\n"
     "                    return False"),
    ("insufficiency gate removed",
     "        if not panel[\"sufficient\"]:",
     "        if False:"),
    ("corroboration floor weakened to one source",
     "        if len(covered) < 2:",
     "        if len(covered) < 1:"),
    ("parlay exposure reservation removed",
     "        if exposure + payout > reserve + wei:",
     "        if False:"),
    ("appeal window never closes",
     "        if now > resolved_at + timedelta(seconds=APPEAL_WINDOW_SECONDS):",
     "        if False:"),
    ("excerpt prefix check removed",
     "                if not (t_excerpt.startswith(me[\"excerpt\"])\n"
     "                        or me[\"excerpt\"].startswith(t_excerpt)):",
     "                if False:"),
    ("digest-covers-stored check removed",
     "                if them.get(\"digest\") != _sha256(t_excerpt):",
     "                if False:"),
    ("finalize ignores the appeal window",
     "        if window_open and not m.get(\"appeal\"):",
     "        if False:"),
    ("claim does not zero the balance",
     "        row[\"claimable\"] = 0\n        row[\"claimed\"] = int(row[\"claimed\"]) + amount",
     "        row[\"claimed\"] = int(row[\"claimed\"]) + amount"),
    ("panel grounding check removed",
     "            grounded = bool(quote) and _squash(quote) in _squash(snap[\"excerpt\"])",
     "            grounded = True"),
    ("ungrounded coverage kept",
     "            if covered and not grounded:",
     "            if False:"),
    ("void refund forgets the yes side",
     "                total = int(pos[\"yes\"]) + int(pos[\"no\"])\n                if total:\n                    self._credit(a, total)\n        m[\"state\"] = \"FINAL\" if verdict",
     "                total = int(pos[\"no\"])\n                if total:\n                    self._credit(a, total)\n        m[\"state\"] = \"FINAL\" if verdict"),
    ("stake refusal forgets the refund credit",
     """            if wei > 0:
                self._credit(sender, wei)
            return json.dumps({"refused": True,
                               "reason": f"{refuse}; your stake is claimable back"})""",
     """            return json.dumps({"refused": True,
                               "reason": f"{refuse}; your stake is claimable back"})"""),
    ("ticket refusal raises again, stranding the value",
     """        except _PayableRefusal as e:
            if wei > 0:
                self._credit(sender, wei)
            return json.dumps({"refused": True,
                               "reason": f"{e}; your stake is claimable back"})""",
     """        except _PayableRefusal as e:
            raise gl.vm.UserError(str(e))"""),
]



def suite_passes() -> tuple[bool, str]:
    r = subprocess.run([sys.executable, "-m", "pytest", "tests/direct/", "-q",
                        "--tb=no", "-p", "no:cacheprovider"],
                       cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail = (r.stdout or "").strip().splitlines()[-1] if r.stdout else "?"
    return r.returncode == 0, tail


failures = []
try:
    for name, old, new in MUTATIONS:
        if old not in TEXT:
            print(f"[MISS]     pattern not found for: {name}")
            failures.append(name)
            continue
        # bytes, not write_text: text mode on Windows would write CRLF
        CONTRACT.write_bytes(TEXT.replace(old, new, 1).encode("utf-8"))
        passed, tail = suite_passes()
        if passed:
            print(f"[SURVIVED] {name}  <-- suite blind to this")
            failures.append(name)
        else:
            print(f"[KILLED]   {name}  ({tail})")
finally:
    CONTRACT.write_bytes(ORIGINAL)

control, _ = suite_passes()
print("restore-control:", "PASS" if control else "FAIL")
print(f"{len(MUTATIONS) - len(failures)}/{len(MUTATIONS)} killed")
sys.exit(0 if control and not failures else 1)
