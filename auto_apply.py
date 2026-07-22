#!/usr/bin/env python3
"""DEPRECATED (2026-07-21): superseded by jobfill/ (server + Chrome extension).
Use the JobFill flow instead - this headless path hit captcha walls and produced
junk submissions. Kept for reference only.

auto_apply.py - run the headless auto-apply bot for ONE job, then log it.

For each job it:
  1. runs apply_bot.mjs <id> [--url URL] --auto  (headless fill + gated submit)
  2. reads applications/<id>/apply-log.json (the full copy of submitted values)
  3. updates tracker.json (applied if submitted; records outcome either way)
  4. posts ONE Stickies receipt note per job (proof it happened + what was sent)

Usage: python3 auto_apply.py <job-id> [apply-url]
Bunlong authorized autonomous submission on 2026-07-14 with full logging + a
Stickies note per job. Every run leaves an audit trail he can verify later.
"""
import subprocess, json, os, sys, html, datetime, base64

HOME = os.path.expanduser("~")
JOB = f"{HOME}/Sites/job"
jid = sys.argv[1]
url = sys.argv[2] if len(sys.argv) > 2 else None
d = f"{JOB}/applications/{jid}"
os.makedirs(d, exist_ok=True)

# 1) run the headless bot in FILL-ONLY mode: fills + screenshots, never submits
# (you click the final Submit yourself - no bot signature = no spam-flag).
cmd = ["node", f"{JOB}/apply_bot.mjs", jid]
if url:
    cmd += ["--url", url]
cmd += ["--fill-only"]
print(f"running: {' '.join(cmd)}")
try:
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    print(out.stdout[-1500:])
    if out.stderr.strip():
        print("stderr:", out.stderr[-400:])
except subprocess.TimeoutExpired:
    print("bot timed out (180s)")

# 2) read the audit log
log = {}
try:
    log = json.load(open(f"{d}/apply-log.json"))
except Exception as e:
    log = {"id": jid, "outcome": "no_log", "fields": [], "error": str(e)}
outcome = log.get("outcome", "unknown")
submitted = outcome == "submitted"

# 3) update tracker
tp = f"{JOB}/applications/tracker.json"
try:
    t = json.load(open(tp))
    apps = t.get("applications", t)
    lst = apps if isinstance(apps, list) else list(apps.values())
    now = datetime.datetime.now().strftime("%Y-%m-%d")
    hit = next((a for a in lst if a.get("id") == jid), None)
    if hit is None:
        hit = {"id": jid, "title": jid, "company": "", "score": None}
        if isinstance(apps, list):
            apps.append(hit)
        else:
            apps[jid] = hit
    if submitted:
        hit["status"] = "applied"; hit["applied_at"] = now
    else:
        hit["status"] = hit.get("status", "kit_ready")
    hit["auto_outcome"] = outcome
    hit["apply_log"] = f"applications/{jid}/apply-log.json"
    t["updated"] = now
    json.dump(t, open(tp, "w"), indent=2)
    company = hit.get("company", "") or jid
    title = hit.get("title", "") or jid
    score = hit.get("score", "")
except Exception as e:
    company, title, score = jid, jid, ""
    print("tracker update issue:", e)

# 4) build + post a Stickies receipt (div-rooted, house Primer style)
# CLEAR wording: only "submitted" means the application was sent. Everything else is
# a NOT-SUBMITTED state (nothing reached the employer) - never the word "rejected".
miss = log.get("required_missing", [])
why = ", ".join(miss)[:180] if miss else ""
INFO = {
  "ready_to_submit":    ("#1a7f37", "#dafbe1", "READY - you submit",   "All required fields filled + resume attached. Review the screenshot below, then click Submit yourself (a human click dodges the anti-bot spam-flag). Nothing sent yet."),
  "filled_incomplete":  ("#9a6700", "#fff8c5", "NOT READY",            f"Filled, but required fields are still blank ({why or 'unknown'}) - fill those in before submitting. Nothing sent."),
  "submitted":          ("#1a7f37", "#dafbe1", "SUBMITTED",            "Application was sent to the employer."),
  "blocked_incomplete": ("#9a6700", "#fff8c5", "NOT SUBMITTED",        f"The form blocked submission - a required field was empty/invalid ({why or 'unknown'}). Nothing was sent. NOT an employer decision."),
  "held_incomplete":    ("#9a6700", "#fff8c5", "NOT SUBMITTED (held)", f"Held before submitting - required fields still blank ({why or 'unknown'}). Nothing was sent."),
  "not_confirmed":      ("#bc4c00", "#ffe7d1", "NOT CONFIRMED",        "Clicked submit but could not confirm - verify manually."),
  "submit_failed":      ("#cf222e", "#ffebe9", "NOT SUBMITTED",        "The submit button could not be clicked. Nothing was sent."),
  "no_log":             ("#cf222e", "#ffebe9", "NO LOG",               "The bot did not produce a log - run may have errored."),
}.get(outcome, ("#57606a", "#eef1f4", outcome.upper(), ""))
badge = (INFO[0], INFO[1], INFO[2])
reason_line = INFO[3]
rows = ""
for f in log.get("fields", []):
    lab = html.escape(f.get("label", "")[:60]); val = html.escape(f.get("value", "")[:110])
    if not lab and not val:
        continue
    rows += (f'<tr style="border-top:1px solid #eaeef2"><td style="padding:5px 10px;color:#57606a;width:44%">{lab}</td>'
             f'<td style="padding:5px 10px;font-weight:600">{val}</td></tr>')
# embed the filled-form screenshot (resized so the note stays light)
img_html = ""
shot = f"{d}/apply-preview.png"
if os.path.exists(shot):
    small = f"/tmp/shot_{jid}.png"
    subprocess.run(["sips", "-Z", "760", shot, "--out", small], capture_output=True)
    src = small if os.path.exists(small) else shot
    try:
        b64 = base64.b64encode(open(src, "rb").read()).decode()
        img_html = (f'<div style="margin:14px 0 4px;font-size:12px;font-weight:700">Filled form (screenshot)</div>'
                    f'<img src="data:image/png;base64,{b64}" style="width:100%;border:1px solid #d0d7de;border-radius:8px;display:block">')
    except Exception:
        img_html = ""

# a plain-English reason banner (green if ready/sent, otherwise a clear "not yet" note)
good = submitted or outcome == "ready_to_submit"
banner_bg = "#dafbe1" if good else ("#ffe7d1" if outcome == "not_confirmed" else "#fff8c5")
banner_bd = "#a6e3b8" if good else ("#f0c9a8" if outcome == "not_confirmed" else "#f0e2a8")
banner_fg = "#1a7f37" if good else ("#8a3d00" if outcome == "not_confirmed" else "#7a5c00")
miss_html = (f'<div style="margin:10px 0;padding:11px 13px;background:{banner_bg};border:1px solid {banner_bd};'
             f'border-radius:8px;font-size:12.5px;color:{banner_fg};line-height:1.5"><b>What this means:</b> {html.escape(reason_line)}</div>')
stamp = log.get("stamp", "")[:19].replace("T", " ")
node = (f'<div style="background:#f6f8fa;color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;padding-bottom:1px">'
        f'<div style="max-width:760px;margin:0 auto;padding:18px 16px">'
        f'<div style="display:inline-block;font-size:11px;font-weight:700;color:#0969da;background:#ddf4ff;border:1px solid #b6e3ff;border-radius:20px;padding:3px 12px">auto-apply receipt</div>'
        f'<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-top:12px">'
        f'<div><div style="font-size:19px;font-weight:800">{html.escape(str(company))}</div>'
        f'<div style="font-size:13px;color:#57606a">{html.escape(str(title))}{"  &middot; score "+str(score) if score else ""}</div></div>'
        f'<span style="font-size:11px;font-weight:800;color:{badge[0]};background:{badge[1]};border-radius:20px;padding:4px 12px">{badge[2]}</span></div>'
        f'<div style="font-size:12px;color:#8a949e;margin:6px 0 12px">{stamp} &middot; resume {"uploaded" if log.get("resume_uploaded") else "MISSING"} &middot; required {log.get("required_total",0)-len(miss)}/{log.get("required_total",0)}</div>'
        f'{miss_html}'
        f'<div style="font-size:12px;font-weight:700;margin:8px 0 4px">Filled values (full copy)</div>'
        f'<div style="background:#fff;border:1px solid #d0d7de;border-radius:10px;overflow:hidden">'
        f'<table style="width:100%;border-collapse:collapse;font-size:12.5px">{rows or "<tr><td style=padding:8px;color:#8a949e>no fields captured</td></tr>"}</table></div>'
        f'{img_html}'
        f'<div style="font-size:11px;color:#8a949e;margin-top:10px">Log: applications/{html.escape(jid)}/apply-log.json &middot; url: {html.escape(str(log.get("url","")))[:80]}</div>'
        f'</div></div>')
tmp = f"/tmp/apply-receipt-{jid}.html"
open(tmp, "w").write(node)
title_txt = f"Applied - {str(company)[:34]}" if submitted else f"Not submitted - {str(company)[:28]}"
r = subprocess.run(["python3", f"{HOME}/.claude/lib/stickies.py", tmp, "--title", title_txt, "--folder", "Jobs", "--color", "blue"],
                   capture_output=True, text=True)
print("stickies:", r.stdout.strip() or r.stderr.strip())
print("\n" + "=" * 60)
print(f"RESULT for {jid}:")
print(f"  {'SUBMITTED - application sent' if submitted else 'NOT SUBMITTED - nothing was sent to the employer'}")
print(f"  reason: {reason_line}")
if miss:
    print(f"  blocked fields: {', '.join(miss)[:200]}")
print("=" * 60)
