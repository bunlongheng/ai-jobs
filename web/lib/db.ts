import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Single local SQLite file - zero-setup, single-user. Swap to Postgres later with
// the same schema (columns map 1:1). Lives at the repo root as jobs.db.
const DB_PATH = process.env.JOBS_DB || path.join(process.cwd(), "jobs.db");

// The schema lives in lib/schema.sql so the scrapers (scoring.mjs, plain node) can create
// the same tables on a fresh clone before the app has ever run. Single source of truth.
const SCHEMA = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(SCHEMA);
  // Back-compat for DBs created before these columns existed (no-op on fresh schema).
  try { _db.exec("ALTER TABLE events ADD COLUMN debug TEXT"); } catch { /* exists */ }
  try { _db.exec("ALTER TABLE applications ADD COLUMN liked INTEGER DEFAULT 0"); } catch { /* exists */ }
  try { _db.exec("ALTER TABLE applications ADD COLUMN easy_apply INTEGER DEFAULT 0"); } catch { /* exists */ }
  try { _db.exec("ALTER TABLE applications ADD COLUMN easy_apply_checked INTEGER DEFAULT 0"); } catch { /* exists */ }
  try { _db.exec("ALTER TABLE applications ADD COLUMN jd TEXT"); } catch { /* exists */ }
  try { _db.exec("ALTER TABLE applications ADD COLUMN tech TEXT"); } catch { /* exists */ }
  return _db;
}

export type AppRow = {
  id: string; company: string | null; title: string | null; score: number | null;
  status: string | null; verdict: string | null; ats: string | null; ai_able: number;
  url: string | null; location: string | null; kit_path: string | null;
  applied_at: string | null; rejected_at: string | null; liveness_checked: string | null;
  notes: string | null; pf_status: string | null; pf_ats: string | null;
  pf_covered: number | null; pf_total: number | null; pf_direct_url: string | null;
  liked: number | null;
  easy_apply: number | null; easy_apply_checked: number | null;
  jd: string | null;
  tech: string | null;
  found_email: string | null; found_email_meta: string | null;
  source_run: string | null; updated_at: string | null;
};

export const STAGES = ["planned", "kit_ready", "manual_only", "applied", "interviewing", "offer", "rejected", "skipped"] as const;
