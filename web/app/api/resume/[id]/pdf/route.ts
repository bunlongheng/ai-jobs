import { NextResponse } from "next/server";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getVersion, getPdf } from "@/lib/resumes";

export const dynamic = "force-dynamic";
const run = promisify(execFile);

/** Serve a version's PDF. If none is stored yet (or content changed since last render), render it
 *  on demand with make_resume_pdf.mjs - the same Playwright pipeline as the cover PDFs, kept out of
 *  the Next bundle - then serve the freshly-stored BLOB. (owner request 2026-08-18) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = getVersion(id);
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });

  let pdf = v.has_pdf ? getPdf(id) : null;
  if (!pdf) {
    const root = path.join(process.cwd(), ".."); // web/ -> repo root, where the script + jobs.db live
    try {
      await run("node", ["make_resume_pdf.mjs", id], { cwd: root, timeout: 60000 });
    } catch (e) {
      return NextResponse.json({ error: "render failed", detail: String(e) }, { status: 500 });
    }
    pdf = getPdf(id);
  }
  if (!pdf) return NextResponse.json({ error: "no pdf" }, { status: 404 });

  const download = new URL(req.url).searchParams.get("dl") === "1";
  const fname = `${(v.name || "resume").replace(/[^a-z0-9]+/gi, "-")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fname}"`,
    },
  });
}
