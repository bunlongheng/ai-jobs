"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// Whole-row click -> job detail page, for EVERY status (New, Ready, Manual, Applied,
// Interviewing, Rejected, Archived - no exceptions). The entire <tr> is the hit target,
// so there are no dead zones. Clicking the external "open posting" arrow (marked
// data-external) opens the source site instead of navigating. (owner request 2026-08-05)
export default function RowLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className={className}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a[data-external]")) return;
        router.push(`/jobs/${id}`);
      }}
    >
      {children}
    </tr>
  );
}
