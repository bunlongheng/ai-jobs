"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type J = { id: string; title: string; company: string; score: number; status: string };

const STLABEL: Record<string, string> = {
  planned: "New", kit_ready: "Ready", kit_only: "Not ready", manual_only: "Manual", applied: "Applied",
  interviewing: "Interviewing", rejected: "Rejected", skipped: "Skipped", offer: "Offer",
};

// Deterministic vivid tile color from the company name - gives every job an app-icon-style
// colored initial tile (like the launcher the owner likes) with zero image payload.
function hue(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }

// Cmd/Ctrl+K palette - blurred backdrop, app-launcher styling (colored logo tile + company
// over role), arrow-navigate with the active item auto-scrolled into view, Enter opens the
// detail (preserving ?min). Neutral/black accents on purpose so the content pops - no blue.
// (owner request 2026-08-05)
export default function CommandK({ jobs, logos = {} }: { jobs: J[]; logos?: Record<string, string> }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
    if (!t) return jobs.slice(0, 20);
    return jobs
      .filter((j) => j.title.toLowerCase().includes(t) || j.company.toLowerCase().includes(t))
      .slice(0, 50);
  }, [q, jobs]);

  // Keep the keyboard-selected row scrolled into view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, results.length]);

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
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-start justify-center px-4 pt-[12vh]">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[640px] bg-white rounded-2xl shadow-2xl ring-1 ring-black/10 overflow-hidden">
            {/* search row */}
            <div className="flex items-center gap-3 px-5 h-[60px] border-b border-gray-100">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); go(results[active]?.id); }
                }}
                placeholder="Open a job..."
                className="flex-1 h-full text-[16px] bg-transparent text-[#1f2328] placeholder:text-gray-400 border-0 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus:border-0 appearance-none"
                style={{ outline: "none", boxShadow: "none" }}
              />
              <span className="text-[10px] font-medium text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 shrink-0">ESC</span>
            </div>

            {/* results */}
            <div ref={listRef} className="max-h-[56vh] overflow-y-auto py-2">
              {results.length === 0 ? (
                <div className="px-5 py-8 text-[13px] text-gray-400 text-center">No jobs match &ldquo;{q}&rdquo;</div>
              ) : results.map((j, i) => {
                const on = i === active;
                const initial = (j.company || j.title || "?").trim().charAt(0).toUpperCase();
                const logo = logos[j.company];
                return (
                  <div
                    key={j.id}
                    data-idx={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(j.id)}
                    className={`mx-2 px-3 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer ${on ? "bg-gray-100" : ""}`}
                  >
                    {logo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={logo} alt="" width={42} height={42} className="shrink-0 rounded-[11px] bg-white object-contain ring-1 ring-black/5" style={{ width: 42, height: 42, padding: 5 }} />
                    ) : (
                      <span
                        className="shrink-0 grid place-items-center rounded-[11px] text-white font-bold text-[17px] shadow-sm"
                        style={{ width: 42, height: 42, background: `hsl(${hue(j.company || j.title)} 62% 46%)` }}
                      >{initial}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-[#1f2328] truncate">{j.company || j.title}</span>
                      <span className="block text-[12px] text-gray-500 truncate">{j.title}</span>
                    </span>
                    <span className="shrink-0 flex items-center gap-2.5">
                      <span className="text-[10px] text-gray-400">{STLABEL[j.status] || j.status}</span>
                      <span className="text-[12px] font-bold text-gray-800 tabular-nums w-6 text-right">{j.score}</span>
                      {on ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg> : <span style={{ width: 16 }} />}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* footer */}
            <div className="flex items-center gap-4 px-5 h-11 border-t border-gray-100 text-[11px] text-gray-400">
              <span className="flex items-center gap-1"><Kbd>&#8593;</Kbd><Kbd>&#8595;</Kbd> navigate</span>
              <span className="flex items-center gap-1"><Kbd>&#8629;</Kbd> open</span>
              <span className="flex items-center gap-1"><Kbd>&#8984;</Kbd><Kbd>K</Kbd> toggle</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded bg-gray-100 border border-gray-200 text-gray-500 text-[10px] font-medium">{children}</span>;
}
