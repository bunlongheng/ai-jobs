import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import Link from "next/link";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// The canonical answer bank lives at repo-root answer-bank.md (single source of truth for
// recurring screening/essay questions). The app runs from web/, so it sits one level up.
// (owner request 2026-08-05 - show the collective bank, not one job's screening_md)
function loadBank(): string {
  for (const p of [path.join(process.cwd(), "..", "answer-bank.md"), path.join(process.cwd(), "answer-bank.md")]) {
    try { return fs.readFileSync(p, "utf8"); } catch { /* try next */ }
  }
  return "";
}

export default function Answers() {
  const md = loadBank();
  const html = md ? DOMPurify.sanitize(marked.parse(md) as string) : "";
  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]">
      <div className="max-w-[900px] mx-auto px-5 py-7 pb-16">
        <Link href="/jobs" className="text-xs text-blue-700 no-underline">&larr; board</Link>
        <h1 className="text-2xl font-bold text-blue-700 mt-2 mb-1">Screening answers</h1>
        <p className="text-[13px] text-gray-500 mb-4">Canonical answer bank - paste-ready responses to the recurring one-off questions.</p>
        {html
          ? <div className="bg-white border border-gray-300 rounded-xl px-6 py-5 prose-kit text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
          : <div className="bg-white border border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">answer-bank.md not found next to the app.</div>}
      </div>
    </main>
  );
}
