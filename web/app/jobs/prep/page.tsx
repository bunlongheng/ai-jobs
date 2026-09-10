import Link from "next/link";
import fs from "fs";
import path from "path";
import PrepMode from "./PrepMode";

export const dynamic = "force-dynamic";

export type PrepCard = { q: string; a: string; tip?: string };

// Prep mode: rehearse the top interview questions as flashcards. Questions live in
// prep-questions.json next to the app so the owner edits answers without touching code.
// (owner request 2026-09-10)
function readUp(file: string): string {
  for (const p of [path.join(process.cwd(), "..", file), path.join(process.cwd(), file)]) {
    try { return fs.readFileSync(p, "utf8"); } catch { /* try next */ }
  }
  return "";
}

export default function Prep() {
  let cards: PrepCard[] = [];
  try { cards = JSON.parse(readUp("prep-questions.json") || "[]"); } catch { cards = []; }

  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]">
      <div className="max-w-[720px] mx-auto px-5 py-7 pb-16">
        <Link href="/jobs" className="text-xs text-blue-700 no-underline">&larr; board</Link>
        <h1 className="text-[16px] font-medium text-gray-800 mt-2 mb-0.5">Prep mode</h1>
        <p className="text-[12px] text-gray-500 mb-5">Top {cards.length} interview questions. Say the answer out loud, then reveal. Space reveals, arrows move, S shuffles.</p>
        {cards.length
          ? <PrepMode cards={cards} />
          : <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500 text-sm">prep-questions.json not found next to the app.</div>}
      </div>
    </main>
  );
}
