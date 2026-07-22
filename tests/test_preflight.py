"""Guardrail tests for the preflight gate (preflight.py) - the code that decides
whether a kit shows the green 'form ready' check. Run: python3 tests/test_preflight.py"""
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from preflight import HUMAN_ONLY, coverage, slugs


def q(label, required=True, ftype="input_text"):
    return {"label": label, "required": required, "fields": [{"type": ftype}]}


RULES = [{"match": "zip code", "kind": "text", "v": "03076"},
         {"match": "how did you hear", "kind": "choice", "opts": ["LinkedIn"]}]


def test_experience_thresholds_are_never_autopilot():
    assert HUMAN_ONLY.search("Do you have at least 12 years of experience?")
    assert HUMAN_ONLY.search("What is your desired salary?")
    assert not HUMAN_ONLY.search("How did you hear about this role?")


def test_coverage_counts_rules_builtins_uploads():
    qs = [q("Resume/CV", ftype="input_file"), q("Email"), q("Please provide the zip code"),
          q("How did you hear about us?")]
    rows, manual, covered = coverage(qs, RULES)
    assert covered == 4 and manual == []


def test_required_unknown_question_is_a_gap():
    rows, manual, covered = coverage([q("Explain your favorite database")], RULES)
    assert manual == ["Explain your favorite database"]


def test_optional_unknown_question_is_not_a_gap():
    rows, manual, covered = coverage([q("Fingerprint", required=False)], RULES)
    assert manual == []


def test_human_only_required_question_stays_manual_but_marked():
    rows, manual, covered = coverage([q("Do you have at least 12 years of experience?")], RULES)
    assert manual and "HUMAN" in rows[0][1]


def test_slugs_strip_corp_noise():
    assert "epamsystems" in slugs("EPAM Systems, Inc.") or "epam" in slugs("EPAM Systems, Inc.")
    assert "dropbox" in slugs("Dropbox")


# ---- zero-dependency runner (pip/pytest broken on this machine) ----
if __name__ == "__main__":
    import traceback

    passed = failed = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
            print(f"  PASS {name}"); passed += 1
        except Exception:
            print(f"  FAIL {name}"); traceback.print_exc(); failed += 1
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
