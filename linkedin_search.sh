#!/bin/zsh
# LinkedIn job search - runs the LinkedIn guest-API scraper (no login, no browser,
# fully unattended): fetches public job cards, scores each against profile.json,
# dedupes against web/jobs.db, inserts >=50 matches. This is the /jobs-search step
# scoped to LinkedIn. Indeed/ATS are excluded - Indeed's Cloudflare fallback opens a
# visible Chrome, which must never happen unattended. Run by com.bheng.linkedin-search.
NODE="${NODE:-$(command -v node)}"
cd "$(dirname "$0")" || exit 1
echo "==================== linkedin search $(date '+%Y-%m-%d %H:%M:%S') ===================="
"$NODE" scrape_linkedin.mjs
echo "-------------------- pull Resume++ master --------------------"
"$NODE" pull_master_resume.mjs || echo "   ! pull-master failed - continuing with the existing resume-master.md/PDF"

echo "-------------------- hacker news 'who is hiring' --------------------"
"$NODE" hn_search.mjs   # source #3: public HN Algolia API, no scraping; monthly thread, dedupes on re-run
echo "-------------------- greenhouse ATS boards --------------------"
"$NODE" greenhouse_search.mjs   # source #4: 31 public Greenhouse boards, zero auth; direct-ATS apply URLs, remote senior/staff only, 60+ bar
echo "-------------------- drop dead postings (no false hope) --------------------"
"$NODE" check_closed.mjs --limit=400 || echo "   ! closed-check failed - continuing"
echo "-------------------- fetch JDs so kits can be tailored --------------------"
"$NODE" fetch_jd.mjs --limit=40 || echo "   ! jd fetch failed - continuing"

echo "-------------------- auto email-apply (HN 'who is hiring') --------------------"
"$NODE" auto_email_apply.mjs --send --direct   # send kit_ready jobs by email AS you - BOTH lanes: HN comments + any job with a Hunter-resolved found_email (--direct) (needs gmail.send via gmail_auth.mjs); skips any without a real apply email; JOBS_AUTOSEND_OFF=1 to pause
echo "-------------------- gmail rejection sweep --------------------"
"$NODE" rejection_sweep.mjs   # auto-flip applied -> rejected from Gmail rejection emails (needs GMAIL_REFRESH_TOKEN via gmail_auth.mjs)
echo "==================== done $(date '+%Y-%m-%d %H:%M:%S') ===================="
