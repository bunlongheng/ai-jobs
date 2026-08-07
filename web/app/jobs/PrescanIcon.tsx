"use client";
import { useState } from "react";
import { toast } from "./Toast";
import { useScanKind } from "./ScanSpinner";

// Tiny prescan trigger that lives in the "Not ready" panel header, next to the count. Icon
// only - no text. Stops propagation so it never toggles the panel. Kicks the headless
// prescan; the per-row spinners show progress. Zero AI tokens. (owner request 2026-08-06)
export default function PrescanIcon() {
  const [busy, setBusy] = useState(false);
  const scanning = useScanKind() === "prescan";
  const spin = busy || scanning;
  async function go(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/jobfill/prescan", { method: "POST" }).then((x) => x.json());
      if (r.already) toast("Prescan already running", "#6366f1");
      else if (!r.count) toast("Nothing to prescan - all caught up", "#16a34a");
      else toast(`Prescanning ${r.count} - watch the row spinners`, "#2563eb");
    } catch { toast("Could not start prescan", "#dc2626"); }
    setTimeout(() => setBusy(false), 1500);
  }
  return (
    <span role="button" tabIndex={0} onClick={go} title={scanning ? "Prescanning the Not-ready pile now..." : "Prescan the Not-ready pile now (0 tokens)"}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/25 hover:bg-white/40 text-white cursor-pointer">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={spin ? "animate-spin" : ""}>
        <path d="M20 11a8 8 0 0 0-14-4.9M4 4v3.5h3.5" /><path d="M4 13a8 8 0 0 0 14 4.9M20 20v-3.5h-3.5" />
      </svg>
    </span>
  );
}
