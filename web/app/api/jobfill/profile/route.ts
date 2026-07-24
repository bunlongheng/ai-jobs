import { NextResponse } from "next/server";
import { originBlocked, PROFILE, readJson } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const blocked = originBlocked(req);
  if (blocked) return blocked;
  const p = readJson<Record<string, unknown>>(PROFILE, {});
  return NextResponse.json({ identity: p.identity ?? {}, apply_answers: p.apply_answers ?? {} });
}
