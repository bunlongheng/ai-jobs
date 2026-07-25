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
  const all = db().prepare("SELECT * FROM applications").all() as AppRow[];
  // "Archived" bucket = disliked (liked = -1) OR rejected - one muted panel at the bottom,
  // each row tagged rejected/disliked in the UI. Rejected gets NO separate red panel.
  // (owner request 2026-07-24)
  const archived = all.filter((r) => r.liked === -1 || r.status === "rejected");
  const rows = all.filter((r) => r.liked !== -1 && r.status !== "rejected");

  // per-tier counts across all active (non-archived) jobs, for the score menu
  const buckets: Record<number, number> = {};
  for (const t of SCORE_TIERS) buckets[t] = 0;
  for (const r of rows) for (const t of SCORE_TIERS) if ((r.score ?? 0) >= t) buckets[t]++;

  const keep = (r: AppRow) => (r.score ?? 0) >= minScore;
  const counts: Record<string, number> = {};
  for (const r of rows) { if (!keep(r)) continue; counts[r.status || "planned"] = (counts[r.status || "planned"] || 0) + 1; }
  // Applied tile counts jobs you applied to, including those later rejected.
  counts.rejected = all.filter((r) => r.status === "rejected").length;
  if (archived.length) counts.archived = archived.length;
  const groups: BoardGroup[] = [];
  for (const st of STAGES) {
    // Applied list is ordered newest-applied first (recent on top, old at the bottom);
    // every other stage stays ranked by score. (owner request 2026-07-24)
    const sort = st === "applied"
      ? (a: AppRow, b: AppRow) => String(b.applied_at || "").localeCompare(String(a.applied_at || ""))
      : (a: AppRow, b: AppRow) => (b.score || 0) - (a.score || 0);
    const g = rows.filter((r) => (r.status || "planned") === st && keep(r)).sort(sort);
    if (g.length) groups.push({ status: st, label: LABEL[st] || st, rows: g });
  }
  // Archived always renders last (below Rejected).
  if (archived.length) {
    archived.sort((a, b) => (b.score || 0) - (a.score || 0));
    groups.push({ status: "archived", label: LABEL.archived, rows: archived });
  }
  return { groups, counts, buckets };
}

export function getApp(id: string): { app: AppRow | undefined; events: EventRow[] } {
  const app = db().prepare("SELECT * FROM applications WHERE id = ?").get(id) as AppRow | undefined;
  const events = db().prepare("SELECT * FROM events WHERE app_id = ? ORDER BY id DESC").all(id) as EventRow[];
  return { app, events };
}

export function aiAbleReady(): AppRow[] {
  return db().prepare("SELECT * FROM applications WHERE status='kit_ready' AND ai_able=1 ORDER BY score DESC").all() as AppRow[];
}
