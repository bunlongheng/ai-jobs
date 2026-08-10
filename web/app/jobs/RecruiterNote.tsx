"use client";
import { useEffect, useRef, useState } from "react";

// Small "who did I speak to?" note per firm - for general staffing houses with no named contact,
// so Bunlong can jot the person's name when he calls. Debounced save to recruiter_status.note.
// (owner request 2026-08-10)
export default function RecruiterNote({ firm, initial }: { firm: string; initial: string }) {
  const [val, setVal] = useState(initial);
  const [saved, setSaved] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[11px] text-gray-400 whitespace-nowrap">Spoke to</span>
      <input value={val} onChange={(e) => onChange(e.target.value)} placeholder="add a name..."
        className="text-[12px] w-[130px] rounded-md border border-gray-300 px-2 py-1 focus:border-indigo-400 focus:outline-none" />
      {saved && val ? <span className="text-[10px] text-green-600 font-bold">saved</span> : null}
    </div>
  );
}
