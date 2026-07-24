import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Board reactions: heart (liked=1), dislike/hide (liked=-1), or clear (0).
 *  Called by the board's own client (same-origin), so no extension origin guard. */
export async function POST(req: Request) {
  let body: { id?: string; liked?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const id = String(body.id || "");
  const liked = Number(body.liked);
  if (!id || ![-1, 0, 1].includes(liked)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const r = db().prepare("UPDATE applications SET liked=?, updated_at=datetime('now') WHERE id=?").run(liked, id);
  return NextResponse.json({ ok: true, updated: r.changes });
}
