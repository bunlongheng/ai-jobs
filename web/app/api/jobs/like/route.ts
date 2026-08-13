import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crossOriginBlocked } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

/** Board reactions: heart (liked=1), dislike/hide (liked=-1), or clear (0).
 *  Called by the board's own client (same-origin); a cross-origin POST is refused. */
export async function POST(req: Request) {
  const xo = crossOriginBlocked(req); if (xo) return xo;
  let body: { id?: string; liked?: number; expired?: boolean; deleted?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  // Delete: full removal - status='deleted' drops it from EVERY panel incl. Archived
  // (soft delete, recoverable in the DB). (owner request 2026-08-05)
  if (body.deleted) {
    const r = db().prepare("UPDATE applications SET status='deleted', updated_at=datetime('now') WHERE id=?").run(id);
    return NextResponse.json({ ok: true, updated: r.changes, status: "deleted" });
  }
  // Expire toggle: mark the job expired (moves it to the Archived list with an
  // 'expired' status) or clear it back to Ready. (owner request 2026-08-05)
  if (typeof body.expired === "boolean") {
    const status = body.expired ? "expired" : "kit_ready";
    const r = db().prepare("UPDATE applications SET status=?, updated_at=datetime('now') WHERE id=?").run(status, id);
    return NextResponse.json({ ok: true, updated: r.changes, status });
  }
  const liked = Number(body.liked);
  if (![-1, 0, 1].includes(liked)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const r = db().prepare("UPDATE applications SET liked=?, updated_at=datetime('now') WHERE id=?").run(liked, id);
  return NextResponse.json({ ok: true, updated: r.changes });
}
