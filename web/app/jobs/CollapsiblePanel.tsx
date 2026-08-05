"use client";
import { useEffect, useState } from "react";

// Collapsible board panel - click the header to fold a whole pile away so you can focus
// on one panel at a time. Collapsed state is remembered per-panel in localStorage, so a
// panel you close stays closed across refreshes. (owner request 2026-08-05)
export default function CollapsiblePanel({
  status, label, count, gradient, archived, defaultCollapsed, breakdown, children,
}: {
  status: string; label: string; count: number; gradient: string;
  archived?: boolean; defaultCollapsed?: boolean; breakdown: React.ReactNode; children: React.ReactNode;
}) {
  const key = `jobs-panel-collapsed:${status}`;
  const [open, setOpen] = useState(!defaultCollapsed);
  useEffect(() => {
    // Respect a saved choice; otherwise fall back to the panel's default (Not-ready starts
    // collapsed so Ready is the focus). (owner request 2026-08-05)
    try { const v = localStorage.getItem(key); setOpen(v === null ? !defaultCollapsed : v !== "1"); } catch {}
  }, [key, defaultCollapsed]);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      try { localStorage.setItem(key, next ? "0" : "1"); } catch {}
      return next;
    });
  }

  return (
    <div id={`panel-${status}`} className={`mt-6 scroll-mt-4 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden ${archived ? "opacity-75 [&_img]:grayscale" : ""}`}>
      <button
        onClick={toggle}
        aria-expanded={open}
        title={open ? "Click to collapse" : "Click to expand"}
        className={`w-full bg-gradient-to-r ${gradient} px-4 py-2.5 flex items-center justify-between gap-2 text-left`}
      >
        <div className="flex items-center gap-2 shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 text-white/90" style={{ transform: open ? "rotate(90deg)" : "none" }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <h3 className="text-sm font-bold tracking-wide text-white">{label}</h3>
          <span className="text-xs font-bold rounded-full px-2.5 py-0.5 bg-white/30 text-white">{count}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">{breakdown}</div>
      </button>
      {open ? children : null}
    </div>
  );
}
