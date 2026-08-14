import { getResumePdf } from "@/lib/kit";

// Intentionally guardless: read-only, parameterized (getResumePdf binds `?`, [name] never touches
// the filesystem), and LAN-readable like the rest of the board. Serves a kit's resume PDF.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id } = await params;
  const pdf = getResumePdf(id);
  if (!pdf) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf" } });
}
