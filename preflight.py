#!/usr/bin/env python3
"""preflight.py - audit the application form BEFORE applying (the apply gate).

For each kit: resolve the real ATS (Greenhouse job id from the URL, else probe
Greenhouse/Lever/Ashby by company slug and match the title), fetch the actual
form questions (Greenhouse ?questions=true), and test EVERY question against
jobfill/rules.json so gaps are known before the tab ever opens.

Writes applications/<id>/preflight.json and stamps tracker.json:
  preflight: {date, status, ats, covered, total, manual[], direct_url?}
Statuses:
  ready       - every required question covered (or deliberately human)
  gaps        - required questions with no rule; fix rules.json first
  no_form_api - real ATS found but its form is not API-readable (fill-time check)
  unsupported - could not resolve any ATS API (e.g. Workday behind Indeed)

Usage: python3 preflight.py <kit-id> | --all [--live]   (--all = every kit_ready)
--live audits through the USER's real logged-in Chrome via the JobFill command
channel (open + read-only audit) - beats bot walls and uses live login sessions.
Green check in /job report appears ONLY for status ready.
"""
import json, os, re, subprocess, sys, urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
TRACKER = os.path.join(HERE, "applications", "tracker.json")
UA = {"User-Agent": "Mozilla/5.0 (jobhunt-preflight)"}

# Questions the autopilot must NEVER answer - the human does (truth gates).
HUMAN_ONLY = re.compile(r"\d+\s*\+?\s*years|salary|compensation", re.I)

# Mirror of the extension's built-in coverage (content.js buildRules). Keep in
# sync when builtins change - preflight only needs the match surface, not answers.
BUILTINS = [r"first name", r"last name|surname", r"full name|your name|^name$", r"e-?mail",
    r"phone|mobile", r"linkedin", r"github", r"portfolio|personal (web)?site|website",
    r"^(location|city|current location|your location)$|where do you (currently )?(live|reside)",
    r"school|university|alma mater", r"degree", r"discipline|major|field of study",
    r"how did you hear|hear about (this|us)", r"hispanic|latino", r"gender", r"transgender",
    r"sexual orientation", r"disability", r"veteran|military", r"race|ethnicit",
    r"agree|consent|acknowledge|privacy|terms", r"notice period",
    r"(earliest )?start date|available to start", r"sponsor|visa|immigration",
    r"authorized to work|work authorization|eligible to work", r"relocat",
    r"remote location|work (from|in) a remote", r"country", r"preferred (first )?name",
    r"employed by|previously (been )?(employed|worked)|former employee",
    r"current (or most recent )?(company|employer|title)|most recent (company|employer|title)"]


def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
            return json.load(r)
    except Exception:
        return None


def slugs(company):
    base = re.sub(r"[^a-z0-9 ]", "", (company or "").lower())
    words = [w for w in base.split() if w not in ("inc", "llc", "corp", "the", "co")]
    joined = "".join(words)
    return list(dict.fromkeys([joined, "".join(base.split()), words[0] if words else joined]))


def resolve_greenhouse(kit):
    """Return (board, job_id) from the kit URL, else probe by company slug + title."""
    url = kit.get("url") or ""
    m = re.search(r"gh_jid=(\d+)", url) or re.search(r"greenhouse\.io/([\w-]+)/jobs/(\d+)", url)
    if m and m.lastindex == 1:
        for s in slugs(kit.get("company")):
            if get(f"https://boards-api.greenhouse.io/v1/boards/{s}/jobs/{m.group(1)}"):
                return s, m.group(1)
    if m and m.lastindex == 2:
        return m.group(1), m.group(2)
    want = re.sub(r"[^a-z0-9]", "", (kit.get("title") or "").lower())
    for s in slugs(kit.get("company")):
        board = get(f"https://boards-api.greenhouse.io/v1/boards/{s}/jobs")
        for j in (board or {}).get("jobs", []):
            if re.sub(r"[^a-z0-9]", "", j.get("title", "").lower()) == want:
                return s, str(j["id"])
    return None, None


def probe_other(kit):
    """Lever/Ashby: no public form API, but a live posting gives a direct URL."""
    want = re.sub(r"[^a-z0-9]", "", (kit.get("title") or "").lower())
    for s in slugs(kit.get("company")):
        for j in get(f"https://api.lever.co/v0/postings/{s}?mode=json") or []:
            if re.sub(r"[^a-z0-9]", "", j.get("text", "").lower()) == want:
                return "lever", j.get("hostedUrl")
        d = get(f"https://api.ashbyhq.com/posting-api/job-board/{s}")
        for j in (d or {}).get("jobs", []):
            if re.sub(r"[^a-z0-9]", "", j.get("title", "").lower()) == want:
                return "ashby", j.get("jobUrl")
    return None, None


def coverage(questions, rules):
    rows, manual, covered = [], [], 0
    for q in questions:
        label = q.get("label", "")
        req = bool(q.get("required"))
        f = (q.get("fields") or [{}])[0]
        if f.get("type") == "input_file":
            rows.append([label, "kit upload", req]); covered += 1; continue
        if HUMAN_ONLY.search(label):
            rows.append([label, "HUMAN (deliberate)", req])
            if req: manual.append(label)
            continue
        rule = next((r for r in rules if re.search(r["match"], label, re.I)), None)
        if rule:
            ans = (rule.get("opts") or [rule.get("v") or rule.get("freeText")])[0]
            rows.append([label, f"rule: {str(ans)[:40]}", req]); covered += 1
        elif any(re.search(b, label, re.I) for b in BUILTINS):
            rows.append([label, "builtin/profile", req]); covered += 1
        else:
            rows.append([label, "NO RULE", req])
            if req: manual.append(label)
    return rows, manual, covered


def browser_audit(url):
    """READ-ONLY headless enumeration of the live form (preflight_browser.mjs).
    Never fills, never submits, never logs in. Returns the parsed JSON or None."""
    try:
        r = subprocess.run(["node", os.path.join(HERE, "preflight_browser.mjs"), url],
                           capture_output=True, text=True, timeout=120)
        return json.loads(r.stdout) if r.stdout.strip() else None
    except Exception:
        return None


def as_questions(fields):
    """Browser field dumps -> the Greenhouse question shape coverage() expects."""
    qs, seen = [], set()
    for f in fields or []:
        key = f["label"].lower()
        if key in seen:
            continue
        seen.add(key)
        ftype = "input_file" if f.get("type") == "file" else f.get("type", "text")
        qs.append({"label": f["label"], "required": bool(f.get("required")),
                   "fields": [{"type": ftype, "values": [{"label": o} for o in f.get("options", [])]}]})
    return qs


def live_audit(kit):
    """Audit the form in the USER's real logged-in Chrome via the JobFill command
    channel (open tab -> read-only audit -> result via /event). Beats every bot
    and account wall because it IS the human's browser. Returns fields or None."""
    import time
    base = "http://127.0.0.1:7777"

    def post(path, obj):
        req = urllib.request.Request(base + path, data=json.dumps(obj).encode(),
                                     headers={"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=10).read()
        except Exception:
            pass

    def wait_for(action, tries=15):
        for _ in range(tries):
            time.sleep(3)
            ev = get(base + "/events/latest") or {}
            cmd = ev.get("command") or {}
            if ev.get("outcome") == "command_result" and cmd.get("action") == action:
                return ev.get("result") or {}
        return None

    url = (kit.get("preflight") or {}).get("direct_url") or kit.get("url") or ""
    if not url.startswith("http"):
        return None
    post("/command", {"action": "open", "url": url})
    opened = wait_for("open", tries=6) or {}
    tab_id = opened.get("tabId")  # thread the real tab id so audit hits the RIGHT tab
    time.sleep(5)  # let the tab render (and any login session apply)
    post("/command", {"action": "audit", "kitId": kit["id"], "tabId": tab_id})
    return wait_for("audit")


def run(kit, tracker, live=False):
    if live:
        rules = json.load(open(os.path.join(HERE, "jobfill", "rules.json")))
        result = {"date": date.today().isoformat(), "ats": "live-browser",
                  "status": "unsupported", "covered": 0, "total": 0, "manual": []}
        b = live_audit(kit)
        qs = as_questions((b or {}).get("fields"))
        real = any(re.search(r"resume|\bcv\b|first name|last name|e-?mail|phone", x["label"], re.I)
                   for x in qs)
        if qs and real:
            rows, manual, covered = coverage(qs, rules)
            hard_gaps = [m for m in manual if not HUMAN_ONLY.search(m)]
            result.update(total=len(qs), covered=covered, manual=manual,
                          status="ready" if not hard_gaps else "gaps",
                          direct_url=(b or {}).get("url"), questions=rows)
        elif b is not None:
            result["status"] = "account_wall"  # page reached, no real form visible yet
            result["direct_url"] = (b or {}).get("url")
        out = os.path.join(HERE, "applications", kit["id"], "preflight.json")
        json.dump(result, open(out, "w"), indent=1)
        kit["preflight"] = {k: result[k] for k in ("date", "status", "ats", "covered", "total", "manual") if k in result}
        if result.get("direct_url"):
            kit["preflight"]["direct_url"] = result["direct_url"]
        print(f"{kit['id'][:44]:44} {result['status']:12} {result['covered']}/{result['total']} (live)")
        return result
    return _run_headless(kit, tracker)


def _run_headless(kit, tracker):
    kid = kit["id"]
    rules = json.load(open(os.path.join(HERE, "jobfill", "rules.json")))
    result = {"date": date.today().isoformat(), "ats": None, "status": "unsupported",
              "covered": 0, "total": 0, "manual": []}
    board, jid = resolve_greenhouse(kit)
    if board:
        d = get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{jid}?questions=true")
        qs = (d or {}).get("questions", [])
        rows, manual, covered = coverage(qs, rules)
        hard_gaps = [m for m in manual if not HUMAN_ONLY.search(m)]
        result.update(ats="greenhouse", total=len(qs), covered=covered, manual=manual,
                      status="ready" if qs and not hard_gaps else ("gaps" if qs else "unsupported"),
                      direct_url=(d or {}).get("absolute_url"), questions=rows)
    else:
        ats, url = probe_other(kit)
        if ats:
            result.update(ats=ats, status="no_form_api", direct_url=url)
        # No form API anywhere -> audit the live page itself, read-only.
        target = (kit.get("preflight") or {}).get("direct_url") or url or kit.get("url") or ""
        b = browser_audit(target) if target.startswith("http") else None
        qs = as_questions((b or {}).get("fields"))
        # a REAL application form has identity fields - never grade nav/search chrome
        real = any(re.search(r"resume|\bcv\b|first name|last name|e-?mail|phone", x["label"], re.I)
                   for x in qs)
        if b and qs and real:
            rows, manual, covered = coverage(qs, rules)
            hard_gaps = [m for m in manual if not HUMAN_ONLY.search(m)]
            result.update(ats=result["ats"] or "browser", total=len(qs), covered=covered,
                          manual=manual, status="ready" if not hard_gaps else "gaps",
                          direct_url=b.get("finalUrl") or result.get("direct_url"), questions=rows)
        elif b:
            wall = b.get("wall") or ("none-found" if not real else None)
            result.update(ats=result["ats"] or "browser",
                          status={"login": "login_wall", "captcha": "blocked"}.get(wall, "account_wall"),
                          direct_url=b.get("finalUrl") or result.get("direct_url"))
    out = os.path.join(HERE, "applications", kid, "preflight.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(result, open(out, "w"), indent=1)
    kit["preflight"] = {k: result[k] for k in ("date", "status", "ats", "covered", "total", "manual") if k in result}
    if result.get("direct_url"):
        kit["preflight"]["direct_url"] = result["direct_url"]
    print(f"{kid[:44]:44} {result['status']:12} {result['covered']}/{result['total']}"
          + (f"  human/manual: {len(result['manual'])}" if result["manual"] else ""))
    return result


def main():
    t = json.load(open(TRACKER))
    apps = t["applications"]
    args = [a for a in sys.argv[1:] if a != "--live"]
    live = "--live" in sys.argv
    if args and args[0] != "--all":
        targets = [a for a in apps if a["id"] == args[0]]
        if not targets:
            sys.exit(f"kit not found: {args[0]}")
    else:
        targets = [a for a in apps if a.get("status") == "kit_ready"]
    for kit in targets:
        run(kit, t, live=live)
    t["updated"] = date.today().isoformat()
    json.dump(t, open(TRACKER, "w"), indent=2)


if __name__ == "__main__":
    main()
