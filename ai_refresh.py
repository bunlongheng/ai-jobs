#!/usr/bin/env python3
"""ai_refresh.py - keep the AI-able ready list fresh.

Scans live Greenhouse/Ashby/Lever openings (scan.py), green-checks each Greenhouse
role's real form questions against jobfill/rules.json, and upserts every AI-able
(single-page, fully-covered, guaranteed-live) match into tracker.json as kit_ready
with a green preflight stamp. Prunes stale/non-AI-able ready kits to status
'manual_only' so the ready list only shows what JobFill can actually drive.

AI-able = ATS in (greenhouse, ashby, lever) AND (for greenhouse) every required
question is covered by a rule/builtin. Ashby/Lever have clean single-page forms
with no public question API, so they are AI-able-by-default (fill checks live).

Usage: python3 ai_refresh.py         (run once; safe to re-run / loop)
"""
import json, os, re, subprocess, urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
TRACKER = os.path.join(HERE, "applications", "tracker.json")
RULES = json.load(open(os.path.join(HERE, "jobfill", "rules.json")))
HUMAN = re.compile(r"\d+\s*\+?\s*years|salary|compensation", re.I)
BUILT = ["first name", "last name", "email", "phone", "resume", "cover", "linkedin",
         "website", "location", "how did you hear", "gender", "race|ethnic", "veteran",
         "disab", "authoriz", "sponsor", "pronoun", "school", "degree", "^name", "country"]


def get(url):
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0"}), timeout=12))
    except Exception:
        return None


def green_greenhouse(board, jid):
    d = get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{jid}?questions=true")
    qs = (d or {}).get("questions", [])
    if not qs:
        return None
    manual = []
    for q in qs:
        label = q.get("label", "")
        if (q.get("fields") or [{}])[0].get("type") == "input_file":
            continue
        if HUMAN.search(label):
            continue
        if any(re.search(r["match"], label, re.I) for r in RULES):
            continue
        if any(re.search(b, label, re.I) for b in BUILT):
            continue
        if q.get("required"):
            manual.append(label[:34])
    return {"total": len(qs), "covered": len(qs) - len(manual), "manual": manual,
            "ready": not manual, "url": d.get("absolute_url")}


def slugify(s):
    return re.sub(r"[^a-z0-9-]", "", (s or "").lower().replace(" ", "-"))


def main():
    scan = json.loads(subprocess.run(["python3", os.path.join(HERE, "scan.py")],
                                     capture_output=True, text=True).stdout or "{}")
    t = json.load(open(TRACKER))
    by_url = {a.get("url"): a for a in t["applications"]}
    added = promoted = 0

    for j in scan.get("jobs", []):
        ats = j.get("ats")
        url = j.get("url", "")
        ai_able, pf = False, None
        if ats == "greenhouse":
            m = re.search(r"gh_jid=(\d+)|/jobs/(\d+)", url)
            bm = re.search(r"greenhouse\.io/([\w-]+)/", url)
            board = bm.group(1) if bm else slugify(j["company"].split()[0])
            if m:
                g = green_greenhouse(board, m.group(1) or m.group(2))
                if g and g["ready"]:
                    ai_able = True
                    pf = {"date": date.today().isoformat(), "status": "ready", "ats": "greenhouse",
                          "covered": g["covered"], "total": g["total"], "manual": g["manual"]}
        elif ats in ("ashby", "lever"):
            ai_able = True  # clean single-page forms, no question API; fill checks live
            pf = {"date": date.today().isoformat(), "status": "ready", "ats": ats,
                  "covered": 0, "total": 0, "manual": [], "note": "single-page - verified at fill"}
        if not ai_able:
            continue

        existing = by_url.get(url)
        if existing:
            if existing.get("status") in ("kit_ready", "planned"):
                existing["preflight"] = pf
                existing["ai_able"] = True
            continue
        if any(existing and a.get("status") in ("applied", "interviewing", "offer")
               for existing in [by_url.get(url)]):
            continue
        kid = slugify(f"{j['company']}-{j['title']}")[:70]
        t["applications"].append({
            "id": kid, "company": j["company"], "title": j["title"], "score": 70 + j.get("pre_score", 0),
            "status": "kit_ready", "url": url, "ats": ats, "ai_able": True, "preflight": pf,
            "notes": "auto-added by ai_refresh (live + AI-able)"})
        added += 1

    # prune: ready kits that are NOT ai-able + walled -> manual_only (keep, don't lose)
    for a in t["applications"]:
        if a.get("status") == "kit_ready":
            pf = a.get("preflight") or {}
            walled = pf.get("status") in ("account_wall", "login_wall", "blocked")
            if walled and not a.get("ai_able"):
                a["status"] = "manual_only"
                promoted += 1

    t["updated"] = date.today().isoformat()
    json.dump(t, open(TRACKER, "w"), indent=2)
    ai_ready = [a for a in t["applications"] if a.get("status") == "kit_ready" and a.get("ai_able")]
    print(f"ai_refresh: +{added} new AI-able, {promoted} walled->manual_only, "
          f"{len(ai_ready)} AI-able ready now")
    for a in sorted(ai_ready, key=lambda x: -(x.get("score") or 0))[:12]:
        print(f"  [{a.get('score')}] {a['company'][:16]:16} {(a.get('preflight') or {}).get('ats',''):10} {a['title'][:40]}")


if __name__ == "__main__":
    main()
