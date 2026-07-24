import { db } from "@/lib/db";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Answers() {
  const row = db().prepare("SELECT screening_md FROM applications WHERE screening_md IS NOT NULL ORDER BY length(screening_md) DESC LIMIT 1").get() as { screening_md: string } | undefined;
  const html = row?.screening_md ? DOMPurify.sanitize(marked.parse(row.screening_md) as string) : "";
  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]">
      <div className="max-w-[900px] mx-auto px-5 py-7 pb-16">
        <Link href="/jobs" className="text-xs text-blue-700 no-underline">&larr; board</Link>
        <h1 className="text-2xl font-bold text-blue-700 mt-2 mb-1">Screening answers</h1>
        <p className="text-[13px] text-gray-500 mb-4">Paste-ready cheat sheet for manual forms.</p>
        {html ? <div className="bg-white border border-gray-300 rounded-xl px-6 py-5 prose-kit text-[13px]" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="bg-white border border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">No screening answers ingested yet.</div>}
      </div>
    </main>
  );
}
