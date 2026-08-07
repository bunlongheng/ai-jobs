"use client";
import { useState } from "react";
import { toast } from "./Toast";
import { useScanKind } from "./ScanSpinner";

// Ready-scan trigger in the "Ready" panel header. This is the CLEANLINESS / reliability check
// (job-ready-eval): no browser, proves each green kit still has its cover PDF + resume + answered
// screening questions, and demotes anything that can't prove it. Distinct from the Not-ready
// panel's PRE-SCAN, which fills forms. Icon only, stops propagation. (owner split 2026-08-07)
export default function ReadyScanIcon() {
  const [busy, setBusy] = useState(false);
  const scanning = useScanKind() === "ready";
  const spin = busy || scanning;
  async function go(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/jobfill/readyscan", { method: "POST" }).then((x) => x.json());
      if (r.already) toast("A scan is already running", "#6366f1");
      else if (!r.count) toast("No Ready jobs to verify", "#16a34a");
      else toast(`Verifying ${r.count} Ready jobs - re-proving each is truly ready`, "#4f46e5");
    } catch { toast("Could not start ready-scan", "#dc2626"); }
    setTimeout(() => setBusy(false), 1500);
  }
  return (
    <span role="button" tabIndex={0} onClick={go} title={scanning ? "Verifying the Ready pile now..." : "Re-verify the Ready pile is truly ready (0 tokens)"}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/25 hover:bg-white/40 text-white cursor-pointer">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={spin ? "animate-spin" : ""}>
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" />
      </svg>
    </span>
  );
}
