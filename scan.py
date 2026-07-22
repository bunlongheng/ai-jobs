#!/usr/bin/env python3
"""Zero-token job discovery via public ATS JSON APIs (Greenhouse/Ashby/Lever).

Reads portals.json, pulls every open req from each configured company, filters
by title + location rules, pre-ranks, and prints matched candidates as JSON to
stdout. No auth, no scraping, no external deps (stdlib only). Used as job-search
Level 0 before the WebSearch fallback.

Usage: python3 scan.py [path/to/portals.json]
"""
import json
import os
import sys
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "portals.json")
UA = {"User-Agent": "Mozilla/5.0 (jobhunt-scan)"}
TIMEOUT = 15


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


def norm_greenhouse(co, data):
    out = []
    for j in data.get("jobs", []):
        out.append({
            "company": co["name"], "ats": "greenhouse",
            "title": j.get("title", ""),
            "location": (j.get("location") or {}).get("name", ""),
            "url": j.get("absolute_url", ""),
            "remote_flag": False,
            "posted": j.get("updated_at", ""),
        })
    return out


def norm_ashby(co, data):
    out = []
    for j in data.get("jobs", []):
        locs = [j.get("location", "")]
        for s in j.get("secondaryLocations", []) or []:
            locs.append(s.get("location", ""))
        out.append({
            "company": co["name"], "ats": "ashby",
            "title": j.get("title", ""),
            "location": " / ".join([x for x in locs if x]),
            "url": j.get("jobUrl", ""),
            "remote_flag": bool(j.get("isRemote")),
            "posted": j.get("publishedAt", ""),
        })
    return out


def norm_lever(co, data):
    out = []
    for j in data:
        cat = j.get("categories", {}) or {}
        locs = [cat.get("location", "")] + (cat.get("allLocations", []) or [])
        wt = (j.get("workplaceType") or "").lower()
        out.append({
            "company": co["name"], "ats": "lever",
            "title": j.get("text", ""),
            "location": " / ".join([x for x in locs if x]),
            "url": j.get("hostedUrl", ""),
            "remote_flag": wt == "remote",
            "posted": j.get("createdAt", ""),
        })
    return out


API = {
    "greenhouse": lambda s: "https://boards-api.greenhouse.io/v1/boards/%s/jobs" % s,
    "ashby": lambda s: "https://api.ashbyhq.com/posting-api/job-board/%s" % s,
    "lever": lambda s: "https://api.lever.co/v0/postings/%s?mode=json" % s,
}
NORM = {"greenhouse": norm_greenhouse, "ashby": norm_ashby, "lever": norm_lever}


def pull(co):
    ats = co["ats"]
    try:
        data = fetch(API[ats](co["slug"]))
        return co, NORM[ats](co, data), None
    except Exception as e:  # noqa: BLE001
        return co, [], str(e)


def title_ok(title, tf):
    t = " " + title.lower() + " "
    if not any(p in t for p in tf["positive"]):
        return False
    if any(n in t for n in tf["negative"]):
        return False
    if any(r in t for r in tf["seniority_reject"]):
        return False
    if not any(s in t for s in tf["seniority_required"]):
        return False
    return True


def loc_ok(job, lf):
    blob = (job["location"] + " " + job["title"]).lower()
    remote = job["remote_flag"] or "remote" in blob
    if lf.get("require_remote") and not remote:
        return False, "not remote"
    us = any(u in blob for u in lf["us_terms"])
    blocked = any(b in blob for b in lf["blocked_terms"])
    if blocked and not us:
        return False, "non-US location"
    if not us and not remote:
        return False, "location unclear"
    return True, ("US remote" if us else "generic remote - verify US")


def pre_score(job):
    t = job["title"].lower()
    s = 0
    if "staff" in t or "principal" in t:
        s += 3
    elif "senior" in t or "sr" in t or "lead" in t:
        s += 2
    if any(k in t for k in ("full stack", "fullstack", "full-stack")):
        s += 3
    if "ai engineer" in t or "forward deployed" in t:
        s += 2
    if "software engineer" in t or "product engineer" in t:
        s += 1
    return s


def main():
    cfg = json.load(open(CFG))
    companies = cfg["companies"]
    tf, lf = cfg["title_filter"], cfg["location_filter"]
    matched, errors, total = [], [], 0

    with ThreadPoolExecutor(max_workers=12) as ex:
        for co, jobs, err in ex.map(pull, companies):
            if err:
                errors.append({"company": co["name"], "error": err[:120]})
                continue
            total += len(jobs)
            for j in jobs:
                if not title_ok(j["title"], tf):
                    continue
                ok, why = loc_ok(j, lf)
                if not ok:
                    continue
                j["loc_note"] = why
                j["pre_score"] = pre_score(j)
                matched.append(j)

    # dedupe by url, rank by pre_score desc then company, cap per company
    per_cap = cfg.get("max_per_company", 0)
    seen, per_co, dedup = set(), {}, []
    for j in sorted(matched, key=lambda x: (-x["pre_score"], x["company"])):
        if j["url"] in seen:
            continue
        if per_cap and per_co.get(j["company"], 0) >= per_cap:
            continue
        seen.add(j["url"])
        per_co[j["company"]] = per_co.get(j["company"], 0) + 1
        dedup.append(j)

    cap = cfg.get("max_output", 40)
    print(json.dumps({
        "companies_scanned": len(companies),
        "errors": errors,
        "reqs_seen": total,
        "matched": len(dedup),
        "returned": min(cap, len(dedup)),
        "jobs": dedup[:cap],
    }, indent=2))


if __name__ == "__main__":
    main()
