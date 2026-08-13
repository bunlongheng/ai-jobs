import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crossOriginBlocked } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

/** Hold off on a whole company (you're still sizing it up): set status='hold' on its ACTIVE
 *  pipeline jobs so they leave the working board and sit in the muted Archived pile - kept
 *  distinct from a thumbs-down dislike. Already-applied/rejected history is left untouched.
 *  {unhold:true} restores held jobs to kit_ready. (owner request 2026-08-06) */
export async function POST(req: Request) {
  const xo = crossOriginBlocked(req); if (xo) return xo;
  let body: { company?: string; unhold?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const company = String(body.company || "").trim();
  if (!company) return NextResponse.json({ error: "missing company" }, { status: 400 });
  const r = body.unhold
    ? db().prepare("UPDATE applications SET status='kit_ready', updated_at=datetime('now') WHERE company=? COLLATE NOCASE AND status='hold'").run(company)
    : db().prepare("UPDATE applications SET status='hold', updated_at=datetime('now') WHERE company=? COLLATE NOCASE AND status IN ('planned','kit_ready','manual_only')").run(company);
  return NextResponse.json({ ok: true, updated: r.changes, held: !body.unhold });
}
