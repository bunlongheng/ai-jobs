"use client";
import { useEffect, useRef, useState } from "react";

// Per-firm "next meeting" datetime. Collapsed to a calendar icon; click it to pick a date + time
// for the next meeting with this recruiter. Once set the icon lights up (solid rose) and hovering
// it shows the scheduled date/time. Debounced save to recruiter_status.meeting_at. (owner 2026-08-10)
const CAL = "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";

function pretty(v: string): string {
  // v is "YYYY-MM-DDTHH:mm" (local). Format as "Tue Aug 12, 2:30 PM".
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function RecruiterMeeting({ firm, initial }: { firm: string; initial: string }) {
  const [val, setVal] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMeeting = val.trim() !== "";

  function save(v: string) {
    setVal(v);
    setSaved(false);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(async () => {
      try {
        await fetch("/api/jobfill/recruiter-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firm, meeting: v }) });
        setSaved(true);
      } catch { /* keep local value */ }
    }, 500);
  }
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);

  return (
    <div className="relative inline-flex">
      <button onClick={() => setOpen((o) => !o)} title={hasMeeting ? `Next meeting: ${pretty(val)}` : "Schedule next meeting"}
        className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${hasMeeting ? "bg-rose-500 border-rose-500 text-white" : "border-gray-300 text-gray-400 bg-white hover:bg-gray-50"}`}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={CAL} /></svg>
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-20 flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg shadow-md px-2 py-1.5">
          <span className="text-[11px] text-gray-400 whitespace-nowrap">Next meeting</span>
          <style>{`.dt-input{color-scheme:light}.dt-input::-webkit-datetime-edit,.dt-input::-webkit-datetime-edit-text,.dt-input::-webkit-datetime-edit-month-field,.dt-input::-webkit-datetime-edit-day-field,.dt-input::-webkit-datetime-edit-year-field,.dt-input::-webkit-datetime-edit-hour-field,.dt-input::-webkit-datetime-edit-minute-field,.dt-input::-webkit-datetime-edit-ampm-field{color:#1f2328}`}</style>
          <input autoFocus type="datetime-local" value={val} onChange={(e) => save(e.target.value)}
            className="dt-input text-[12px] text-[#1f2328] font-medium rounded-md border border-gray-300 px-2 py-1 focus:border-rose-400 focus:outline-none" />
          {val ? <button onClick={() => save("")} title="Clear" className="text-[11px] text-gray-400 hover:text-rose-500 px-1">clear</button> : null}
          {saved && val ? <span className="text-[10px] text-green-600 font-bold">saved</span> : null}
        </div>
      ) : null}
    </div>
  );
}
