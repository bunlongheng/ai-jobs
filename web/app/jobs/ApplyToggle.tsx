"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// One-click "Applied" toggle on the detail page - manual + instant, no waiting on Gmail
// detection. Checked -> status=applied + applied_at=today; undo -> back to kit_ready.
export default function ApplyToggle({ id, status, appliedAt }: { id: string; status: string | null; appliedAt: string | null }) {
  const router = useRouter();
  const [applied, setApplied] = useState(status === "applied");
  const [date, setDate] = useState(appliedAt);
  const [busy, start] = useTransition();

  function set(next: boolean) {
    setApplied(next);
    fetch("/api/jobs/applied", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, applied: next }),
    })
      .then((r) => r.json())
      .then((d) => { setDate(d.applied_at ?? null); start(() => router.refresh()); });
  }

  if (applied) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white font-bold text-[13px] px-4 py-2 rounded-lg">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          Applied{date ? ` · ${date}` : ""}
        </span>
        <button onClick={() => set(false)} disabled={busy} className="text-xs text-gray-400 hover:text-gray-600 underline">undo</button>
      </span>
    );
  }
  return (
    <button onClick={() => set(true)} disabled={busy} className="inline-flex items-center gap-1.5 bg-green-700 hover:bg-green-800 text-white font-bold text-[13px] px-4 py-2 rounded-lg disabled:opacity-60">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      Mark as Applied
    </button>
  );
}
