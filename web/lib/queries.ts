import { db, STAGES, type AppRow } from "./db";

export type BoardGroup = { status: string; label: string; rows: AppRow[] };
export type Field = [label: string, value: string, type?: string, options?: string[]];
export type EventRow = { id: number; app_id: string; outcome: string; url: string | null; fields: string | null; stamp: string | null };

const LABEL: Record<string, string> = {
  planned: "Planned", kit_ready: "Ready", applied: "Applied",
  interviewing: "Interviewing", offer: "Offer", rejected: "Rejected",
  skipped: "Skipped", manual_only: "Manual",
};

export function getBoard(): { groups: BoardGroup[]; counts: Record<string, number> } {
  const rows = db().prepare("SELECT * FROM applications").all() as AppRow[];
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status || "planned"] = (counts[r.status || "planned"] || 0) + 1;
  const groups: BoardGroup[] = [];
  for (const st of STAGES) {
    const g = rows.filter((r) => (r.status || "planned") === st).sort((a, b) => (b.score || 0) - (a.score || 0));
    if (g.length) groups.push({ status: st, label: LABEL[st] || st, rows: g });
  }
  return { groups, counts };
}

export function getApp(id: string): { app: AppRow | undefined; events: EventRow[] } {
  const app = db().prepare("SELECT * FROM applications WHERE id = ?").get(id) as AppRow | undefined;
  const events = db().prepare("SELECT * FROM events WHERE app_id = ? ORDER BY id DESC").all(id) as EventRow[];
  return { app, events };
}

export function aiAbleReady(): AppRow[] {
  return db().prepare("SELECT * FROM applications WHERE status='kit_ready' AND ai_able=1 ORDER BY score DESC").all() as AppRow[];
}
