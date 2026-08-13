import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crossOriginBlocked } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

const FLAGS = new Set(["called", "emailed", "voicemail"]);

// Per-firm outreach state for the recruiter call sheet: toggle a flag ({firm, flag}), set the
// "spoke to" note ({firm, note}), or set the next-meeting datetime ({firm, meeting}). Flags are a
// CSV in .status, the name in .note, the meeting in .meeting_at (ISO local). (owner 2026-08-10)
export async function POST(req: Request) {
  const xo = crossOriginBlocked(req); if (xo) return xo;
  let body: { firm?: string; flag?: string; note?: string; meeting?: string; badPhone?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const firm = String(body.firm || "").slice(0, 200);
  if (!firm) return NextResponse.json({ error: "no firm" }, { status: 400 });

  const d = db();
  d.prepare("CREATE TABLE IF NOT EXISTS recruiter_status (firm TEXT PRIMARY KEY, status TEXT, note TEXT, updated_at TEXT)").run();
  try { d.prepare("ALTER TABLE recruiter_status ADD COLUMN note TEXT").run(); } catch { /* already there */ }
  try { d.prepare("ALTER TABLE recruiter_status ADD COLUMN meeting_at TEXT").run(); } catch { /* already there */ }
  try { d.prepare("ALTER TABLE recruiter_status ADD COLUMN bad_phone INTEGER DEFAULT 0").run(); } catch { /* already there */ }

  // Mark the firm's phone as broken/disconnected (or clear it).
  if (typeof body.badPhone === "boolean") {
    const bad = body.badPhone ? 1 : 0;
    d.prepare("INSERT INTO recruiter_status (firm, bad_phone, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(firm) DO UPDATE SET bad_phone=excluded.bad_phone, updated_at=datetime('now')").run(firm, bad);
    d.prepare("DELETE FROM recruiter_status WHERE firm=? AND COALESCE(status,'')='' AND COALESCE(note,'')='' AND COALESCE(meeting_at,'')='' AND COALESCE(bad_phone,0)=0").run(firm);
    return NextResponse.json({ ok: true, badPhone: !!bad });
  }

  // Set the "spoke to" note.
  if (typeof body.note === "string") {
    const note = body.note.slice(0, 200);
    d.prepare("INSERT INTO recruiter_status (firm, note, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(firm) DO UPDATE SET note=excluded.note, updated_at=datetime('now')").run(firm, note);
    // clean up a row that now holds nothing
    d.prepare("DELETE FROM recruiter_status WHERE firm=? AND COALESCE(status,'')='' AND COALESCE(note,'')='' AND COALESCE(meeting_at,'')='' AND COALESCE(bad_phone,0)=0").run(firm);
    return NextResponse.json({ ok: true, note });
  }

  // Set the next-meeting datetime (ISO local "YYYY-MM-DDTHH:mm", or "" to clear).
  if (typeof body.meeting === "string") {
    const meeting = body.meeting.slice(0, 40);
    d.prepare("INSERT INTO recruiter_status (firm, meeting_at, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(firm) DO UPDATE SET meeting_at=excluded.meeting_at, updated_at=datetime('now')").run(firm, meeting);
    d.prepare("DELETE FROM recruiter_status WHERE firm=? AND COALESCE(status,'')='' AND COALESCE(note,'')='' AND COALESCE(meeting_at,'')='' AND COALESCE(bad_phone,0)=0").run(firm);
    return NextResponse.json({ ok: true, meeting });
  }

  // Toggle a flag.
  const flag = String(body.flag || "");
  if (!FLAGS.has(flag)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const row = d.prepare("SELECT status FROM recruiter_status WHERE firm=?").get(firm) as { status: string } | undefined;
  const set = new Set((row?.status || "").split(",").filter(Boolean));
  if (set.has(flag)) set.delete(flag); else set.add(flag);
  const next = [...set].join(",");
  d.prepare("INSERT INTO recruiter_status (firm, status, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(firm) DO UPDATE SET status=excluded.status, updated_at=datetime('now')").run(firm, next);
  d.prepare("DELETE FROM recruiter_status WHERE firm=? AND COALESCE(status,'')='' AND COALESCE(note,'')='' AND COALESCE(meeting_at,'')='' AND COALESCE(bad_phone,0)=0").run(firm);
  return NextResponse.json({ ok: true, flags: [...set] });
}
