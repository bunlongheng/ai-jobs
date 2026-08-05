"use client";
import { useEffect, useState } from "react";

// Discrete scroll-spy dot rail (bottom-right), like the one on bunlongheng.com. Shows one
// dot per panel present on the board; the active dot (panel currently in view) lights up in
// that panel's color, and clicking a dot scrolls to it. (owner request 2026-08-05)
const PANELS = [
  { id: "panel-planned", label: "New", color: "#38bdf8" },
  { id: "panel-kit_only", label: "Not ready", color: "#3b82f6" },
  { id: "panel-kit_ready", label: "Ready", color: "#4f46e5" },
  { id: "panel-applied", label: "Applied", color: "#10b981" },
  { id: "panel-archived", label: "Archived", color: "#64748b" },
];

export default function PanelNav() {
  const [present, setPresent] = useState<string[]>([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    const els = PANELS.map((p) => document.getElementById(p.id)).filter(Boolean) as HTMLElement[];
    setPresent(els.map((e) => e.id));
    if (els.length < 2) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, []);

  const shown = PANELS.filter((p) => present.includes(p.id));
  if (shown.length < 2) return null;
  return (
    <nav aria-label="Jump to panel" className="fixed right-3.5 bottom-5 z-40 flex flex-col items-center gap-2.5">
      {shown.map((p) => {
        const on = active === p.id;
        return (
          <button
            key={p.id}
            title={p.label}
            aria-label={p.label}
            onClick={() => document.getElementById(p.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="rounded-full transition-all duration-200 hover:scale-125"
            style={{
              width: on ? 11 : 8,
              height: on ? 11 : 8,
              background: on ? p.color : "#cbd5e1",
              boxShadow: on ? `0 0 0 3px ${p.color}33` : "none",
            }}
          />
        );
      })}
    </nav>
  );
}
