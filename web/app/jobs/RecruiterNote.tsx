"use client";
import { useEffect, useRef, useState } from "react";

// Per-firm "who did I speak to?" note. Collapsed to a person icon by default; click it to reveal
// the name input. Once a name is saved the icon lights up, and hovering it shows the name.
// Debounced save to recruiter_status.note. (owner request 2026-08-10)
const USER = "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z";

export default function RecruiterNote({ firm, initial }: { firm: string; initial: string }) {
  const [val, setVal] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasName = val.trim() !== "";

  function onChange(v: string) {
    setVal(v);
    setSaved(false);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(async () => {
      try {
        await fetch("/api/jobfill/recruiter-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firm, note: v }) });
        setSaved(true);
      } catch { /* keep local value */ }
    }, 600);
  }
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);

  return (
    <div className="relative inline-flex">
      <button onClick={() => setOpen((o) => !o)} title={hasName ? `Spoke to ${val.trim()}` : "Who did you speak to?"}
        className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${hasName ? "bg-slate-700 border-slate-700 text-white" : "border-gray-300 text-gray-400 bg-white hover:bg-gray-50"}`}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={USER} /></svg>
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-20 flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg shadow-md px-2 py-1.5">
          <span className="text-[11px] text-gray-400 whitespace-nowrap">Spoke to</span>
          <input autoFocus value={val} onChange={(e) => onChange(e.target.value)} placeholder="add a name..."
            className="text-[12px] w-[130px] rounded-md border border-gray-300 px-2 py-1 focus:border-indigo-400 focus:outline-none" />
          {saved && val ? <span className="text-[10px] text-green-600 font-bold">saved</span> : null}
        </div>
      ) : null}
    </div>
  );
}
