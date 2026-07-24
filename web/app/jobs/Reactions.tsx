"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Heart to keep, thumbs-down to hide ("don't show me again"). liked: 1 hearted, -1
// disliked (row vanishes - board filters it), 0 neutral. (owner request 2026-07-24)
export default function Reactions({ id, liked }: { id: string; liked: number | null }) {
  const router = useRouter();
  const [val, setVal] = useState<number>(liked ?? 0);
  const [, start] = useTransition();

  function set(next: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const v = val === next ? 0 : next; // click again to undo
    setVal(v);
    fetch("/api/jobs/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, liked: v }),
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 2h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2m-3-11H8.5a3 3 0 0 0-3 2.4l-1.3 6A3 3 0 0 0 7.2 15H10v4a2 2 0 0 0 2 2l3-8V2z" transform="rotate(180 12 12)" />
        </svg>
      </button>
    </span>
  );
}
