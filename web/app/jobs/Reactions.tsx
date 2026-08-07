"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./Toast";
import { confirmDialog } from "./ConfirmModal";

// One consistent icon row for every job action (owner request 2026-08-06 - no more mixed
// buttons + icons): Applied toggle, Hold-off (company), Heart, Dislike, Expire, Delete.
export default function Reactions({ id, liked, status, appliedAt, company }: {
  id: string; liked: number | null; status?: string | null; appliedAt?: string | null; company?: string | null;
}) {
  const router = useRouter();
  const [val, setVal] = useState<number>(liked ?? 0);
  const [expired, setExpired] = useState<boolean>(status === "expired");
  const [applied, setApplied] = useState<boolean>(status === "applied");
  const [, start] = useTransition();
  const refresh = () => start(() => router.refresh());

  function toggleApplied(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const next = !applied;
    setApplied(next);
    toast(next ? "Marked applied - back to Ready" : "Back to Ready", next ? "#16a34a" : "#2563eb");
    fetch("/api/jobs/applied", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, applied: next }) })
      // On APPLY, jump straight back to the board's Ready list so you can grab the next one.
      // On undo, just refresh in place. (owner request 2026-08-06)
      .then(() => { if (next) start(() => router.push("/jobs?open=kit_ready")); else refresh(); });
  }

  async function holdCompany(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!company) return;
    const ok = await confirmDialog({ title: `Hold off on "${company}"?`, body: "All their jobs move to Archived while you size them up - still in the database, and you can bring them back anytime.", confirmLabel: "Hold off" });
    if (!ok) return;
    const r = await fetch("/api/jobs/hold-company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company }) }).then((x) => x.json());
    toast(`Put ${r.updated} ${company} job${r.updated === 1 ? "" : "s"} on hold`, "#6366f1");
    start(() => router.push("/jobs"));
  }

  function set(next: number, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const v = val === next ? 0 : next; // click again to undo
    setVal(v);
    toast(v === 1 ? "Hearted" : v === -1 ? "Not interested - hidden" : "Cleared", v === 1 ? "#e11d48" : v === -1 ? "#64748b" : "#94a3b8");
    fetch("/api/jobs/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, liked: v }) }).then(refresh);
  }

  function toggleExpire(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const next = !expired;
    setExpired(next);
    toast(next ? "Marked expired" : "Restored to Ready", next ? "#d97706" : "#2563eb");
    fetch("/api/jobs/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, expired: next }) }).then(refresh);
  }

  async function deleteJob(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const ok = await confirmDialog({ title: "Delete this job?", body: "It will be removed from every panel, including Archived.", confirmLabel: "Delete" });
    if (!ok) return;
    toast("Deleted", "#ef4444");
    fetch("/api/jobs/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, deleted: true }) }).then(refresh);
  }

  const S = 17;
  return (
    <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button onClick={toggleApplied} title={applied ? `Applied${appliedAt ? ` · ${appliedAt}` : ""} - click to undo` : "Mark as applied"} aria-label="Applied"
        className={`transition-colors ${applied ? "text-green-600" : "text-gray-300 hover:text-green-500"}`}>
        <svg width={S} height={S} viewBox="0 0 24 24" fill={applied ? "currentColor" : "none"} stroke={applied ? "#fff" : "currentColor"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" stroke={applied ? "currentColor" : "currentColor"} /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
      </button>
      {/* Hold-off makes no sense once you've applied - hide it entirely for applied jobs. (owner 2026-08-06) */}
      {applied ? null : (
        <button onClick={holdCompany} title={`Hold off on all ${company || "this company"}'s jobs`} aria-label="Hold off"
          className="transition-colors text-gray-300 hover:text-indigo-500">
          <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        </button>
      )}
      <span className="w-px h-4 bg-gray-200" />
      <button onClick={(e) => set(1, e)} title="Heart - keep this one" aria-label="Heart"
        className={`transition-colors ${val === 1 ? "text-rose-500" : "text-gray-300 hover:text-rose-400"}`}>
        <svg width={S} height={S} viewBox="0 0 24 24" fill={val === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>
      </button>
      <button onClick={(e) => set(-1, e)} title="Not interested - hide it" aria-label="Dislike"
        className={`transition-colors ${val === -1 ? "text-gray-600" : "text-gray-300 hover:text-gray-600"}`}>
        <svg width={S} height={S} viewBox="0 0 24 24" fill={val === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></svg>
      </button>
      <button onClick={toggleExpire} title="Expired - move to Archive" aria-label="Mark expired"
        className={`transition-colors ${expired ? "text-amber-600" : "text-gray-300 hover:text-amber-500"}`}>
        <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
      </button>
      <button onClick={deleteJob} title="Delete - remove completely (incl. Archived)" aria-label="Delete"
        className="transition-colors text-gray-300 hover:text-red-600">
        <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    </span>
  );
}
