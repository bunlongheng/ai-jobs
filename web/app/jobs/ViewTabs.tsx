"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Small top-right segmented toggle: "Myself" (the board) vs "Recruiter" (the call sheet).
// (owner request 2026-08-09)
export default function ViewTabs() {
  const path = usePathname();
  const onRecruiter = !!path?.startsWith("/jobs/recruiters");
  const cls = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-[12px] font-bold no-underline transition-colors ${active ? "bg-white shadow-sm text-blue-700" : "text-gray-500 hover:text-gray-700"}`;
  return (
    <div className="inline-flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 shrink-0">
      <Link href="/jobs" className={cls(!onRecruiter)} title="I find jobs">Myself</Link>
      <Link href="/jobs/recruiters" className={cls(onRecruiter)} title="Recruiters find for me">Recruiter</Link>
    </div>
  );
}
