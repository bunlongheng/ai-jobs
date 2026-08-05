"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type J = { id: string; title: string; company: string; score: number; status: string };

const STLABEL: Record<string, string> = {
  planned: "New", kit_ready: "Ready", manual_only: "Manual", applied: "Applied",
  interviewing: "Interviewing", rejected: "Rejected", skipped: "Skipped", offer: "Offer",
};

// Cmd/Ctrl+K command palette - search all jobs by title or company, arrow-navigate,
// Enter opens the detail (preserving the current ?min filter). (owner request 2026-08-05)
export default function CommandK({ jobs }: { jobs: J[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return jobs.slice(0, 15);
    return jobs
      .filter((j) => j.title.toLowerCase().includes(t) || j.company.toLowerCase().includes(t))
      .slice(0, 40);
  }, [q, jobs]);

  const min = sp.get("min");
  const go = (id?: string) => { if (!id) return; setOpen(false); router.push(`/jobs/${id}${min !== null ? `?min=${min}` : ""}`); };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-9 rounded-[10px] border border-gray-200 bg-white shadow-sm px-3 text-[12px] font-semibold text-gray-500 hover:bg-gray-50 cursor-pointer select-none"
        title="Search jobs (Cmd/Ctrl + K)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        Search
        <span className="ml-1 text-[10px] text-gray-400 border border-gray-200 rounded px-1 py-0.5">&#8984;K</span>
      </button>

      {open ? (
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center px-4 pt-[12vh]">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[560px] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 border-b border-gray-100">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); go(results[active]?.id); }
                }}
                placeholder="Search jobs by title or company..."
                className="flex-1 py-3.5 text-[15px] outline-none bg-transparent text-[#1f2328]"
              />
              <span className="text-[11px] text-gray-400">{results.length}</span>
            </div>
            <div className="max-h-[52vh] overflow-y-auto py-1">
              {results.length === 0 ? (
                <div className="px-4 py-6 text-[13px] text-gray-400 text-center">No jobs match &ldquo;{q}&rdquo;</div>
              ) : results.map((j, i) => (
                <div
                  key={j.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(j.id)}
                  className={`flex items-center gap-2 px-4 py-2 cursor-pointer ${i === active ? "bg-blue-50" : ""}`}
                >
                  <span className="text-[13px] text-[#1f2328] truncate flex-1 min-w-0">
                    <span className="font-semibold">{j.company}</span>
                    <span className="text-gray-400"> — </span>{j.title}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">{STLABEL[j.status] || j.status}</span>
                  <span className="text-[11px] font-bold text-blue-700 shrink-0 w-6 text-right">{j.score}</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400">&#8593;&#8595; navigate &middot; &#8629; open &middot; esc close</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
