import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const FLAGS = new Set(["called", "emailed", "voicemail", "replied"]);

// Per-firm outreach state for the recruiter call sheet: toggle a flag ({firm, flag}) OR set the
// "spoke to" note ({firm, note}). Flags are a CSV in .status, the name in .note. (owner 2026-08-10)
export async function POST(req: Request) {
  let body: { firm?: string; flag?: string; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const firm = String(body.firm || "").slice(0, 200);
  if (!firm) return NextResponse.json({ error: "no firm" }, { status: 400 });

  const d = db();
  d.prepare("CREATE TABLE IF NOT EXISTS recruiter_status (firm TEXT PRIMARY KEY, status TEXT, note TEXT, updated_at TEXT)").run();
  try { d.prepare("ALTER TABLE recruiter_status ADD COLUMN note TEXT").run(); } catch { /* already there */ }

  // Set the "spoke to" note.
  if (typeof body.note === "string") {
    const note = body.note.slice(0, 200);
    d.prepare("INSERT INTO recruiter_status (firm, note, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(firm) DO UPDATE SET note=excluded.note, updated_at=datetime('now')").run(firm, note);
    // clean up a row that now holds nothing
    d.prepare("DELETE FROM recruiter_status WHERE firm=? AND COALESCE(status,'')='' AND COALESCE(note,'')=''").run(firm);
    return NextResponse.json({ ok: true, note });
  }

  // Toggle a flag.
  const flag = String(body.flag || "");
  if (!FLAGS.has(flag)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const row = d.prepare("SELECT status FROM recruiter_status WHERE firm=?").get(firm) as { status: string } | undefined;
  const set = new Set((row?.status || "").split(",").filter(Boolean));
  if (set.has(flag)) set.delete(flag); else set.add(flag);
  const next = [...set].join(",");
  d.prepare("INSERT INTO recruiter_status (firm, status, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(firm) DO UPDATE SET status=excluded.status, updated_at=datetime('now')").run(firm, next);
  d.prepare("DELETE FROM recruiter_status WHERE firm=? AND COALESCE(status,'')='' AND COALESCE(note,'')=''").run(firm);
  return NextResponse.json({ ok: true, flags: [...set] });
}
