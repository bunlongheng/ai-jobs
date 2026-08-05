"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

// Whole-row click -> job detail page, for EVERY status (New, Ready, Manual, Applied,
// Interviewing, Rejected, Archived - no exceptions). The entire <tr> is the hit target,
// so there are no dead zones. Clicking the external "open posting" arrow (marked
// data-external) opens the source site instead of navigating. Carries the current
// ?min filter into the detail URL so "back to board" returns to the same filter you
// were on, not the default. (owner request 2026-08-05)
export default function RowLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <tr
      className={className}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a[data-external]")) return;
        const min = sp.get("min");
        router.push(`/jobs/${id}${min !== null ? `?min=${min}` : ""}`);
      }}
    >
      {children}
    </tr>
  );
}
