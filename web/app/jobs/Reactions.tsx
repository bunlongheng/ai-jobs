"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./Toast";

// Heart to keep, thumbs-down to hide, clock to mark EXPIRED. liked: 1 hearted, -1
// disliked (row vanishes), 0 neutral. Expire sets status='expired' -> Archived list.
// (owner request 2026-07-24, expire added 2026-08-05)
export default function Reactions({ id, liked, status }: { id: string; liked: number | null; status?: string | null }) {
  const router = useRouter();
  const [val, setVal] = useState<number>(liked ?? 0);
  const [expired, setExpired] = useState<boolean>(status === "expired");
  const [, start] = useTransition();

  function set(next: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const v = val === next ? 0 : next; // click again to undo
    setVal(v);
    toast(v === 1 ? "Hearted" : v === -1 ? "Not interested - hidden" : "Cleared", v === 1 ? "#e11d48" : v === -1 ? "#64748b" : "#94a3b8");
    fetch("/api/jobs/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, liked: v }),
    }).then(() => start(() => router.refresh()));
  }

  function toggleExpire(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !expired;
    setExpired(next);
    toast(next ? "Marked expired" : "Restored to Ready", next ? "#d97706" : "#2563eb");
    fetch("/api/jobs/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, expired: next }),
    }).then(() => start(() => router.refresh()));
  }

  function deleteJob(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this job completely? It will be removed from every panel, including Archived.")) return;
    toast("Deleted", "#ef4444");
    fetch("/api/jobs/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, deleted: true }),
    }).then(() => start(() => router.refresh()));
  }

  return (
    <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => set(1, e)}
        title="Heart - keep this one"
        aria-label="Heart"
        className={`transition-colors ${val === 1 ? "text-rose-500" : "text-gray-300 hover:text-rose-400"}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={val === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
      </button>
      <button
        onClick={(e) => set(-1, e)}
        title="Not interested - hide it"
        aria-label="Dislike"
        className={`transition-colors ${val === -1 ? "text-gray-600" : "text-gray-300 hover:text-gray-600"}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={val === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
        </svg>
      </button>
      <button
        onClick={toggleExpire}
        title="Expired - move to Archive"
        aria-label="Mark expired"
        className={`transition-colors ${expired ? "text-amber-600" : "text-gray-300 hover:text-amber-500"}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      </button>
      <button
        onClick={deleteJob}
        title="Delete - remove completely (incl. Archived)"
        aria-label="Delete"
        className="transition-colors text-gray-300 hover:text-red-600"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </span>
  );
}
