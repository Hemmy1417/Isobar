# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

"""Throwaway measurement contract: what does the GenVM webdriver return for
the three weather APIs, and does this runner carry the transaction
datetime? Never part of the product; receipts land in docs/PROBE-REPORT."""

import json
from datetime import datetime, timezone

import genlayer as gl


class WeatherProbe(gl.contract.Contract):
    last: gl.storage.TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.write
    def probe(self, urls_json: str) -> str:
        urls = json.loads(urls_json)
        raw_dt = None
        dt_err = ""
        try:
            raw_dt = gl.message_raw.get("datetime")
        except Exception as e:  # noqa: BLE001 — a probe reports, never hides
            dt_err = f"{type(e).__name__}: {e}"[:120]
        # The v0.6 idiom: the standard-library clock IS the tx datetime.
        std_now = datetime.now(timezone.utc).isoformat()

        def leader():
            out = []
            for u in urls:
                row = {"url": u}
                try:
                    body = gl.nondet.web.render(u, mode="text")
                    row["ok"] = True
                    row["chars"] = len(body)
                    row["head"] = body[:200]
                    try:
                        parsed = json.loads(body)
                        row["json_keys"] = (sorted(parsed.keys())[:8]
                                            if isinstance(parsed, dict)
                                            else ["<non-dict>"])
                    except Exception as e:
                        row["json_keys"] = [f"PARSE_FAIL:{type(e).__name__}"]
                except Exception as e:
                    row["ok"] = False
                    row["err"] = str(e)[:160]
                out.append(row)
            return out

        def validator(res):
            # A probe measures; it does not adjudicate.
            return isinstance(res, gl.vm.Return)

        rows = gl.vm.run_nondet(leader, validator)
        report = {"datetime_type": type(raw_dt).__name__,
                  "datetime": str(raw_dt)[:40],
                  "datetime_err": dt_err,
                  "std_now": std_now,
                  "rows": rows}
        self.last["report"] = json.dumps(report)
        return self.last["report"]

    @gl.public.view
    def read(self) -> str:
        return self.last.get("report") or "{}"
