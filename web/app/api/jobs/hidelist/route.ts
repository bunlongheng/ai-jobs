import { NextResponse } from "next/server";
import { crossOriginBlocked } from "@/lib/jobfill";
import { getHidelist, setHidelist } from "@/lib/hidelist";
import { withLogos } from "@/lib/blocklist";

export const dynamic = "force-dynamic";

/** Company HIDE-list manager. Hidden companies are filtered out of every board / search / trend
 *  view (they are FILTERED, never deleted - see lib/hidelist.ts), so removing one here brings its
 *  jobs straight back. Unlike the blocklist, the scraper KEEPS scanning hidden companies - hide is
 *  a view-only declutter. GET lists it; POST {company} hides, POST {company,remove:true} un-hides.
 *  `companies` is returned with logos so the chips show a brand mark. (owner request 2026-08-19) */
export async function GET() {
  return NextResponse.json({ ok: true, companies: withLogos(getHidelist()) });
}

export async function POST(req: Request) {
  const xo = crossOriginBlocked(req); if (xo) return xo;
  let body: { company?: string; remove?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const company = String(body.company || "").trim();
  if (!company) return NextResponse.json({ error: "missing company" }, { status: 400 });
  const current = getHidelist();
  const next = body.remove
    ? current.filter((c) => c.trim().toLowerCase() !== company.toLowerCase())
    : [...current, company];
  const companies = withLogos(setHidelist(next));
  return NextResponse.json({ ok: true, companies, hidden: !body.remove });
}
