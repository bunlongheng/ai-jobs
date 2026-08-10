import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const FLAGS = new Set(["called", "emailed", "replied"]);

// Toggle a per-firm outreach flag (called / emailed / replied) for the recruiter call sheet.
// Flags are independent checkboxes stored as a CSV in recruiter_status.status. (owner 2026-08-09)
export async function POST(req: Request) {
  let body: { firm?: string; flag?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const firm = String(body.firm || "").slice(0, 200);
  const flag = String(body.flag || "");
  if (!firm || !FLAGS.has(flag)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const d = db();
  d.prepare("CREATE TABLE IF NOT EXISTS recruiter_status (firm TEXT PRIMARY KEY, status TEXT, updated_at TEXT)").run();
  const row = d.prepare("SELECT status FROM recruiter_status WHERE firm=?").get(firm) as { status: string } | undefined;
  const set = new Set((row?.status || "").split(",").filter(Boolean));
  if (set.has(flag)) set.delete(flag); else set.add(flag);
  const next = [...set].join(",");
  if (!next) d.prepare("DELETE FROM recruiter_status WHERE firm=?").run(firm);
  else d.prepare("INSERT INTO recruiter_status (firm, status, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(firm) DO UPDATE SET status=excluded.status, updated_at=datetime('now')").run(firm, next);
  return NextResponse.json({ ok: true, flags: [...set] });
}
