#!/usr/bin/env python3
"""scrape_linkedin.py - pull job cards from LinkedIn's public guest endpoint.

No login, no account, no API key. Uses the same jobs-guest endpoint the public
"see more jobs" button calls. Returns normalized job records as JSON on stdout.

Usage:
  python3 scrape_linkedin.py "Senior Full Stack Engineer" [--location "United States"] [--remote] [--pages 2]

Note: personal, low-volume use. LinkedIn may rate-limit; keep pages small.
"""
import sys, json, re, time, urllib.request, urllib.parse, html

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
BASE = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"

def fetch(keywords, location, remote, start):
    q = {"keywords": keywords, "location": location or "United States", "start": start}
    if remote:
        q["f_WT"] = 2  # 2 = Remote
    url = BASE + "?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")

def parse(fragment):
    # Each job card is a <li> with title / company / location / link.
    cards = re.split(r'<li>\s*<div class="base-card', fragment)
    out = []
    for c in cards[1:]:
        def grab(pat):
            m = re.search(pat, c, re.S)
            return html.unescape(re.sub(r"<[^>]+>", "", m.group(1)).strip()) if m else ""
        title = grab(r'class="base-search-card__title">(.*?)</h3>')
        company = grab(r'class="base-search-card__subtitle">(.*?)</h4>')
        location = grab(r'class="job-search-card__location">(.*?)</span>')
        m = re.search(r'href="(https://www\.linkedin\.com/jobs/view/[^"?]+)', c)
        url = m.group(1) if m else ""
        posted = grab(r'datetime="([^"]+)"')
        if title and url:
            out.append({"source": "linkedin", "title": title, "company": company,
                        "location": location, "url": url, "posted": posted, "salary": "n/a"})
    return out

def main():
    if len(sys.argv) < 2:
        sys.exit('usage: scrape_linkedin.py "<keywords>" [--location X] [--remote] [--pages N]')
    kw = sys.argv[1]
    loc, remote, pages = "United States", False, 1
    a = sys.argv[2:]
    for i, x in enumerate(a):
        if x == "--location" and i + 1 < len(a):
            loc = a[i + 1]
        elif x == "--remote":
            remote = True
        elif x == "--pages" and i + 1 < len(a):
            pages = max(1, int(a[i + 1]))
    seen, jobs = set(), []
    for p in range(pages):
        try:
            frag = fetch(kw, loc, remote, p * 25)
        except Exception as e:
            print(json.dumps({"error": str(e), "page": p}), file=sys.stderr)
            break
        got = parse(frag)
        for j in got:
            if j["url"] not in seen:
                seen.add(j["url"]); jobs.append(j)
        if not got:
            break
        time.sleep(1.5)  # polite
    print(json.dumps({"query": kw, "location": loc, "remote": remote,
                      "count": len(jobs), "jobs": jobs}, indent=2))

if __name__ == "__main__":
    main()
