import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crossOriginBlocked } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

/** One-click "mark as applied" from the job detail page (faster than Gmail detection).
 *  applied=true -> status=applied + applied_at=today; false -> back to kit_ready.
 *  Same-origin (the detail page's own client); a cross-origin POST is refused. */
export async function POST(req: Request) {
  const xo = crossOriginBlocked(req); if (xo) return xo;
  let body: { id?: string; applied?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const stamp = new Date().toISOString().slice(0, 10);
  if (body.applied) {
    db().prepare("UPDATE applications SET status='applied', applied_at=?, updated_at=datetime('now') WHERE id=?").run(stamp, id);
    return NextResponse.json({ ok: true, applied_at: stamp });
  }
  db().prepare("UPDATE applications SET status='kit_ready', applied_at=NULL, updated_at=datetime('now') WHERE id=?").run(id);
  return NextResponse.json({ ok: true, applied_at: null });
}
