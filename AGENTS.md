# AGENTS.md - operating this repo with an AI coding agent

This file is the operational map for an AI coding agent (Claude Code, Cursor, etc.). Read it
before acting. The app is a self-hosted, single-user job-hunt engine: Node scrapers score jobs
into a local SQLite board (Next.js), and a Chrome extension fills ATS forms the human submits.

## Golden rules (do not break)

1. **Never auto-submit an ATS form or send an application without the human.** Applying is
   always the human's final click. You may fill, tailor, pre-run, and mark status - not submit.
2. **Never commit secrets or personal data.** `web/.env.local`, `profile.json`, `web/jobs.db`,
   and `web/data/recruiters.json` are gitignored on purpose. Don't add them or paste their
   contents into code, commits, or logs.
3. **The database is the source of truth.** State lives in `web/jobs.db` (SQLite). Read/write it
   through the app's API or `web/lib/db.ts`, not by inventing a parallel store.
4. **Match existing style; keep changes surgical.** This is a personal repo - small, focused diffs.

## Where things are

- `web/` - the Next.js 16 app (port 3017). `web/lib/db.ts` = schema + connection;
  `web/lib/queries.ts` = reads; `web/app/api/jobfill/*` = the extension API
  (see `web/app/api/jobfill/API.md`); `web/app/api/jobs/*` = board actions.
- `profile.json` (repo root) - single source of truth: identity, targets, apply answers,
  scoring rubric, call `pitch`. Scrapers and the board read it.
- `scrape_linkedin.mjs`, `scrape_indeed.mjs`, `hn_search.mjs`, `greenhouse_search.mjs` - scrapers.
  `scoring.mjs` - shared 0-100 scorer + dedupe + insert.
- `web/data/recruiters.json` - the recruiter call sheet rendered at `/jobs/recruiters`.

## Common commands

```bash
npm run setup                      # bootstrap local data files from *.example (idempotent)
node scrape_linkedin.mjs           # pull + score matches into jobs.db (also hn/greenhouse/indeed)
cd web && npm run dev              # run the app at http://localhost:3017
cd web && npm run build            # production build (run this to verify TS compiles)
cd web && npm run test             # vitest
```

## The workflow you can drive

1. **Find matches:** run the scrapers. Each scores every posting against `profile.json` and
   inserts matches with `score >= 50` into `jobs.db` (status `planned`).
2. **Report:** read the board via `web/lib/queries.ts` (`getBoard`) or query `jobs.db` directly
   (`applications` table). Surface new `planned` jobs at the user's score threshold (board
   default 80+).
3. **Prepare a kit:** for a chosen job id, write a tailored resume + cover into the kit and set
   status to `kit_ready`. Optionally pre-run the ATS form (JobFill preflight) to confirm "Ready".
4. **Mark applied:** after the human submits, set status `applied` (the extension does this via
   `POST /api/jobfill/event`, or the detail page's "Mark as Applied", or an `applications` update).

## Data model (`applications` table)

`planned` (new match) -> `kit_ready` (tailored + pre-run) -> `applied`. Also `manual_only`
(needs a manual apply), `rejected` / `expired` (fall into Archived), `liked` (`1`/`-1`/`0`),
`pf_status` (preflight result), `score` (0-100). Full schema in `web/lib/db.ts`.

## API surface (for programmatic control)

- `POST /api/jobs/like`, `/api/jobs/applied`, `/api/jobs/hold-company` - board actions.
- `web/app/api/jobfill/*` - the extension's API (event beacon, command queue, kit, rules,
  prescan, readyscan, recruiter-status). See `web/app/api/jobfill/API.md`.

When in doubt, prefer running `npm run build` and `npm run test` to verify a change before
reporting it done.
