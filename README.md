# job - Bunlong's DIY job-hunt engine

A private, single-user job-search system that runs entirely on my Mac - nothing
is sent to a third party. Node scrapers pull jobs from LinkedIn / Indeed /
Greenhouse / Ashby / Lever and score each 0-100 against my profile. Matches land
in a local SQLite board (a Next.js app) where I tailor a resume + cover, then a
Chrome extension (JobFill) fills the real ATS form for me to submit by hand. It is
reachable only on localhost and over a private Tailscale tunnel, gated to one
Google account.

> Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4, SQLite
> (better-sqlite3), Auth.js/Google, Node `.mjs` scrapers (Playwright for Indeed),
> a Chrome MV3 extension, served via `next start` behind Tailscale + Caddy.
> The old Python engine is retired to `legacy-python/` - reference only, never run.

## Layout

```
job/
  web/                       # THE app - Next.js 16, port 3017, reads/writes web/jobs.db
    app/jobs/                #   board + detail + apply-queue (server components + small client islands)
    app/api/jobfill/*        #   the Chrome extension's API: event (submit), command queue, kit, rules
    app/api/jobs/*           #   board actions: like/dislike, mark-applied
    lib/db.ts                #   SQLite schema + connection + light migrations
    lib/queries.ts           #   getBoard / getApp - all reads, panel grouping, score filter
    lib/logos.ts             #   company + source favicon cache (getLogo)
    auth.ts, middleware.ts   #   Auth.js Google gate (single email)
    lib/is-local.ts          #   loopback bypass vs remote (Tailscale/LAN) gating
    extension/               #   Chrome MV3 "JobFill" - fills any ATS form, submit beacon
  scrape_linkedin.mjs        # LinkedIn guest-endpoint scraper (no login, no browser)
  scrape_indeed.mjs          # Indeed scraper via Playwright (anonymous)
  scoring.mjs                # shared 0-100 scorer + dedupe + insert into jobs.db
  linkedin_search.sh         # nightly wrapper (run by launchd com.bheng.linkedin-search)
  profile.json               # single source of truth: identity, answers, EEO, targets, rubric
  legacy-python/             # retired Python engine - reference only, never run
```

`web/jobs.db` is the single source of truth and is gitignored. So is `web/.env.local`.

## How it works

```
scrape_linkedin.mjs (launchd, 00:00 + 12:00)
  -> scoring.mjs scores vs profile.json, dedupes, inserts score>=50 into jobs.db
  -> open the board (localhost = open, Tailscale = Google login)
  -> /job-prep tailors resume + cover, headless pre-runs the form, flips to Ready
  -> Open apply page; the JobFill extension fills the ATS form
  -> submit by hand; extension POSTs 'submitted' -> status = applied
     (or one-click "Mark as Applied" on the detail page)
```

The board groups jobs by status and defaults to a `80+` score filter. Disliked and
rejected jobs merge into a muted "Archived" panel at the bottom, each row tagged.

## Run it

All app code lives in `web/`:

```
cd web
npm install
npm run dev                  # localhost:3017, hot reload (development)
npm run build && npm run start   # production on 127.0.0.1:3017 - what launchd runs
npm run test                 # vitest
npm run logos                # backfill company/source favicons
node ../scrape_linkedin.mjs  # pull + score LinkedIn matches into jobs.db
```

Two launchd services:
- `com.bheng.jobs` - serves the app (`npm run start`, production).
- `com.bheng.linkedin-search` - runs `linkedin_search.sh` at 00:00 and 12:00.

## Auth + access

Auth is Auth.js/Google gated to a single email (`ADMIN_EMAIL`, default
`bheng.code@gmail.com`). Loopback (`localhost`, `*.localhost`) bypasses the gate;
every remote host (LAN, Tailscale) must sign in. Only that one Google account passes.

- Local: `http://localhost:3017/jobs` (open) or `http://jobs.localhost` via Caddy.
- Remote: `https://m4.tailc55bed.ts.net` via `tailscale serve` (tailnet-only, gated).
- Never on Vercel - SQLite cannot persist on serverless; this stays self-hosted.

`web/.env.local` (gitignored):

```
ADMIN_EMAIL=bheng.code@gmail.com   # the ONLY account allowed in
GOOGLE_CLIENT_ID=...               # Google OAuth client (prod)
GOOGLE_CLIENT_SECRET=...
AUTH_SECRET=...                    # Auth.js session secret (prod)
AUTH_URL=https://m4.tailc55bed.ts.net
JOBS_DB=/Users/bheng/Sites/jobs/web/jobs.db
```

## Data model (applications table)

- `planned` - freshly scraped match ("New matches")
- `kit_ready` - tailored resume+cover + green form pre-run ("Ready")
- `manual_only` - needs a manual apply
- `applied` - submitted (`applied_at` set)
- `liked` - reaction: `1` hearted, `-1` disliked (-> Archived), `0` neutral
- `pf_status` - preflight status from the JobFill pre-run
- `score` - 0-100 vs the profile rubric (>=50 inserted, board defaults to 80+)

## Skills

```
/jobs                        board + next actions (and `setup` to edit profile.json)
/job-prep                    find new matches (--refresh) + tailor resume + cover + pre-run to Ready
```

Applying is always the human's final click - via the JobFill Chrome extension, never
the terminal. The old `/job-search`, `/job-tailor`, `/job-cover`, `/job-apply` skills
were folded into `/job-prep`.
