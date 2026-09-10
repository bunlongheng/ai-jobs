import { NextResponse } from "next/server";
import { crossOriginBlocked } from "@/lib/jobfill";
import { getBlocklist, setBlocklist, withLogos } from "@/lib/blocklist";

export const dynamic = "force-dynamic";

/** Company blocklist manager. Blocked companies are hidden from every board / search / trend
 *  view (they are FILTERED, never deleted - see lib/blocklist.ts), so removing one here brings
 *  its jobs straight back. GET lists the blocklist; POST {company} blocks, POST {company,remove:true}
 *  un-blocks. `companies` is returned with logos so the chips show a brand mark. (owner 2026-08-17) */
export async function GET() {
  return NextResponse.json({ ok: true, companies: withLogos(getBlocklist()) });
}

export async function POST(req: Request) {
  const xo = crossOriginBlocked(req); if (xo) return xo;
  let body: { company?: string; remove?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const company = String(body.company || "").trim();
  if (!company) return NextResponse.json({ error: "missing company" }, { status: 400 });
  const current = getBlocklist();
  const next = body.remove
    ? current.filter((c) => c.trim().toLowerCase() !== company.toLowerCase())
    : [...current, company];
  const companies = withLogos(setBlocklist(next));
  return NextResponse.json({ ok: true, companies, blocked: !body.remove });
}
