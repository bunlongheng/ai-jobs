import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { db } from "@/lib/db";
import { originBlocked, KITS_DIR, MASTER_RESUME } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; what: string }> }) {
  const blocked = originBlocked(req);
  if (blocked) return blocked;
  const { id, what } = await params;
  const kid = path.basename(id); // no path escape

  if (what === "resume") {
    // prefer the kit PDF stored in the DB, then kit file, then the master resume
    const row = db().prepare("SELECT resume_pdf FROM applications WHERE id = ?").get(kid) as { resume_pdf: Buffer | null } | undefined;
    const kitPdf = path.join(KITS_DIR, kid, "resume.pdf");
    const buf = row?.resume_pdf ?? (fs.existsSync(kitPdf) ? fs.readFileSync(kitPdf) : fs.existsSync(MASTER_RESUME) ? fs.readFileSync(MASTER_RESUME) : null);
    if (!buf) return NextResponse.json({ error: "no resume" }, { status: 404 });
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf" } });
  }
  if (what === "cover") {
    // Prefer the rendered per-job cover PDF (applications/<id>/cover-letter.pdf) so the
    // extension attaches a real PDF to the Cover Letter slot - NEVER the resume, never a
    // .txt. Fall back to the raw cover text only when no PDF has been rendered yet.
    // (owner bug 2026-08-05)
    const wantText = new URL(req.url).searchParams.get("format") === "text";
    const coverPdf = path.join(KITS_DIR, kid, "cover-letter.pdf");
    if (!wantText && fs.existsSync(coverPdf)) {
      const buf = fs.readFileSync(coverPdf);
      return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf" } });
    }
    const row = db().prepare("SELECT cover_md FROM applications WHERE id = ?").get(kid) as { cover_md: string | null } | undefined;
    const f = path.join(KITS_DIR, kid, "cover-letter.md");
    const text = row?.cover_md ?? (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
    if (!text) return NextResponse.json({ error: "no cover" }, { status: 404 });
    return new NextResponse(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.json({ error: "unknown kit file" }, { status: 404 });
}
