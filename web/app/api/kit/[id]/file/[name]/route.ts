import { getResumePdf } from "@/lib/kit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id } = await params;
  const pdf = getResumePdf(id);
  if (!pdf) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf" } });
}
