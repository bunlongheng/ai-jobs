"use client";
import Link from "next/link";
import { useState } from "react";

const LINKS = [
  { href: "/jobs", label: "Board" },
  { href: "/jobs/ai", label: "Apply queue" },
  { href: "/jobs/skills", label: "Skills" },
  { href: "/jobs/answers", label: "Screening answers" },
];

// Top-right hamburger: collapses the page nav into one menu (owner request 2026-07-24).
export default function JobsMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        className="flex items-center justify-center w-9 h-9 rounded-[10px] border border-gray-200 bg-white shadow-sm text-gray-700 hover:bg-gray-50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-20 w-52 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden py-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-[13px] font-semibold text-[#1f2328] no-underline hover:bg-gray-50 hover:text-blue-700"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
