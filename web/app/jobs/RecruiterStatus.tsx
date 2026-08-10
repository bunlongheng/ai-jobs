"use client";
import { useState } from "react";

// Independent outreach checkboxes per recruiter firm - Called, Emailed, Voicemail, and Replied can
// each be on at once. Persists to recruiter_status via the API, optimistic. (owner request 2026-08-09)
const FLAGS: { k: string; label: string; on: string; d: string }[] = [
  { k: "called", label: "Called", on: "bg-green-600 border-green-600 text-white", d: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" },
  { k: "emailed", label: "Emailed", on: "bg-indigo-600 border-indigo-600 text-white", d: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 6L2 7" },
  { k: "voicemail", label: "Voicemail", on: "bg-amber-500 border-amber-500 text-white", d: "M6 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM18 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM6 17h12" },
  { k: "replied", label: "Replied", on: "bg-teal-600 border-teal-600 text-white", d: "M9 14 4 9l5-5M4 9h10a5 5 0 0 1 5 5v3" },
];

export default function RecruiterStatus({ firm, initial }: { firm: string; initial: string[] }) {
  const [set, setSet] = useState<Set<string>>(new Set(initial));
  async function toggle(k: string) {
    const next = new Set(set);
    if (next.has(k)) next.delete(k); else next.add(k);
    setSet(next); // optimistic
    try {
      await fetch("/api/jobfill/recruiter-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firm, flag: k }) });
    } catch { /* keep optimistic state; a reload re-reads the DB */ }
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {FLAGS.map((f) => {
        const on = set.has(f.k);
        return (
          <button key={f.k} onClick={() => toggle(f.k)} aria-pressed={on} type="button"
            className={`text-[11px] font-bold rounded-full border px-2.5 py-1 inline-flex items-center gap-1 transition-colors ${on ? f.on : "border-gray-300 text-gray-400 bg-white hover:bg-gray-50"}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={f.d} /></svg>
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
