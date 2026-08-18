import { NextResponse } from "next/server";
import { crossOriginBlocked } from "@/lib/jobfill";
import { listVersions, upsertVersion, asKind } from "@/lib/resumes";

export const dynamic = "force-dynamic";

/** Document builder API (resumes + cover letters). GET ?kind=resume|cover lists versions (no
 *  content); omit kind for all. POST creates/updates a version - the AI-write surface: the local
 *  agent posts regenerated markdown here. Writing content clears the stored PDF. (owner 2026-08-18) */
export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get("kind");
  const versions = listVersions(k ? asKind(k) : undefined);
  return NextResponse.json({ ok: true, versions });
}

export async function POST(req: Request) {
  const xo = crossOriginBlocked(req); if (xo) return xo;
  let body: { id?: string; kind?: string; name?: string; content?: string; is_master?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const name = String(body.name || "").trim();
  if (!body.id && !name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const v = upsertVersion({
    id: body.id,
    kind: asKind(body.kind),
    name: name || body.id!,
    content: String(body.content ?? ""),
    is_master: !!body.is_master,
  });
  return NextResponse.json({ ok: true, version: v });
}
