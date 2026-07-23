import { NextResponse } from "next/server";
import { originBlocked, RULES, readJson } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const blocked = originBlocked(req);
  if (blocked) return blocked;
  return NextResponse.json(readJson<unknown[]>(RULES, []));
}
