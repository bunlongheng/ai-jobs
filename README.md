# job - Bunlong's DIY job-hunt engine

A private, self-built job-search + auto-apply system. Finds and scores jobs,
tailors resumes, fills applications via a Chrome extension driven by Claude,
and tracks everything - all local, nothing sent to a third party.

## Layout

```
job/
  jobfill/               # THE apply engine (2026-07-21+)
    server.py            #   localhost:7777 - kits/rules/events API + command queue + Stickies push
    rules.json           #   the answer brain (matched by regex; server-side = zero-reload fixes)
    extension/           #   Chrome MV3 "JobFill" - fills any ATS form, overlay UI, self-reload
  answer-bank.md         # canonical essay answers (edit here, rules follow)
  scan.py                # ATS scanner (Greenhouse/Ashby/Lever public JSON APIs)
  scrape_linkedin.py     # LinkedIn public guest-endpoint scraper (no login)
  scrape_indeed.mjs      # Indeed scraper via Playwright (anonymous)
  apply_exclusions.py    # force-skip Java/Angular/C#/.NET/contract (word-boundary)
  build_report.py        # search-run HTML report -> Stickies
  jobsdb.py              # optional Postgres persistence (Linode, opt-in)
  apply_bot.mjs          # DEPRECATED legacy headless bot (see banner)
  auto_apply.py          # DEPRECATED legacy orchestrator (see banner)
  portals.json           # curated target companies for the ATS scan
  profile.json           # single source of truth (identity, answers, EEO, targets)
  tests/                 # zero-dep guardrail tests: rules/server (test_jobfill.py) + scan filters/exclusions (test_scan.py)
  jobs/latest.json       # newest scored run
  applications/          # per-job kits + tracker.json + submitted-answers archive
  package.json           # pins playwright (the only node dep); npm test runs both suites
  ruff.toml              # lint config; CI (.github/workflows/ci.yml) runs tests + ruff on push
```

## The apply engine (jobfill)

Flow: Claude opens the job tab and queues a command -> the extension polls the
server (5s), fills the form from profile + rules + kit, shows a green/red overlay
-> the human reviews, solves the captcha, clicks Submit -> the confirmation (or a
manual mark) flips tracker.json and archives submitted-answers.json -> every run
auto-posts a styled report to Stickies (Jobs folder).

Server routes (127.0.0.1:7777):
  GET  /profile             identity + apply_answers
  GET  /kits                kit_ready + planned applications
  GET  /kit/<id>/resume     kit resume.pdf (falls back to resume-bunlong.pdf)
  GET  /kit/<id>/cover      kit cover letter text
  GET  /rules               rules.json (extension merges these OVER built-ins)
  GET  /events/latest       most recent fill/submit event (for Claude)
  GET  /errors              errors-only view of the latest event (for Claude)
  GET  /report/<id>         styled HTML run report for a kit
  GET  /commands/poll       pending commands (extension; delivered once)
  POST /command             enqueue {action: fill|ping|reload|open|audit|read, kitId?, url?, overwrite?[]}
                            open = new tab in the real Chrome; audit = READ-ONLY field
                            enumeration of the active job tab; read = page text. This is
                            Claude's two-way bridge to the logged-in UI Chrome.
  POST /event               fill/submit/command_result logging (+ tracker flip + Stickies)

rules.json entry: {match: regex, kind: choice|text, opts?: [], v?: str,
seed?: str, contains?: bool, async?: bool, freeText?: str}. Server rules load
fresh per request - edit the file and the NEXT click uses it.

The server runs under launchd: ~/Library/LaunchAgents/com.bheng.jobfill.plist
(KeepAlive - survives reboots). Logs: /tmp/jobfill-server.log. A template lives
at jobfill/com.bheng.jobfill.plist - on a new machine:
`cp jobfill/com.bheng.jobfill.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.bheng.jobfill.plist`.

Stickies receipts need STICKIES_TOKEN (read from env, else the `env` block of
~/.claude/settings.local.json). Without it the server still works - it just
skips posting run reports. Browser pages can never call the server: requests
carrying an http(s) Origin get a 403 (only the extension and local tools talk to it).

## Workflow

```
/job                       board + next actions
/job-search                find + score jobs (ATS + LinkedIn + Indeed)
/job-tailor <id>           resume for one job (--ats, --review, --pdf)
/job-cover <id>            cover letter
/job-apply <id>            kit + interview prep + tracking
```

