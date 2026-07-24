#!/bin/zsh
# LinkedIn job search - runs the LinkedIn guest-API scraper (no login, no browser,
# fully unattended): fetches public job cards, scores each against profile.json,
# dedupes against web/jobs.db, inserts >=50 matches. This is the /jobs-search step
# scoped to LinkedIn. Indeed/ATS are excluded - Indeed's Cloudflare fallback opens a
# visible Chrome, which must never happen unattended. Run by com.bheng.linkedin-search.
NODE=/Users/bheng/.nvm/versions/node/v22.23.1/bin/node
cd /Users/bheng/Sites/jobs || exit 1
echo "==================== linkedin search $(date '+%Y-%m-%d %H:%M:%S') ===================="
"$NODE" scrape_linkedin.mjs
echo "==================== done $(date '+%Y-%m-%d %H:%M:%S') ===================="
