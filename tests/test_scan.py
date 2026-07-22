"""Guardrail tests for the discovery gate: scan.py filters and the
apply_exclusions word-boundary regexes - the code that decides which jobs
enter (or silently skip) the pipeline. Run: python3 tests/test_scan.py"""
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

import scan
from apply_exclusions import pat_for, hits

TF = {
    "positive": ["engineer"],
    "negative": [" intern "],
    "seniority_reject": [" junior "],
    "seniority_required": ["senior", "staff"],
}
LF = {"us_terms": ["united states", "usa", " us "], "blocked_terms": ["london", "canada"]}


def test_title_ok_requires_positive_and_seniority():
    assert scan.title_ok("Senior Software Engineer", TF)
    assert not scan.title_ok("Senior Product Manager", TF)   # no positive term
    assert not scan.title_ok("Software Engineer", TF)        # no seniority


def test_title_ok_rejects_negatives():
    assert not scan.title_ok("Senior Engineer Intern", TF)
    assert not scan.title_ok("Junior Engineer, senior team", TF)


def test_loc_ok_us_remote_passes():
    job = {"location": "Remote - United States", "title": "Senior Engineer", "remote_flag": False}
    ok, why = scan.loc_ok(job, LF)
    assert ok and why == "US remote"


def test_loc_ok_blocked_location_fails():
    job = {"location": "London", "title": "Senior Engineer", "remote_flag": False}
    ok, why = scan.loc_ok(job, LF)
    assert not ok and why == "non-US location"


def test_pre_score_ranks_staff_fullstack_highest():
    staff_fs = scan.pre_score({"title": "Staff Full Stack Engineer"})
    senior = scan.pre_score({"title": "Senior Software Engineer"})
    plain = scan.pre_score({"title": "Software Engineer"})
    assert staff_fs > senior > plain


def test_java_excludes_java_but_never_javascript():
    rx = pat_for("java")
    assert rx.search("senior java developer")
    assert rx.search("java/kotlin backend")
    assert not rx.search("senior javascript developer")


def test_dotnet_and_csharp_patterns():
    assert pat_for(".net").search("c#/.net engineer")
    assert pat_for("c#").search("c# developer")
    assert not pat_for(".net").search("networking engineer")


def test_employment_terms_match_across_separators():
    assert pat_for("corp to corp").search("corp-to-corp only")
    assert pat_for("c2c").search("C2C only")
    assert not pat_for("contract").search("social contracts")


def test_hits_returns_matching_names():
    table = [("java", pat_for("java")), (".net", pat_for(".net"))]
    assert hits("Senior Java and .NET role", table) == ["java", ".net"]
    assert hits("Senior JavaScript role", table) == []


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
