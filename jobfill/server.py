#!/usr/bin/env python3
"""JobFill local server - feeds the JobFill Chrome extension and receives events.

Binds 127.0.0.1:7777 ONLY (never exposed). Endpoints:
  GET  /profile            -> {identity, apply_answers}  (from profile.json)
  GET  /kits               -> [{id, company, title, url, status, score}]  (kit_ready + planned)
  GET  /kit/<id>/resume    -> resume.pdf bytes (kit resume, falls back to resume-bunlong.pdf)
  GET  /kit/<id>/cover     -> cover-letter.md text
  POST /event              -> {id, outcome: "filled"|"submitted", url?, fields?}
                              logs to applications/<id>/ext-events.jsonl;
                              outcome "submitted" flips tracker status -> applied + applied_at

Run:  python3 ~/Sites/job/jobfill/server.py   (Ctrl-C to stop)
"""
import html as html_mod
import json, os, re, subprocess, threading
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.expanduser("~/Sites/job")
APPS = os.path.join(BASE, "applications")
TRACKER = os.path.join(APPS, "tracker.json")
PORT = 7777


def load(p):
    with open(p) as f:
        return json.load(f)


def _stickies_token():
    """Mint once at server start: env, then ~/.claude/settings.local.json env block."""
    tok = os.environ.get("STICKIES_TOKEN")
    if tok:
        return tok
    for f in ("settings.local.json", "settings.json"):
        try:
            s = load(os.path.join(os.path.expanduser("~/.claude"), f))
            tok = (s.get("env", {}) or {}).get("STICKIES_TOKEN") or s.get("STICKIES_TOKEN")
            if tok:
                return tok
        except Exception:
            pass
    return None


STICKIES_TOKEN = _stickies_token()


def _logo_b64():
    """App icon as a data URI for report headers (48px, few KB). Best-effort."""
    try:
        import base64
        p = os.path.join(BASE, "jobfill", "extension", "icon48.png")
        return "data:image/png;base64," + base64.b64encode(open(p, "rb").read()).decode()
    except Exception:
        return ""


LOGO = _logo_b64()


def _md_inline(s):
    s = html_mod.escape(s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`([^`]+)`", r'<code style="background:#f6f8fa;padding:1px 5px;border-radius:4px;font-size:12px">\1</code>', s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2" style="color:#0969da;text-decoration:none">\1</a>', s)
    return s


def _md_html(text):
    """Tiny markdown -> HTML (headings, bold, lists, tables, links) - enough to
    render resume.md / cover-letter.md / screening.md cleanly. Stdlib only."""
    lines = (text or "").split("\n")
    out, i = [], 0
    while i < len(lines):
        ln = lines[i]
        if "|" in ln and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:|-]+\|?\s*$", lines[i + 1]):
            head = [c.strip() for c in ln.strip().strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and "|" in lines[i]:
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            th = "".join(f'<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #d0d7de;color:#57606a;font-size:12px">{html_mod.escape(c)}</th>' for c in head)
            trs = "".join("<tr>" + "".join(f'<td style="padding:6px 10px;border-bottom:1px solid #eaecef;font-size:13px">{_md_inline(c)}</td>' for c in r) + "</tr>" for r in rows)
            out.append(f'<table style="border-collapse:collapse;width:100%;margin:8px 0">{("<thead><tr>"+th+"</tr></thead>")}<tbody>{trs}</tbody></table>')
            continue
        m = re.match(r"^(#{1,4})\s+(.*)", ln)
        if m:
            sz = {1: 20, 2: 16, 3: 14, 4: 13}[len(m.group(1))]
            out.append(f'<div style="font-size:{sz}px;font-weight:700;margin:14px 0 4px;color:#1f2328">{_md_inline(m.group(2))}</div>')
            i += 1
            continue
        if re.match(r"^\s*[-*]\s+", ln):
            items = []
            while i < len(lines) and re.match(r"^\s*[-*]\s+", lines[i]):
                item_txt = re.sub(r"^\s*[-*]\s+", "", lines[i])
                items.append(f'<li style="margin:2px 0">{_md_inline(item_txt)}</li>')
                i += 1
            out.append(f'<ul style="margin:6px 0;padding-left:20px;font-size:13px;line-height:1.6;color:#1f2328">{"".join(items)}</ul>')
            continue
        if ln.strip():
            out.append(f'<p style="margin:6px 0;font-size:13px;line-height:1.6;color:#1f2328">{_md_inline(ln)}</p>')
        i += 1
    return "".join(out)


def render_job_detail(kid):
    """Full drill-down for ONE application: everything captured + the tailored
    resume + cover version for THAT job + what was actually submitted."""
    esc = lambda x: html_mod.escape(str(x if x is not None else ""))
    kid = os.path.basename(kid)
    d = os.path.join(APPS, kid)
    tracker = load(TRACKER)
    entry = next((a for a in tracker.get("applications", []) if a.get("id") == kid), None)
    if not entry and not os.path.isdir(d):
        return f"<h1>Not found</h1><p>No application '{esc(kid)}'</p>", 404
    entry = entry or {"id": kid}

    def read(f):
        try:
            return open(os.path.join(d, f)).read()
        except Exception:
            return ""

    STBG = {"applied": ("#dafbe1", "#1a7f37"), "kit_ready": ("#ddf4ff", "#0969da"),
            "rejected": ("#ffebe9", "#cf222e"), "interviewing": ("#fbefff", "#8250df"),
            "manual_only": ("#fff8c5", "#9a6700"), "planned": ("#f6f8fa", "#57606a")}
    st = entry.get("status", "planned")
    sbg, sfg = STBG.get(st, STBG["planned"])
    pf = entry.get("preflight") or {}
    url = entry.get("url") or ""

    def section(title, body, sub=""):
        if not body:
            return ""
        sub_html = f'<span style="font-size:12px;color:#8c959f;font-weight:400;margin-left:8px">{esc(sub)}</span>' if sub else ""
        return (f'<div style="background:#fff;border:1px solid #d0d7de;border-radius:12px;padding:18px 22px;margin-bottom:14px">'
                f'<h2 style="font-size:15px;font-weight:700;margin:0 0 10px;color:#1f2328">{esc(title)}{sub_html}</h2>{body}</div>')

    # resume: prefer the tailored resume.md for this job; note if only master pdf
    resume_md = read("resume.md")
    resume_body = _md_html(resume_md) if resume_md else ""
    if not resume_body and os.path.exists(os.path.join(d, "resume.pdf")):
        resume_body = '<p style="font-size:13px;color:#57606a">This kit used the master resume PDF (no per-job tailored markdown). '\
                      f'<a href="/job/{esc(kid)}/file/resume.pdf" style="color:#0969da">Open resume.pdf</a></p>'
    elif not resume_body:
        resume_body = '<p style="font-size:13px;color:#8c959f">Used master resume (resume-bunlong.pdf).</p>'

    cover_body = _md_html(read("cover-letter.md"))
    screening_body = _md_html(read("screening.md"))

    # what was actually submitted / filled
    submitted_body = ""
    sub = read("submitted-answers.json")
    fields = []
    if sub:
        try:
            fields = json.loads(sub).get("fields", [])
        except Exception:
            pass
    if not fields:
        for ln in read("ext-events.jsonl").splitlines()[::-1]:
            try:
                e = json.loads(ln)
                if e.get("fields"):
                    fields = e["fields"]
                    break
            except Exception:
                pass
    if fields:
        rows = ""
        for f in fields:
            lab = esc(f[0] if isinstance(f, (list, tuple)) else f.get("label", ""))
            val = esc((f[1] if isinstance(f, (list, tuple)) else f.get("value", "")))
            rows += f'<tr><td style="padding:6px 10px;border-bottom:1px solid #eaecef;color:#57606a;font-size:12px;width:42%">{lab}</td><td style="padding:6px 10px;border-bottom:1px solid #eaecef;font-size:13px">{val}</td></tr>'
        submitted_body = f'<table style="border-collapse:collapse;width:100%">{rows}</table>'

    # timeline / meta
    meta = []
    if entry.get("applied_at"): meta.append(f'Applied {esc(entry["applied_at"])}')
    if entry.get("rejected_at"): meta.append(f'Rejected {esc(entry["rejected_at"])}')
    if pf.get("status"): meta.append(f'Preflight: {esc(pf["status"])}' + (f' {pf.get("covered")}/{pf.get("total")}' if pf.get("total") else ''))
    if entry.get("notes"): meta.append(esc(entry["notes"]))
    meta_html = '<div style="font-size:12px;color:#57606a;line-height:1.8">' + "<br>".join(meta) + '</div>' if meta else ""

    apply_btn = f'<a href="{esc(url)}" target="_blank" style="display:inline-block;background:#1a7f37;color:#fff;font-weight:700;font-size:13px;padding:8px 16px;border-radius:8px;text-decoration:none">Open apply page</a>' if url.startswith("http") else ""

    body = (
        f'<div style="max-width:900px;margin:0 auto;padding:24px 20px 60px">'
        f'<a href="/board" style="font-size:12px;color:#0969da;text-decoration:none">&larr; back to board</a>'
        f'<div style="background:#fff;border:1px solid #d0d7de;border-radius:12px;padding:22px 26px;margin:12px 0 14px">'
        f'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
        f'<div><div style="font-size:22px;font-weight:800;color:#1f2328">{esc(entry.get("company","?"))}</div>'
        f'<div style="font-size:15px;color:#57606a;margin-top:2px">{esc(entry.get("title",""))}</div></div>'
        f'<div style="text-align:right"><span style="background:{sbg};color:{sfg};font-weight:700;font-size:12px;padding:4px 12px;border-radius:8px;text-transform:uppercase">{esc(st)}</span>'
        f'<div style="font-size:22px;font-weight:800;color:#0969da;margin-top:6px">{esc(entry.get("score","-"))}</div></div></div>'
        f'<div style="margin-top:12px;display:flex;gap:10px;align-items:center">{apply_btn}</div>'
        f'{("<div style=margin-top:12px>"+meta_html+"</div>") if meta_html else ""}</div>'
        f'{section("Resume (this version)", resume_body)}'
        f'{section("Cover letter", cover_body)}'
        f'{section("Screening answers", screening_body)}'
        f'{section("What we submitted", submitted_body, f"{len(fields)} fields captured" if fields else "")}'
        f'</div>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{esc(entry.get("company",""))} - {esc(entry.get("title",""))}</title></head>'
            f'<body style="margin:0;background:#f6f8fa;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif">{body}</body></html>'), 200


def run_report_html(ev):
    """Per-run report in the zeta-pr-stats golden style (GitHub-light, tiles + table)."""
    esc = lambda x: html_mod.escape(str(x if x is not None else ""))
    fields = ev.get("fields") or []
    reds = [f for f in fields if str(f[1] if len(f) > 1 else "").startswith("MANUAL")]
    ok = len(fields) - len(reds)
    types = {}
    for f in fields:
        t = f[2] if len(f) > 2 else "?"
        types[t] = types.get(t, 0) + 1
    tiles = [("Fields", len(fields), "#0969da"), ("Filled", ok, "#1a7f37"),
             ("Need you", len(reds), "#cf222e" if reds else "#8a949e"),
             ("Outcome", esc(ev.get("outcome")), "#57606a")]
    tile_html = "".join(
        f'<div style="flex:1;min-width:100px;background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:12px 16px">'
        f'<div style="font-size:24px;font-weight:700;color:{c}">{v}</div>'
        f'<div style="font-size:12px;color:#8a949e;margin-top:2px">{t}</div></div>'
        for t, v, c in tiles)
    rows = ""
    for f in fields:
        label, val = esc(f[0]), str(f[1] if len(f) > 1 else "")
        typ = esc(f[2] if len(f) > 2 else "?")
        opts = f[3] if len(f) > 3 else []
        bad = val.startswith("MANUAL")
        opt_line = (f'<div style="color:#8a949e;font-size:11px;margin-top:2px">{esc(" | ".join(map(str, opts))[:160])}</div>'
                    if opts else "")
        rows += (f'<tr style="border-top:1px solid #eef1f4"><td style="padding:6px 10px;white-space:nowrap">'
                 f'<span style="background:#eef1f4;color:#57606a;border-radius:4px;padding:1px 6px;font-size:11px">{typ}</span></td>'
                 f'<td style="padding:6px 10px;color:{"#cf222e" if bad else "#1a7f37"};font-weight:600">{esc(val)[:70]}</td>'
                 f'<td style="padding:6px 10px;color:#57606a">{label}{opt_line}</td></tr>')
    type_line = " · ".join(f"{n} {t}" for t, n in types.items())
    # Diagnostics: every failure's label + options + raw HTML, so the fix for
    # next time can be written straight from this report - no second trip.
    diag = ""
    if ev.get("debug"):
        items = ""
        for dd in ev["debug"]:
            opts_line = (f'<div style="color:#57606a;font-size:12px;margin:4px 0">options: '
                         f'{esc(" | ".join(map(str, dd.get("options") or [])) or "(none appeared)")}</div>')
            html_block = (f'<pre style="background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;'
                          f'padding:8px;font-size:10px;overflow-x:auto;white-space:pre-wrap;word-break:break-all">'
                          f'{esc(dd.get("html", ""))}</pre>') if dd.get("html") else ""
            items += (f'<div style="margin-bottom:10px"><b style="font-size:13px;color:#cf222e">'
                      f'{esc(dd.get("label"))}</b>{opts_line}{html_block}</div>')
        diag = (f'<h3 style="margin:22px 0 8px;font-size:14px">Diagnostics (for rule fixes)</h3>'
                f'<div style="background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:12px">{items}</div>')
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JobFill Run - {esc(ev.get('id'))}</title></head>
<body style="margin:0;background:#f6f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2328">
<div style="max-width:760px;margin:0 auto;padding:24px 16px">
<h1 style="font-size:18px;margin:0 0 4px">{'<img src="' + LOGO + '" width="22" height="22" style="vertical-align:-4px;margin-right:7px">' if LOGO else ''}JobFill Run - {esc(ev.get('id'))}</h1>
<div style="color:#8a949e;font-size:12px;margin-bottom:14px">{esc(ev.get('stamp'))} · {esc(type_line)} · <a href="{esc(ev.get('url'))}" style="color:#0969da;text-decoration:none">form</a></div>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">{tile_html}</div>
<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #d0d7de;border-radius:8px;overflow:hidden;font-size:13px">
<thead><tr style="background:#f6f8fa;color:#8a949e;font-size:11px;text-align:left">
<th style="padding:6px 10px">Type</th><th style="padding:6px 10px">Value / Issue</th><th style="padding:6px 10px">Field (options)</th></tr></thead>
<tbody>{rows}</tbody></table>
{diag}
<div style="margin-top:16px;color:#8a949e;font-size:11px">JobFill · auto-posted per run · read-only report</div>
</div></body></html>"""


def enrich_event(ev):
    """Reports must always be helpful: an event without field data (e.g. a
    'submitted' ping) inherits the richest matching fill for its kit, so the
    sticky never regresses to an empty 0-field report. Fill events are matched
    to the kit's own job id (from tracker URL) to avoid cross-kit leakage."""
    if ev.get("fields"):
        return ev
    kit = os.path.basename(str(ev.get("id", "")))
    p = os.path.join(APPS, kit, "ext-events.jsonl")
    if not os.path.exists(p):
        return ev
    jid = None
    try:
        u = next(a.get("url", "") for a in load(TRACKER)["applications"] if a["id"] == kit)
        m = re.search(r"(\d{6,})", u or "")
        jid = m.group(1) if m else None
    except Exception:
        pass
    best = None
    for e in (json.loads(ln) for ln in open(p) if ln.strip()):
        if not e.get("fields"):
            continue
        if jid and e.get("url") and jid not in str(e.get("url")):
            continue
        if best is None or len(e["fields"]) >= len(best["fields"]):
            best = e
    if best:
        merged = dict(best)
        for k in ("outcome", "stamp", "note"):
            if k in ev:
                merged[k] = ev[k]
        merged["id"] = kit
        return merged
    return ev


def post_run_to_stickies(ev):
    """Best-effort: write the run HTML and post to the Jobs folder. Never raises."""
    ev = enrich_event(ev)
    try:
        if not STICKIES_TOKEN:
            return
        out = f"/tmp/jobfill-run-{os.path.basename(str(ev.get('id', 'unknown')))}.html"
        with open(out, "w") as f:
            f.write(run_report_html(ev))
        helper = os.path.expanduser("~/.claude/lib/stickies.py")
        env = {**os.environ, "STICKIES_TOKEN": STICKIES_TOKEN}
        subprocess.run(["python3", helper, out, "--title", f"JobFill Run - {str(ev.get('id', ''))[:48]}",
                        "--folder", "Jobs", "--icon", "BriefcaseIcon", "--color", "blue"],
                       env=env, capture_output=True, timeout=25)
    except Exception:
        pass


class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _origin_blocked(self):
        # No CORS headers are sent: the extension's background worker fetches via
        # host_permissions and never needs them. A web page DOES send an http(s)
        # Origin - refuse those outright so no site can probe this PII server.
        o = self.headers.get("Origin", "")
        if o.startswith("http://") or o.startswith("https://"):
            self._send(403, {"error": "browser pages may not call this server"})
            return True
        return False

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_GET(self):
        if self._origin_blocked():
            return
        parts = [p for p in self.path.split("?")[0].split("/") if p]
        try:
            if parts == ["profile"]:
                p = load(os.path.join(BASE, "profile.json"))
                return self._send(200, {"identity": p.get("identity", {}),
                                        "apply_answers": p.get("apply_answers", {})})
            if parts == ["rules"]:
                # answer-rule overlay the extension merges at fill time (server wins).
                # Fixing a rule here applies on the user's NEXT click - no extension reload.
                f = os.path.join(BASE, "jobfill", "rules.json")
                return self._send(200, load(f) if os.path.exists(f) else [])
            if parts == ["events", "latest"]:
                # REST read API for Claude: the most recent fill/submit event across all kits
                latest, lpath = None, None
                for kit in os.listdir(APPS):
                    p = os.path.join(APPS, kit, "ext-events.jsonl")
                    if os.path.exists(p) and (lpath is None or os.path.getmtime(p) > os.path.getmtime(lpath)):
                        lpath = p
                if lpath:
                    lines = [ln for ln in open(lpath) if ln.strip()]
                    if lines:
                        latest = json.loads(lines[-1])
                return self._send(200, latest or {"note": "no events yet"})
            if parts == ["errors"]:
                # errors-only view of the latest event - what Claude needs to write fixes
                latest, lpath = None, None
                for kit in os.listdir(APPS):
                    p = os.path.join(APPS, kit, "ext-events.jsonl")
                    if os.path.exists(p) and (lpath is None or os.path.getmtime(p) > os.path.getmtime(lpath)):
                        lpath = p
                if lpath:
                    lines = [ln for ln in open(lpath) if ln.strip()]
                    if lines:
                        latest = json.loads(lines[-1])
                if not latest:
                    return self._send(200, {"note": "no events yet"})
                reds = [f for f in (latest.get("fields") or []) if str(f[1] if len(f) > 1 else "").startswith("MANUAL")]
                return self._send(200, {"kit": latest.get("id"), "outcome": latest.get("outcome"),
                                        "stamp": latest.get("stamp"), "errors": reds,
                                        "debug": latest.get("debug", [])})
            if len(parts) == 2 and parts[0] == "report":
                # full-page run report (zeta-pr-stats style) for a kit's latest event
                p = os.path.join(APPS, os.path.basename(parts[1]), "ext-events.jsonl")
                if not os.path.exists(p):
                    return self._send(404, {"error": "no events for kit"})
                lines = [ln for ln in open(p) if ln.strip()]
                ev = enrich_event(json.loads(lines[-1])) if lines else {}
                return self._send(200, run_report_html(ev).encode(), "text/html; charset=utf-8")
            if parts == ["commands", "poll"]:
                # extension polls this; pending commands are returned once
                cp = os.path.join(BASE, "jobfill", "commands.jsonl")
                pending, kept = [], []
                if os.path.exists(cp):
                    for ln in open(cp):
                        if not ln.strip():
                            continue
                        c = json.loads(ln)
                        if c.get("status") == "pending":
                            pending.append(c)
                            c["status"] = "delivered"
                        kept.append(c)
                    with open(cp, "w") as f:
                        for c in kept:
                            f.write(json.dumps(c) + "\n")
                return self._send(200, pending)
            if len(parts) == 2 and parts[0] == "job":
                # drill-down detail page for one application
                html, code = render_job_detail(parts[1])
                return self._send(code, html.encode(), "text/html; charset=utf-8")
            if len(parts) == 4 and parts[0] == "job" and parts[2] == "file":
                # serve a kit file (resume.pdf, cover-letter.pdf) for the detail page
                fp = os.path.join(APPS, os.path.basename(parts[1]), os.path.basename(parts[3]))
                if os.path.exists(fp):
                    ctype = "application/pdf" if fp.endswith(".pdf") else "text/plain; charset=utf-8"
                    return self._send(200, open(fp, "rb").read(), ctype)
                return self._send(404, {"error": "file not found"})
            if parts == ["board"]:
                # ALWAYS-UP local pipeline page: renders the /job report HTML straight
                # from tracker.json (zero tokens, no skill run). Regenerates on each
                # load so it is always live; 3s cache absorbs refresh spam.
                import time
                cache = getattr(self.server, "_board_cache", None)
                now = time.time()
                if cache and now - cache[0] < 3:
                    return self._send(200, cache[1], "text/html; charset=utf-8")
                report = os.path.expanduser("~/.claude/skills/job/report.py")
                out_html = f"/tmp/job-pipeline-{date.today().isoformat()}.html"
                try:
                    subprocess.run(["python3", report, "--no-open", "--no-stickies"],
                                   capture_output=True, timeout=30)
                    html_bytes = open(out_html, "rb").read()
                except Exception as e:
                    html_bytes = (f"<h1>board error</h1><pre>{html_mod.escape(str(e))}</pre>").encode()
                self.server._board_cache = (now, html_bytes)
                return self._send(200, html_bytes, "text/html; charset=utf-8")
            if parts == ["kits"]:
                t = load(TRACKER)
                out = [{k: a.get(k) for k in ("id", "company", "title", "url", "status", "score")}
                       for a in t.get("applications", [])
                       if a.get("status") in ("kit_ready", "planned")]
                return self._send(200, out)
            if len(parts) == 3 and parts[0] == "kit":
                jid, what = parts[1], parts[2]
                d = os.path.join(APPS, os.path.basename(jid))  # basename: no path escape
                if what == "resume":
                    for c in (os.path.join(d, "resume.pdf"), os.path.join(BASE, "resume-bunlong.pdf")):
                        if os.path.exists(c):
                            return self._send(200, open(c, "rb").read(), "application/pdf")
                    return self._send(404, {"error": "no resume"})
                if what == "cover":
                    f = os.path.join(d, "cover-letter.md")
                    if os.path.exists(f):
                        return self._send(200, open(f, "rb").read(), "text/plain; charset=utf-8")
                    return self._send(404, {"error": "no cover"})
            return self._send(404, {"error": "unknown route"})
        except Exception as e:
            return self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def do_POST(self):
        if self._origin_blocked():
            return
        route = self.path.split("?")[0]
        if route == "/command":
            # Claude (or anything local) enqueues a command for the extension:
            #   {"action": "fill", "kitId": "..."} | {"action": "ping"}
            try:
                n = int(self.headers.get("Content-Length", 0))
                cmd = json.loads(self.rfile.read(n) or b"{}")
                cmd["status"] = "pending"
                cmd["queued"] = date.today().isoformat()
                cp = os.path.join(BASE, "jobfill", "commands.jsonl")
                with open(cp, "a") as f:
                    f.write(json.dumps(cmd) + "\n")
                return self._send(200, {"ok": True, "queued": cmd})
            except Exception as e:
                return self._send(500, {"error": f"{type(e).__name__}: {e}"})
        if route != "/event":
            return self._send(404, {"error": "unknown route"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            ev = json.loads(self.rfile.read(n) or b"{}")
            jid = os.path.basename(str(ev.get("id", "")))
            if not jid:
                return self._send(400, {"error": "missing id"})
            d = os.path.join(APPS, jid)
            os.makedirs(d, exist_ok=True)
            ev["stamp"] = date.today().isoformat()
            with open(os.path.join(d, "ext-events.jsonl"), "a") as f:
                f.write(json.dumps(ev) + "\n")
            if ev.get("outcome") in ("filled", "submitted"):
                threading.Thread(target=post_run_to_stickies, args=(ev,), daemon=True).start()
            flipped = False
            if ev.get("outcome") == "submitted":
                t = load(TRACKER)
                for a in t.get("applications", []):
                    if a.get("id") == jid and a.get("status") != "applied":
                        a["status"], a["applied_at"], flipped = "applied", ev["stamp"], True
                if flipped:
                    t["updated"] = ev["stamp"]
                    json.dump(t, open(TRACKER, "w"), indent=2)
                # permanent record: snapshot exactly what was submitted for later reference
                snap = enrich_event(dict(ev))
                json.dump({"submitted_at": ev["stamp"], "url": snap.get("url"),
                           "fields": snap.get("fields", [])},
                          open(os.path.join(d, "submitted-answers.json"), "w"), indent=1)
            return self._send(200, {"ok": True, "tracker_updated": flipped})
        except Exception as e:
            return self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def log_message(self, fmt, *args):  # quiet
        pass


if __name__ == "__main__":
    print(f"JobFill server on http://127.0.0.1:{PORT}  (Ctrl-C to stop)")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
