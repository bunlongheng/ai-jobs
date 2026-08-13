-- Canonical SQLite schema for jobs.db. Loaded by BOTH the app (web/lib/db.ts) and the
-- scrapers (scoring.mjs), so a scraper can create the tables on a fresh clone before the
-- app has ever run. All statements are idempotent (CREATE ... IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS applications (
  id            TEXT PRIMARY KEY,
  company       TEXT,
  title         TEXT,
  score         INTEGER,
  status        TEXT,           -- planned | kit_ready | applied | interviewing | rejected | skipped | manual_only
  verdict       TEXT,           -- priority | apply | skip
  ats           TEXT,           -- greenhouse | ashby | lever | ...
  ai_able       INTEGER DEFAULT 0,
  url           TEXT,
  location      TEXT,
  kit_path      TEXT,
  source_run    TEXT,
  applied_at    TEXT,
  rejected_at   TEXT,
  liveness_checked TEXT,
  notes         TEXT,
  -- preflight (flattened from the JSON blob)
  pf_status     TEXT,           -- ready | gaps | account_wall | login_wall | blocked | unsupported
  pf_ats        TEXT,
  pf_covered    INTEGER,
  pf_total      INTEGER,
  pf_date       TEXT,
  pf_direct_url TEXT,
  resume_md     TEXT,           -- tailored kit materials, ingested from the engine at
  cover_md      TEXT,           -- migrate time so the app is self-contained (no
  screening_md  TEXT,           -- cross-repo filesystem read at request time)
  has_resume_pdf INTEGER DEFAULT 0,
  resume_pdf    BLOB,           -- the PDF bytes, so /api/kit serves from the DB
  raw           TEXT,           -- full original JSON entry, for anything not columnized
  jd            TEXT,           -- full job description (plain text), shown on the detail page
  tech          TEXT,           -- tech stack extracted from the job text
  liked         INTEGER DEFAULT 0,  -- 0 neutral | 1 hearted | -1 disliked (hidden from board)
  easy_apply    INTEGER DEFAULT 0,  -- 1 = Easy/Quick Apply detected on the source
  easy_apply_checked INTEGER DEFAULT 0,  -- 1 = the extension has checked the source
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_apps_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_apps_score  ON applications(score DESC);
-- composite for the board's status + score filtering path (ready for scale)
CREATE INDEX IF NOT EXISTS idx_apps_status_score ON applications(status, score DESC);

-- per-application captured events (fills/submits) - replaces ext-events.jsonl
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id     TEXT,
  outcome    TEXT,             -- filled | submitted | command_result
  url        TEXT,
  fields     TEXT,             -- JSON array of [label, value, type, options]
  debug      TEXT,             -- failure diagnostics (options + HTML) from the extension
  stamp      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_app ON events(app_id);

-- company logo cache: fetch each favicon ONCE, store the data URI, render from
-- here so the board never re-downloads. NULL data_uri = resolved-but-no-logo
-- (render a monogram); absent row = not yet fetched.
CREATE TABLE IF NOT EXISTS logos (
  company    TEXT PRIMARY KEY,
  data_uri   TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
