import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/queries";
import { getLogo } from "@/lib/logos";

export const dynamic = "force-dynamic";

/** Company autocomplete for the blocklist input: given ?q=, return up to 8 matches (prefix
 *  matches first, then substring) each with its cached logo, so the dropdown can show a brand
 *  mark next to the name. Read-only. (owner request 2026-08-17) */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase();
  const all = getCompanies();
  const pool = q ? all.filter((c) => c.toLowerCase().includes(q)) : all;
  pool.sort((a, b) => {
    const ap = a.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.localeCompare(b);
  });
  const matches = pool.slice(0, 8).map((company) => ({ company, logo: getLogo(company) }));
  return NextResponse.json({ ok: true, matches });
}
