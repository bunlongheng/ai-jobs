"use client";
import { useRouter, useSearchParams } from "next/navigation";

// Piles the board expands when the URL carries no ?open= choice. Owner's default landing is
// the READY pile at 60+ (score default handled server-side) - so a fresh visit opens Ready
// and folds everything else. (owner request 2026-08-06)
const DEFAULT_OPEN = ["kit_ready"];

// One clean icon per panel - a bit of character, consistent across the board. White stroke
// so it sits on the gradient header. (owner request 2026-08-06)
function PanelIcon({ status }: { status: string }) {
  const p: Record<string, string> = {
    kit_only: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M3 3l18 18", // eye crossed out - not ready to look at
    kit_ready: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",         // eye - ready to look at
    applied: "M22 2 11 13M22 2l-7 20-4-9-9-4z",                                                      // paper plane - applied
    manual_only: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2 2-2.6-.7-.7-2.7z", // wrench - manual
    archived: "M3 5h18v4H3zM5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M9 13h6",                          // archive box
  };
  const d = p[status];
  if (!d) return null;
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white shrink-0" aria-hidden><path d={d} /></svg>;
}

// Collapsible board panel - click the header to fold a whole pile away. Open/closed
// state lives ENTIRELY in the URL (?open=kit_only,applied) so the address bar is the
// single source of truth: reloadable, bookmarkable, and back-button friendly. When the
// ?open param is absent we fall back to DEFAULT_OPEN; when it is present (even empty) it
// is taken literally. Score stays on ?min, so the whole view reads off the URL. (owner
// request 2026-08-05)
export default function CollapsiblePanel({
  status, label, count, gradient, archived, breakdown, action, children, defaultOpen,
}: {
  status: string; label: string; count: number; gradient: string;
  archived?: boolean; breakdown: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("open");
  // With no ?open in the URL, use the server-computed default (defaultOpen) when provided - so a
  // fresh board with only "New matches" opens it - else fall back to the static DEFAULT_OPEN list.
  const open = raw === null
    ? (defaultOpen ?? DEFAULT_OPEN.includes(status))
    : new Set(raw.split(",").filter(Boolean)).has(status);

  function toggle() {
    // Base the new open-set on the URL (or DEFAULT_OPEN when absent), then flip THIS panel to
    // the opposite of its true current state so a defaultOpen panel collapses on first click.
    const next = raw === null ? new Set(DEFAULT_OPEN) : new Set(raw.split(",").filter(Boolean));
    if (open) next.delete(status); else next.add(status);
    const params = new URLSearchParams(sp.toString());
    params.set("open", Array.from(next).join(","));
    // replace (not push) so accordion clicks don't flood the back stack; the URL still
    // reflects the exact open set for reload/share.
    router.replace(`/jobs?${params.toString()}`, { scroll: false });
  }

  return (
    <div id={`panel-${status}`} className={`mt-3.5 sm:mt-6 scroll-mt-4 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden ${archived ? "opacity-75 [&_img]:grayscale" : ""}`}>
      <button
        onClick={toggle}
        aria-expanded={open}
        title={open ? "Click to collapse" : "Click to expand"}
        className={`w-full bg-gradient-to-r ${gradient} px-4 py-2.5 flex items-center justify-between gap-2 text-left`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform duration-200 text-white/90" style={{ transform: open ? "rotate(90deg)" : "none" }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <PanelIcon status={status} />
          <h3 className="text-sm font-bold tracking-wide text-white truncate">{label}</h3>
          <span className="text-xs font-bold rounded-full px-2.5 py-0.5 bg-white/30 text-white shrink-0">{count}</span>
        </div>
        {/* Source-count pills (desktop only - they wrap into a mess on a phone) plus the scan /
            security action, floated to the far right so the header line reads consistently
            whether or not the pills are shown. (owner 2026-08-08) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end">{breakdown}</div>
          {action}
        </div>
      </button>
      {open ? children : null}
    </div>
  );
}
