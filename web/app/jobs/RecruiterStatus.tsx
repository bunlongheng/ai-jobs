"use client";
import { useState } from "react";

// Independent outreach checkboxes per recruiter firm - Called and Emailed can both be on (plus a
// Replied flag for the outcome that matters). Persists to recruiter_status via the API, optimistic.
// (owner request 2026-08-09)
const FLAGS: { k: string; label: string; on: string }[] = [
  { k: "called", label: "Called", on: "bg-green-600 border-green-600 text-white" },
  { k: "emailed", label: "Emailed", on: "bg-indigo-600 border-indigo-600 text-white" },
  { k: "replied", label: "Replied", on: "bg-teal-600 border-teal-600 text-white" },
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
    <div className="flex items-center gap-1.5">
      {FLAGS.map((f) => {
        const on = set.has(f.k);
        return (
          <button key={f.k} onClick={() => toggle(f.k)} aria-pressed={on} type="button"
            className={`text-[11px] font-bold rounded-full border px-2.5 py-1 inline-flex items-center gap-1 transition-colors ${on ? f.on : "border-gray-300 text-gray-400 bg-white hover:bg-gray-50"}`}>
            <span className="text-[10px]">{on ? "✓" : "○"}</span>{f.label}
          </button>
        );
      })}
    </div>
  );
}
