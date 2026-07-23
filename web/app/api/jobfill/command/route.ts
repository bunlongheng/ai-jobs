import { NextResponse } from "next/server";
import fs from "fs";
import { originBlocked, COMMANDS } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

/** Claude (or anything local) enqueues a command for the extension:
 *  {"action":"fill","kitId":"..."} | {"action":"ping"} */
export async function POST(req: Request) {
  const blocked = originBlocked(req);
  if (blocked) return blocked;
  let cmd: Record<string, unknown>;
  try { cmd = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  cmd.status = "pending";
  cmd.queued = new Date().toISOString().slice(0, 10);
  fs.appendFileSync(COMMANDS, JSON.stringify(cmd) + "\n");
  return NextResponse.json({ ok: true, queued: cmd });
}
