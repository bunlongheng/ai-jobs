import { NextResponse } from "next/server";
import fs from "fs";
import { originBlocked, COMMANDS } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

/** Extension polls this; pending commands are returned exactly once. */
export async function GET(req: Request) {
  const blocked = originBlocked(req);
  if (blocked) return blocked;
  const pending: Record<string, unknown>[] = [];
  const kept: Record<string, unknown>[] = [];
  if (fs.existsSync(COMMANDS)) {
    for (const ln of fs.readFileSync(COMMANDS, "utf8").split("\n")) {
      if (!ln.trim()) continue;
      let c: Record<string, unknown>;
      try { c = JSON.parse(ln); } catch { continue; }
      if (c.status === "pending") { pending.push({ ...c }); c.status = "delivered"; }
      kept.push(c);
    }
    fs.writeFileSync(COMMANDS, kept.map((c) => JSON.stringify(c)).join("\n") + (kept.length ? "\n" : ""));
  }
  return NextResponse.json(pending);
}
