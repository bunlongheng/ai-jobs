import { NextResponse } from "next/server";
import { crossOriginBlocked } from "@/lib/jobfill";
import { getVersion, deleteVersion, setMaster } from "@/lib/resumes";

export const dynamic = "force-dynamic";

/** GET a single version (with content). POST {master:true} sets it as the master. DELETE removes it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = getVersion(id);
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, version: v });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const xo = crossOriginBlocked(req); if (xo) return xo;
  const { id } = await params;
  if (!getVersion(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  let body: { master?: boolean };
  try { body = await req.json(); } catch { body = {}; }
  if (body.master) setMaster(id);
  return NextResponse.json({ ok: true, version: getVersion(id) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const xo = crossOriginBlocked(req); if (xo) return xo;
  const { id } = await params;
  deleteVersion(id);
  return NextResponse.json({ ok: true });
}
