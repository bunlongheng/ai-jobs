// RETIRED 2026-07-22: tracker.json is frozen; jobs.db is written directly by /api/jobfill. Kept for reference.
// One-shot migration: read the Python engine's tracker.json (+ per-kit ext-events)
// into SQLite. Idempotent - upserts by id, safe to re-run. Run: npx tsx scripts/migrate.ts
import fs from "fs";
import path from "path";
import os from "os";
import { db } from "../lib/db";

function kitRead(id: string, f: string): string | null {
  try { return fs.readFileSync(path.join(JOB, "applications", id, f), "utf8"); } catch { return null; }
}

const JOB = path.join(os.homedir(), "Sites", "jobs");
const TRACKER = path.join(JOB, "applications", "tracker.json");

function run() {
  const d = db();
  const tracker = JSON.parse(fs.readFileSync(TRACKER, "utf8"));
  const apps: Record<string, unknown>[] = tracker.applications || [];

  const upsert = d.prepare(`
    INSERT INTO applications
      (id, company, title, score, status, verdict, ats, ai_able, url, location, kit_path,
       source_run, applied_at, rejected_at, liveness_checked, notes,
       pf_status, pf_ats, pf_covered, pf_total, pf_date, pf_direct_url, resume_md, cover_md, screening_md, has_resume_pdf, resume_pdf, raw, updated_at)
    VALUES
      (@id, @company, @title, @score, @status, @verdict, @ats, @ai_able, @url, @location, @kit_path,
       @source_run, @applied_at, @rejected_at, @liveness_checked, @notes,
       @pf_status, @pf_ats, @pf_covered, @pf_total, @pf_date, @pf_direct_url, @resume_md, @cover_md, @screening_md, @has_resume_pdf, @resume_pdf, @raw, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      company=@company, title=@title, score=@score, status=@status, verdict=@verdict, ats=@ats,
      ai_able=@ai_able, url=@url, location=@location, kit_path=@kit_path, source_run=@source_run,
      applied_at=@applied_at, rejected_at=@rejected_at, liveness_checked=@liveness_checked, notes=@notes,
      pf_status=@pf_status, pf_ats=@pf_ats, pf_covered=@pf_covered, pf_total=@pf_total,
      pf_date=@pf_date, pf_direct_url=@pf_direct_url, resume_md=@resume_md, cover_md=@cover_md, screening_md=@screening_md, has_resume_pdf=@has_resume_pdf, resume_pdf=@resume_pdf, raw=@raw, updated_at=datetime('now')
  `);

  const insEvent = d.prepare(
    `INSERT INTO events (app_id, outcome, url, fields, stamp) VALUES (?, ?, ?, ?, ?)`
  );
  const clearEvents = d.prepare(`DELETE FROM events WHERE app_id = ?`);

  const tx = d.transaction((rows: Record<string, unknown>[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of rows as Array<Record<string, any>>) {
      const pf = a.preflight || {};
      upsert.run({
        id: a.id,
        company: a.company ?? null,
        title: a.title ?? null,
        score: a.score ?? null,
        status: a.status ?? "planned",
        verdict: a.verdict ?? null,
        ats: a.ats ?? pf.ats ?? null,
        ai_able: a.ai_able ? 1 : 0,
        url: a.url ?? null,
        location: a.location ?? null,
        kit_path: a.kit_path ?? null,
        source_run: a.source_run ?? null,
        applied_at: a.applied_at ?? null,
        rejected_at: a.rejected_at ?? null,
        liveness_checked: a.liveness_checked ?? null,
        notes: a.notes ?? null,
        pf_status: pf.status ?? null,
        pf_ats: pf.ats ?? null,
        pf_covered: pf.covered ?? null,
        pf_total: pf.total ?? null,
        pf_date: pf.date ?? null,
        pf_direct_url: pf.direct_url ?? null,
        resume_md: kitRead(a.id as string, "resume.md"),
        cover_md: kitRead(a.id as string, "cover-letter.md"),
        screening_md: kitRead(a.id as string, "screening.md"),
        has_resume_pdf: fs.existsSync(path.join(JOB, "applications", a.id as string, "resume.pdf")) ? 1 : 0,
        resume_pdf: (() => { try { return fs.readFileSync(path.join(JOB, "applications", a.id as string, "resume.pdf")); } catch { return null; } })(),
        raw: JSON.stringify(a),
      });

      // migrate captured fill/submit events from the kit's ext-events.jsonl
      const evPath = path.join(JOB, "applications", a.id, "ext-events.jsonl");
      if (fs.existsSync(evPath)) {
        clearEvents.run(a.id);
        for (const line of fs.readFileSync(evPath, "utf8").split("\n")) {
          if (!line.trim()) continue;
          try {
            const e = JSON.parse(line);
            if (!e.outcome) continue;
            insEvent.run(a.id, e.outcome, e.url ?? null, e.fields ? JSON.stringify(e.fields) : null, e.stamp ?? null);
          } catch {}
        }
      }
    }
  });

  tx(apps);
  const n = (d.prepare("SELECT count(*) c FROM applications").get() as { c: number }).c;
  const ev = (d.prepare("SELECT count(*) c FROM events").get() as { c: number }).c;
  console.log(`migrated ${apps.length} apps -> ${n} rows, ${ev} events`);
}

run();
