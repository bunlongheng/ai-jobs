"use client";
import Link from "next/link";
import { useRef, useEffect } from "react";

// Score-filter dropdown on a native <details> so it OPENS on tap with zero client JS
// (a useState-controlled version was dead until hydration, which lags over the Tailscale
// HTTPS link). Options are plain <Link> anchors, so filtering works with no JS too.
// Client-only enhancement (2026-08-05): close the menu after picking an option and on
// any outside click - the native <details> otherwise stays open. Pre-hydration selects
// still close it because navigation re-renders the menu closed.
export default function ScoreMenu({ min, buckets, tiers }: { min: number; buckets: Record<number, number>; tiers: number[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const label = min === 0 ? "All scores" : `${min}+`;
  const opts = [{ v: 0, l: "All scores", n: -1 }, ...tiers.map((t) => ({ v: t, l: `${t}+`, n: buckets[t] ?? 0 }))];
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const d = ref.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const close = () => { if (ref.current) ref.current.open = false; };
  return (
    <details ref={ref} className="group relative inline-block">
      <summary className="list-none [&::-webkit-details-marker]:hidden flex items-center gap-1.5 h-9 rounded-[10px] border border-gray-200 bg-white shadow-sm px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer select-none">
        <span className="text-gray-400 font-normal">Score</span>
        {label}
        <svg className="transition-transform group-open:rotate-180" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </summary>
      <div className="absolute left-0 mt-1.5 z-20 w-44 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden py-1">
        {opts.map(({ v, l, n }) => (
          <Link
            key={v}
            href={v === 0 ? "/jobs?min=0" : `/jobs?min=${v}`}
            onClick={close}
            className={`flex items-center justify-between px-3.5 py-2 text-[13px] no-underline ${min === v ? "bg-blue-50 text-blue-700 font-bold" : "text-[#1f2328] hover:bg-gray-50"}`}
          >
            <span>{l}</span>
            {n >= 0 ? <span className={min === v ? "text-blue-400" : "text-gray-400"}>{n}</span> : null}
          </Link>
        ))}
      </div>
    </details>
  );
}
