"use client";
import Link from "next/link";
import { useState } from "react";

// Compact score-filter dropdown (replaces the spread-out pill row). tiers + counts are
// passed in from the server so this client component never imports the db. (2026-07-24)
export default function ScoreMenu({ min, buckets, tiers }: { min: number; buckets: Record<number, number>; tiers: number[] }) {
  const [open, setOpen] = useState(false);
  const label = min === 0 ? "All scores" : `${min}+`;
  const opts = [{ v: 0, l: "All scores", n: -1 }, ...tiers.map((t) => ({ v: t, l: `${t}+`, n: buckets[t] ?? 0 }))];
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white shadow-sm px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:border-blue-300"
      >
        <span className="text-gray-400 font-normal">Min score</span>
        {label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1.5 z-20 w-44 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden py-1">
            {opts.map(({ v, l, n }) => (
              <Link
                key={v}
                href={v === 0 ? "/jobs?min=0" : `/jobs?min=${v}`}
                scroll={false}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2 text-[13px] no-underline ${min === v ? "bg-blue-50 text-blue-700 font-bold" : "text-[#1f2328] hover:bg-gray-50"}`}
              >
                <span>{l}</span>
                {n >= 0 ? <span className={min === v ? "text-blue-400" : "text-gray-400"}>{n}</span> : null}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
