#!/usr/bin/env python3
"""apply_exclusions.py - force-skip jobs that hit profile.tech_exclude /
profile.employment_exclude. Word-boundary matching (java != javascript).

Usage: python3 apply_exclusions.py [run.json]   (default: jobs/latest.json)
Rewrites the file in place (and its dated run file if latest.json).
"""
import json, os, re, sys

HOME = os.path.expanduser("~")
prof = json.load(open(f"{HOME}/Sites/job/profile.json"))
tech = [t.lower() for t in prof.get("tech_exclude", [])]
emp = [t.lower() for t in prof.get("employment_exclude", [])]

def pat_for(t):
    if t == "java": return re.compile(r"\bjava\b")            # never matches javascript
    if t in ("angular", "angularjs"): return re.compile(r"\bangular(?:js)?\b")
    if t == "c#": return re.compile(r"c#")
    if t == "c sharp": return re.compile(r"\bc\s?sharp\b")
    if t in (".net",): return re.compile(r"\.net\b")
    if t == "dotnet": return re.compile(r"\bdotnet\b")
    # generic whole-word (handles contract, contractor, c2c, 1099, temporary, corp-to-corp...)
    return re.compile(r"(?<![a-z0-9])" + re.escape(t).replace(r"\ ", r"[\s/_-]+") + r"(?![a-z0-9])")

TECH = [(t, pat_for(t)) for t in tech]
EMP = [(t, pat_for(t)) for t in emp]

def hits(txt, table):
    t = (txt or "").lower()
    return [name for name, rx in table if rx.search(t)]

path = os.path.expanduser(sys.argv[1]) if len(sys.argv) > 1 else f"{HOME}/Sites/job/jobs/latest.json"
d = json.load(open(path))
jobs = d.get("jobs", d if isinstance(d, list) else [])
n = 0
for j in jobs:
    blob = f"{j.get('title','')} {j.get('description_excerpt','')}"
    th, eh = hits(blob, TECH), hits(blob, EMP)
    if (th or eh) and j.get("verdict") != "skip":
        j["verdict"] = "skip"; n += 1
        if th: j.setdefault("flags", []).append("excluded tech: " + ", ".join(th))
        if eh: j.setdefault("flags", []).append("excluded employment: " + ", ".join(eh))

json.dump(d, open(path, "w"), indent=2)
run = d.get("run")
if os.path.basename(path) == "latest.json" and run:
    rp = f"{HOME}/Sites/job/jobs/{run}.json"
    if os.path.exists(rp): json.dump(d, open(rp, "w"), indent=2)
from collections import Counter
print(f"force-skipped {n} job(s). verdicts now: {dict(Counter(x.get('verdict') for x in jobs))}")
PY = 1
