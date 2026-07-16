# job - Bunlong's DIY job-hunt engine

A private, self-built job-search + auto-apply system. Finds and scores jobs,
tailors resumes, fills and (semi-)autonomously submits applications, and tracks
everything - all local, nothing sent to a third party.

## Layout

```
job/
  scan.py                # ATS scanner (Greenhouse/Ashby/Lever public JSON APIs)
  scrape_linkedin.py     # LinkedIn public guest-endpoint scraper (no login)
  scrape_indeed.mjs      # Indeed scraper via Playwright (anonymous)
  apply_exclusions.py    # force-skip Java/Angular/C#/.NET/contract (word-boundary)
  build_report.py        # modern HTML search report (logos, gradients) -> Stickies
  jobsdb.py              # optional Postgres persistence (Linode, opt-in)
  apply_bot.mjs          # the apply engine (Playwright) - fill / submit / code-entry
  auto_apply.py          # orchestrator: run bot -> log -> tracker -> Stickies receipt
  portals.json           # curated target companies for the ATS scan
  profile.json           # single source of truth (identity, answers, EEO, targets)
  jobs/latest.json       # newest scored run
  applications/          # per-job kits + tracker.json (the application history)
```

The `/job-*` skills (setup, search, tailor, cover, apply, and the `/job` hub)
live in `~/.claude/skills/` and drive this code.

## Workflow

```
/job                       board + next actions
/job-search                find + score jobs (ATS + LinkedIn + Indeed)
/job-tailor <id>           resume for one job (--ats, --review, --pdf)
/job-cover <id>            cover letter
/job-apply <id>            kit + interview prep + tracking
```

## The apply engine (apply_bot.mjs)

Modes:
- `--show`      headful window, fills, YOU click submit (safest, dodges spam-flags)
- `--fill-only` headless fill + screenshot, never submits (you submit)
- `--auto`      headless: fill -> verify 100% -> submit -> enter Greenhouse security
                code (fetched from Gmail, written to `applications/<id>/security_code.txt`)
- `--profile`   run in the persistent logged-in Chrome (`chrome-profile/`) so
                Greenhouse apps prefill + track in MyGreenhouse

`auto_apply.py <id> [url]` runs the bot, updates `tracker.json`, and posts a
Stickies receipt (screenshot embedded) per job.

## Key facts learned

- Fully autonomous submit gets **spam-flagged** on strict ATS (Ashby/Vanta). The
  reliable path is bot-fills + a **human final click** (or logged-in Greenhouse).
- Greenhouse gates with an **email security code** - the Gmail MCP reads it.
- Outcomes are honest: only `submitted` = sent. Everything else is a NOT-SUBMITTED
  state, never called a "rejection".
- Hard skips (in profile.json): Java, Angular, C#/.NET, contract. Remote-only,
  Senior/Staff full-stack, $160-200k. Location: Pelham, NH.

## Applied so far (2026-07-15)

Neo.Tax, Twilio, Discord, Webflow - 4 applications, all email-confirmed.

## Resume work

Everything needed is here. `python3 ~/.claude/skills/job/board.py` shows the
current pipeline. Data (profile, applications, tracker) lives alongside the code.
