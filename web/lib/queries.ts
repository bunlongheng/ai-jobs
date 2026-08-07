import { db, STAGES, type AppRow } from "./db";

export type BoardGroup = { status: string; label: string; rows: AppRow[] };
export type Field = [label: string, value: string, type?: string, options?: string[]];
export type EventRow = { id: number; app_id: string; outcome: string; url: string | null; fields: string | null; stamp: string | null };

const LABEL: Record<string, string> = {
  planned: "New matches", kit_ready: "Ready", applied: "Applied",
  interviewing: "Interviewing", offer: "Offer", rejected: "Rejected",
  skipped: "Skipped", manual_only: "Manual", archived: "Archived",
};

// Score filter applies to every status panel - a job shows only if its score is within
// the selected range. Archived (manual set-aside) always shows. (owner request 2026-07-24)
export const SCORE_TIERS = [90, 80, 70, 60, 50];

export function getBoard(minScore = 0): {
  groups: BoardGroup[]; counts: Record<string, number>; buckets: Record<number, number>;
} {
  // status='deleted' is a full removal - excluded from EVERY panel incl. Archived. (2026-08-05)
  const all = (db().prepare("SELECT * FROM applications").all() as AppRow[]).filter((r) => r.status !== "deleted");
  // "Archived" bucket = disliked (liked = -1) OR rejected - one muted panel at the bottom,
  // each row tagged rejected/disliked in the UI. Rejected gets NO separate red panel.
  // (owner request 2026-07-24)
  // "hold" = a company you're still sizing up (put on hold via the detail page) - kept OFF
  // the working board so it doesn't clutter, tucked into the muted Archived pile, and kept
  // DISTINCT from disliked (which is a real thumbs-down). (owner request 2026-08-06)
  const archived = all.filter((r) => r.liked === -1 || r.status === "rejected" || r.status === "expired" || r.status === "hold");
  const rows = all.filter((r) => r.liked !== -1 && !["rejected", "expired", "hold"].includes(r.status || ""));

  // per-tier counts for the score menu - over EVERY job (incl. applied + archived +
  // rejected), so the dropdown numbers match the true universe. (owner request 2026-08-05)
  const buckets: Record<number, number> = {};
  for (const t of SCORE_TIERS) buckets[t] = 0;
  for (const r of all) for (const t of SCORE_TIERS) if ((r.score ?? 0) >= t) buckets[t]++;

  const keep = (r: AppRow) => (r.score ?? 0) >= minScore;
  const counts: Record<string, number> = {};
  for (const r of rows) { if (!keep(r)) continue; counts[r.status || "planned"] = (counts[r.status || "planned"] || 0) + 1; }
  // Applied tile counts jobs you applied to, including those later rejected.
  // EVERY count is scoped to the active min-score filter (owner request 2026-08-05):
  // hero total, panel tiles, rejected, and archived all reflect the same score cutoff.
  counts.rejected = all.filter((r) => r.status === "rejected" && keep(r)).length;
  const archivedKept = archived.filter(keep);
  if (archivedKept.length) counts.archived = archivedKept.length;
  // Ready = only jobs whose form was actually PRE-SCANNED (plugin pre-run recorded).
  // Everything else that's kit_ready (kit written but not pre-scanned, incl. listing
  // jobs with no form) drops to a separate "Not ready · needs pre-scan" pile. (owner 2026-08-05)
  const preScanned = (r: AppRow) => r.pf_ats === "plugin" && (r.pf_total ?? 0) > 0;
  const krRows = rows.filter((r) => (r.status || "planned") === "kit_ready" && keep(r));
  counts.kit_ready = krRows.filter(preScanned).length;
  counts.kit_only = krRows.filter((r) => !preScanned(r)).length;
  const groups: BoardGroup[] = [];
  // Only the WORK-QUEUE panels (New match, Not ready) rank by score - that is where you
  // pick what to do next. Every other panel (Ready, Applied, and the rest) ranks by LATEST
  // ACTION so what you just touched sits on top. (owner request 2026-08-05)
  const recency = (r: AppRow) => String(r.applied_at || r.rejected_at || r.updated_at || "");
  const byScore = (a: AppRow, b: AppRow) => (b.score || 0) - (a.score || 0);
  const byRecency = (a: AppRow, b: AppRow) => recency(b).localeCompare(recency(a));
  for (const st of STAGES) {
    // "New match" (planned) is hidden from the board entirely - a raw scraped lead with no
    // kit yet is not actionable. The nightly run writes its kit and it appears as "Not ready".
    // (owner request 2026-08-06) Board = Not ready -> Ready -> Applied ...
    if (st === "planned") continue;
    const g = rows.filter((r) => (r.status || "planned") === st && keep(r));
    if (!g.length) continue;
    if (st === "kit_ready") {
      // Not ready ranks by score (work queue); Ready ranks by latest prep. Not-ready
      // renders ABOVE Ready. (owner request 2026-08-05)
      const kitOnly = g.filter((r) => !preScanned(r)).sort(byScore);
      const ready = g.filter(preScanned).sort(byRecency);
      if (kitOnly.length) groups.push({ status: "kit_only", label: "Not ready", rows: kitOnly });
      if (ready.length) groups.push({ status: "kit_ready", label: LABEL.kit_ready, rows: ready });
    } else {
      // planned (score-sorted) is hidden now; every remaining stage here ranks by latest action.
      groups.push({ status: st, label: LABEL[st] || st, rows: g.sort(byRecency) });
    }
  }
  // Archived always renders last (below Rejected) - recency-first (latest activity on top,
  // like the Applied list) so today's rejections/dislikes/expires surface at the top.
  // (owner request 2026-08-05)
  if (archivedKept.length) {
    const recency = (r: AppRow) => String(r.rejected_at || r.updated_at || "");
    archivedKept.sort((a, b) => recency(b).localeCompare(recency(a)));
    groups.push({ status: "archived", label: LABEL.archived, rows: archivedKept });
  }
  return { groups, counts, buckets };
}

// Last-`days` daily activity for the hero-tile sparklines: how many jobs were detected
// (source_run date), made ready (pf_date), and applied (applied_at) each day. Oldest ->
// newest so the last point is today. (owner request 2026-08-05)
export function getTrends(days = 7): { detected: number[]; ready: number[]; applied: number[] } {
  const rows = db().prepare("SELECT source_run, pf_date, applied_at FROM applications WHERE status!='deleted'").all() as
    { source_run: string | null; pf_date: string | null; applied_at: string | null }[];
  const labels: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); labels.push(d.toISOString().slice(0, 10)); }
  const idx: Record<string, number> = {};
  labels.forEach((l, i) => { idx[l] = i; });
  const detected = Array(days).fill(0), ready = Array(days).fill(0), applied = Array(days).fill(0);
  for (const r of rows) {
    const det = String(r.source_run || "").slice(-10); if (det in idx) detected[idx[det]]++;
    const rd = String(r.pf_date || "").slice(0, 10); if (rd in idx) ready[idx[rd]]++;
    const ap = String(r.applied_at || "").slice(0, 10); if (ap in idx) applied[idx[ap]]++;
  }
  return { detected, ready, applied };
}

export function getApp(id: string): { app: AppRow | undefined; events: EventRow[] } {
  const app = db().prepare("SELECT * FROM applications WHERE id = ?").get(id) as AppRow | undefined;
  const events = db().prepare("SELECT * FROM events WHERE app_id = ? ORDER BY id DESC").all(id) as EventRow[];
  return { app, events };
}
