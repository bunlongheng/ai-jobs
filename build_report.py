import json, os, re, hashlib, base64, urllib.request
from collections import Counter

d = json.load(open(os.path.expanduser("~/Sites/job/jobs/latest.json")))
jobs = d["jobs"]; ts = d["run"]
cnt = Counter(j["verdict"] for j in jobs)
src = Counter(j.get("source", "ats") for j in jobs)

GENERIC = "b8a0bf372c762e966cc99ede8682bc71"
KNOWN = {
 "coinbase":"coinbase.com","optum":"optum.com","discord":"discord.com","reddit":"reddit.com",
 "twilio":"twilio.com","home depot":"homedepot.com","home depot thd":"homedepot.com","everforth":"everforth.com",
 "epam":"epam.com","epam systems":"epam.com","abbott":"abbott.com","abbott laboratories":"abbott.com",
 "stripe":"stripe.com","figma":"figma.com","vercel":"vercel.com","cloudflare":"cloudflare.com",
 "databricks":"databricks.com","dropbox":"dropbox.com","airtable":"airtable.com","robinhood":"robinhood.com",
 "asana":"asana.com","postman":"postman.com","ramp":"ramp.com","linear":"linear.app","vanta":"vanta.com",
 "replit":"replit.com","supabase":"supabase.com","spotify":"spotify.com","elevenlabs":"elevenlabs.io",
 "openai":"openai.com","webflow":"webflow.com","seeq":"seeq.com","seeq corporation":"seeq.com",
 "greenlight":"greenlight.com","akkio":"akkio.com","hopper":"hopper.com","prime intellect":"primeintellect.ai",
 "by light professional":"bylight.com","redhorse":"redhorsecorp.com","redhorse corporation":"redhorsecorp.com",
 "novellia":"novellia.com","fin":"fin.com","polly":"polly.ai","pearly":"pearly.co",
}
STRIP = re.compile(r'\b(inc|llc|corp|corporation|co|ltd|systems|laboratories|technologies|professional|services|the|thd|group)\b')
def domain(name):
    n = re.sub(r'[^a-z0-9 ]',' ', (name or '').lower()).strip()
    if n in KNOWN: return KNOWN[n]
    key = STRIP.sub('', n)
    key = re.sub(r'\s+',' ', key).strip()
    if key in KNOWN: return KNOWN[key]
    slug = re.sub(r'[^a-z0-9]','', key)
    return slug + ".com" if slug else None

def favicon_b64(dom):
    if not dom: return None
    try:
        req = urllib.request.Request(f"https://www.google.com/s2/favicons?domain={dom}&sz=64",
                                     headers={"User-Agent":"Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=8).read()
        if len(data) < 120 or hashlib.md5(data).hexdigest() == GENERIC: return None
        return "data:image/png;base64," + base64.b64encode(data).decode()
    except Exception:
        return None

GRAD = [("#0969da","#8250df"),("#1a7f37","#1b9aaa"),("#bf3989","#8250df"),("#9a6700","#bf3989"),
        ("#0969da","#1b9aaa"),("#cf222e","#9a6700"),("#8250df","#bf3989"),("#1b9aaa","#1a7f37")]
def monogram(name):
    parts = [p for p in re.split(r'[^A-Za-z0-9]+', name or '') if p][:2]
    ini = "".join(p[0] for p in parts).upper() or "?"
    g = GRAD[int(hashlib.md5((name or '').encode()).hexdigest(),16) % len(GRAD)]
    return (f'<div style="width:38px;height:38px;border-radius:10px;flex:none;display:flex;align-items:center;'
            f'justify-content:center;font-weight:800;font-size:14px;color:#fff;'
            f'background:linear-gradient(135deg,{g[0]},{g[1]})">{ini}</div>')

logo_cache = {}
def logo(name):
    if name not in logo_cache:
        b = favicon_b64(domain(name))
        logo_cache[name] = (f'<img src="{b}" style="width:38px;height:38px;border-radius:10px;flex:none;'
                            f'background:#fff;border:1px solid #eaeef2;object-fit:contain;padding:3px" alt="">') if b else monogram(name)
    return logo_cache[name]

# real brand icons for the source badges (actual LinkedIn / Indeed favicons, embedded)
SRC_LOGO = {"linkedin": favicon_b64("linkedin.com"), "indeed": favicon_b64("indeed.com")}
SVG_ATS = '<svg width="12" height="12" viewBox="0 0 16 16" fill="#57606a"><path d="M2 2.5A2.5 2.5 0 014.5 0h7A1.5 1.5 0 0113 1.5v13a.5.5 0 01-.8.4L8 12l-4.2 2.9a.5.5 0 01-.8-.4V2.5z"/></svg>'
def srcbadge(s):
    col = {"linkedin":("#0a66c2","#e8f0fe"),"indeed":("#2557a7","#e8eefb")}.get(s,("#57606a","#eef1f4"))
    b = SRC_LOGO.get(s)
    ic = (f'<img src="{b}" style="width:13px;height:13px;border-radius:3px;object-fit:contain" alt="">'
          if b else SVG_ATS)
    return (f'<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;'
            f'color:{col[0]};background:{col[1]};border-radius:20px;padding:2px 8px">{ic}{s}</span>')

def vbadge(v):
    # color already encodes tier (green=priority > blue=apply > grey=skip) - no text label needed.
    # priority just gets a small star so the very top tier still pops.
    if v == "priority":
        return '<svg width="12" height="12" viewBox="0 0 16 16" fill="#1a7f37"><path d="M8 12l-4 2 1-4.5L1.5 6l4.5-.5L8 1l2 4.5 4.5.5L11 9.5 12 14z"/></svg>'
    return ""

def scorechip(s):
    if s>=85: c=("#1a7f37","#dafbe1")
    elif s>=70: c=("#0969da","#ddf4ff")
    else: c=("#57606a","#eef1f4")
    return (f'<div style="flex:none;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;'
            f'justify-content:center;font-weight:800;font-size:15px;color:{c[0]};background:{c[1]};'
            f'border:2px solid #fff;box-shadow:0 0 0 1px {c[0]}33">{s}</div>')

rows = ""
for j in [x for x in jobs if x["verdict"] != "skip"][:36]:
    sal = j.get("salary","n/a"); sal = "" if sal in ("n/a","") else sal
    salbadge = (f'<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;'
                f'color:#1a7f37;background:#dafbe1;border-radius:20px;padding:2px 9px">'
                f'<svg width="11" height="11" viewBox="0 0 16 16" fill="#1a7f37"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.9 12.2v.9a.9.9 0 01-1.8 0v-.9a2.8 2.8 0 01-2-1.6.9.9 0 011.6-.7c.2.5.7.8 1.3.8.7 0 1.2-.3 1.2-.8 0-.4-.3-.6-1.4-.9C6.5 8.6 5.3 8.1 5.3 6.6c0-1.1.8-1.9 1.8-2.2v-.9a.9.9 0 011.8 0v.9c.8.2 1.5.7 1.8 1.5a.9.9 0 11-1.7.6c-.1-.4-.5-.6-1-.6-.6 0-1 .3-1 .7 0 .3.3.5 1.4.8 1.3.4 2.4.9 2.4 2.4 0 1.1-.8 2-1.9 2.3z"/></svg>{sal}</span>') if sal else ""
    loc = (j.get("location") or "").strip()
    locbadge = (f'<span style="font-size:11px;color:#57606a;display:inline-flex;align-items:center;gap:3px">'
                f'<svg width="10" height="10" viewBox="0 0 16 16" fill="#8a949e"><path d="M8 0a5 5 0 00-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 00-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z"/></svg>{loc[:22]}</span>') if loc else ""
    reason = (j.get("reasons") or [""])[0]
    rows += (f'<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid #eaeef2">'
             f'{logo(j.get("company"))}'
             f'<div style="flex:1;min-width:0">'
             f'<a href="{j.get("url","#")}" style="color:#0d1117;text-decoration:none;font-weight:700;font-size:13.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{j.get("title","?")}</a>'
             f'<div style="font-size:12px;color:#57606a;margin:2px 0 5px">{j.get("company","?")}</div>'
             f'<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">{srcbadge(j.get("source","ats"))}{salbadge}{locbadge}</div>'
             f'</div>'
             f'<div style="display:flex;flex-direction:column;align-items:center;gap:5px">{scorechip(j["score"])}{vbadge(j["verdict"])}</div>'
             f'</div>')

def tile(num,label,c1,c2,ic):
    return (f'<div style="background:#fff;border:1px solid #d0d7de;border-radius:12px;padding:14px;position:relative;overflow:hidden">'
            f'<div style="position:absolute;top:-8px;right:-8px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,{c1},{c2});opacity:.12"></div>'
            f'<div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,{c1},{c2});display:flex;align-items:center;justify-content:center;margin-bottom:8px">{ic}</div>'
            f'<div style="font-size:26px;font-weight:800;line-height:1">{num}</div>'
            f'<div style="font-size:12px;color:#57606a;margin-top:2px">{label}</div></div>')

IC_TOTAL='<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M2 3h12v2H2zm0 4h12v2H2zm0 4h8v2H2z"/></svg>'
IC_STAR='<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M8 12l-4 2 1-4.5L1.5 6l4.5-.5L8 1l2 4.5 4.5.5L11 9.5 12 14z"/></svg>'
IC_CHECK='<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M6.5 11L3 7.5l1.2-1.2L6.5 8.6l5.3-5.3L13 4.5z"/></svg>'
IC_SKIP='<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zM4 8a4 4 0 016.5-3.1L4.9 10.5A3.9 3.9 0 014 8z"/></svg>'

html = f'''<div style="background:#f6f8fa;color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;padding-bottom:1px">
<div style="max-width:1040px;margin:0 auto;padding:0 0 48px">
<div style="background:linear-gradient(120deg,#0969da 0%,#8250df 55%,#bf3989 100%);padding:26px 22px 30px;color:#fff">
  <div style="display:inline-block;font-size:11px;font-weight:700;background:rgba(255,255,255,.2);border-radius:20px;padding:3px 12px;margin-bottom:12px">/job-search</div>
  <div style="font-size:26px;font-weight:800">Job Search Run</div>
  <div style="font-size:13px;opacity:.9;margin-top:3px">{ts} &middot; LinkedIn + Indeed + ATS across 4 target titles</div>
  <div style="font-size:12px;opacity:.85;margin-top:8px">Sources - LinkedIn {src.get('linkedin',0)} &middot; Indeed {src.get('indeed',0)} &middot; ATS {src.get('ats',0)}</div>
</div>
<div style="padding:18px 16px 0">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
  {tile(len(jobs),"Total found","#8250df","#bf3989",IC_TOTAL)}
  {tile(cnt.get('priority',0),"Priority 85+","#1a7f37","#1b9aaa",IC_STAR)}
  {tile(cnt.get('apply',0),"Apply 70-84","#0969da","#8250df",IC_CHECK)}
  {tile(cnt.get('skip',0),"Skip","#57606a","#8a949e",IC_SKIP)}
</div>
<div style="background:#fff;border:1px solid #d0d7de;border-radius:12px;overflow:hidden">
  <div style="padding:12px 14px;font-size:13px;font-weight:700;background:linear-gradient(90deg,#f6f8fa,#fff);border-bottom:1px solid #eaeef2">Top matches &middot; logos, salary, and score at a glance</div>
  {rows}
</div>
<div style="font-size:11px;color:#8a949e;margin-top:12px">Showing top 36 of {len(jobs)}. Scores are card-based (title/salary/company); run /job tailor &lt;id&gt; for full-JD scoring. Logos via public favicons; gradient monograms where none exist. Run file: jobs/{ts}.json</div>
</div></div></div>'''
open("/tmp/job-search-report.html","w").write(html)
real = sum(1 for v in logo_cache.values() if v.startswith("<img"))
print(f"built. companies={len(logo_cache)} real-logos={real} monograms={len(logo_cache)-real}")
