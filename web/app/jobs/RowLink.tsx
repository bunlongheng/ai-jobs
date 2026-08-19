"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

// Whole-row link -> job detail page, for EVERY status. The entire <tr> is the hit target (no dead
// zones) AND it is keyboard-accessible: role=link + tabIndex so it focuses, Enter/Space activate it,
// aria-label names the job for screen readers, and a focus ring shows keyboard focus. Clicking the
// external "open posting" arrow (data-external) opens the source instead. Carries the ?min filter
// so "back to board" returns to the same view. (owner request 2026-08-05; a11y 2026-08-14)
export default function RowLink({ id, className, label, dataSrc, children }: { id: string; className?: string; label?: string; dataSrc?: string; children: ReactNode }) {
  const router = useRouter();
  const sp = useSearchParams();
  const go = () => {
    const min = sp.get("min");
    router.push(`/jobs/${id}${min !== null ? `?min=${min}` : ""}`);
  };
  return (
    <tr
      data-row-src={dataSrc}
      className={`${className || ""} focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400`}
      role="link"
      tabIndex={0}
      aria-label={label ? `Open ${label}` : "Open job detail"}
      onClick={(e) => { if ((e.target as HTMLElement).closest("a[data-external]")) return; go(); }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("a")) return; // let real links inside handle their own keys
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      }}
    >
      {children}
    </tr>
  );
}
