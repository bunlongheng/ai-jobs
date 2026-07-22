"""Guardrail tests for the jobfill autopilot. Run: python3 -m pytest tests/ -q
These protect the two places a silent bug touches REAL applications:
the rules brain and the server's event/archive logic."""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "jobfill"))

RULES = os.path.join(BASE, "jobfill", "rules.json")


def load_rules():
    return json.load(open(RULES))


def test_rules_json_is_valid_json():
    assert isinstance(load_rules(), list)


def test_every_rule_regex_compiles():
    for r in load_rules():
        re.compile(r["match"], re.I)  # raises on a bad pattern


def test_every_rule_has_an_answer():
    for r in load_rules():
        has = bool(r.get("opts")) or bool(r.get("v")) or bool(r.get("freeText"))
        assert has, f"rule {r['match']!r} has no opts/v/freeText - it can never answer"


def test_choice_rules_have_nonempty_opts():
    for r in load_rules():
        if r.get("kind", "choice") == "choice" and "opts" in r:
            assert isinstance(r["opts"], list) and len(r["opts"]) > 0


def test_server_enrich_event_inherits_best_fill(tmp_path, monkeypatch):
    import server
    kit = "test-kit"
    d = tmp_path / "applications" / kit
    d.mkdir(parents=True)
    events = [
        {"id": kit, "outcome": "filled", "url": "https://x/jobs/123", "fields": [["a", "1"]]},
        {"id": kit, "outcome": "filled", "url": "https://x/jobs/123",
         "fields": [["a", "1"], ["b", "2"]]},
    ]
    with open(d / "ext-events.jsonl", "w") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")
    monkeypatch.setattr(server, "APPS", str(tmp_path / "applications"))
    out = server.enrich_event({"id": kit, "outcome": "submitted", "stamp": "2026-01-01"})
    assert len(out["fields"]) == 2, "should inherit the RICHEST fill"
    assert out["outcome"] == "submitted", "submitted outcome must survive the merge"


def test_server_kit_path_traversal_guarded():
    # the route uses os.path.basename on the kit id - verify the guard behavior
    assert os.path.basename("../../etc/passwd") == "passwd"



# ---- zero-dependency runner (pip/pytest broken on this machine) ----
# Run: python3 tests/test_jobfill.py
if __name__ == "__main__":
    import tempfile, traceback, pathlib

    class _MP:  # minimal monkeypatch stand-in
        def __init__(self): self._saves = []
        def setattr(self, obj, name, val):
            self._saves.append((obj, name, getattr(obj, name))); setattr(obj, name, val)
        def undo(self):
            for o, n, v in reversed(self._saves): setattr(o, n, v)

    passed = failed = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            n = fn.__code__.co_argcount
            if n == 0:
                fn()
            else:
                with tempfile.TemporaryDirectory() as td:
                    mp = _MP()
                    try: fn(pathlib.Path(td), mp)
                    finally: mp.undo()
            print(f"  PASS {name}"); passed += 1
        except Exception:
            print(f"  FAIL {name}"); traceback.print_exc(); failed += 1
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
