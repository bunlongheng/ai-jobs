import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { originBlocked } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const blocked = originBlocked(req);
  if (blocked) return blocked;
  const rows = db()
    .prepare("SELECT id, company, title, url, status, score FROM applications WHERE status IN ('kit_ready','planned') ORDER BY score DESC")
    .all();
  return NextResponse.json(rows);
}
