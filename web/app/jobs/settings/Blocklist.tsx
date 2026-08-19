"use client";

import { useRef, useState } from "react";

type Match = { company: string; logo: string | null };

// Company blocklist manager. Add a company -> it (and all its jobs) vanish from every board /
// search view; remove it -> they come straight back (the rows are only filtered, never deleted).
// The input is a custom autocomplete: a logo'd dropdown anchored right under the field, fed by
// /api/jobs/companies so only the shown matches load their logos. (owner request 2026-08-17)
function LogoMark({ m }: { m: Match }) {
  if (m.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.logo} alt="" width={18} height={18} className="rounded-[4px] bg-white border border-gray-200 object-contain shrink-0" />;
  }
  const init = (m.company || "?").trim().slice(0, 1).toUpperCase();
  const hue = [...m.company].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span className="inline-flex items-center justify-center rounded-[4px] text-white text-[10px] font-bold shrink-0" style={{ width: 18, height: 18, background: `hsl(${hue} 55% 45%)` }}>{init}</span>
  );
}

export default function Blocklist({ initial }: { initial: Match[] }) {
  const [companies, setCompanies] = useState<Match[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const blockedLower = new Set(companies.map((c) => c.company.trim().toLowerCase()));

  async function search(q: string) {
    try {
      const r = await fetch(`/api/jobs/companies?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      const fresh: Match[] = (j.matches || []).filter((m: Match) => !blockedLower.has(m.company.trim().toLowerCase()));
      setMatches(fresh);
      setOpen(fresh.length > 0);
      setHi(0);
    } catch { /* offline - just skip suggestions */ }
  }

  function onInput(v: string) {
    setInput(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setOpen(false); setMatches([]); return; }
    timer.current = setTimeout(() => search(v.trim()), 110);
  }

  async function mutate(company: string, remove: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/jobs/blocklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company, remove }),
      });
      const j = await r.json();
      if (j.ok) setCompanies(j.companies);
    } finally {
      setBusy(false);
    }
  }

  function pick(company: string) {
    setInput("");
    setOpen(false);
    setMatches([]);
    mutate(company, false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (open && matches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter") { e.preventDefault(); pick(matches[hi].company); return; }
      if (e.key === "Escape") { setOpen(false); return; }
    }
    if (e.key === "Enter") { e.preventDefault(); const c = input.trim(); if (c) pick(c); }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
      <div className="bg-gradient-to-r from-rose-500 to-red-600 px-4 py-2.5 flex items-center justify-between gap-2">
        <h2 className="text-sm text-white tracking-wide flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white shrink-0" aria-hidden>
            <circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" />
          </svg>
          Company blocklist - hidden from the board
        </h2>
        <span className="text-[11px] font-semibold text-white bg-white/25 rounded-full px-2.5 py-0.5 shrink-0">{companies.length} blocked</span>
      </div>

      <div className="px-4 py-3.5">
        <p className="text-[12px] text-gray-500 mb-3">
          Hard block: hidden everywhere <strong>and never scraped again</strong>. Reversible - Unblock restores its jobs with history intact.
        </p>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <input
              value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => { if (matches.length) setOpen(true); }}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              placeholder="Start typing a company..."
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls="blocklist-suggest"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-[13px] outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
            />
            {open && matches.length > 0 && (
              <ul id="blocklist-suggest" className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto py-1">
                {matches.map((m, i) => (
                  <li key={m.company}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); pick(m.company); }}
                      onMouseEnter={() => setHi(i)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] ${i === hi ? "bg-rose-50 text-rose-800" : "text-gray-700"}`}
                    >
                      <LogoMark m={m} />
                      <span className="truncate">{m.company}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => { const c = input.trim(); if (c) pick(c); }}
            disabled={busy || !input.trim()}
            className="rounded-lg bg-red-600 text-white text-[13px] font-medium px-3.5 py-1.5 disabled:opacity-40 hover:bg-red-700"
          >
            Block
          </button>
        </div>

        {companies.length === 0 ? (
          <p className="text-[12px] text-gray-400 italic">No companies blocked. Everything shows on the board.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {companies.map((c) => (
              <li key={c.company} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 pl-1.5 pr-1.5 py-1 text-[13px] text-gray-800">
                <LogoMark m={c} />
                {c.company}
                <button
                  onClick={() => mutate(c.company, true)}
                  disabled={busy}
                  title={`Unblock ${c.company}`}
                  aria-label={`Unblock ${c.company}`}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-gray-400 hover:bg-gray-300 hover:text-gray-800 disabled:opacity-40"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
