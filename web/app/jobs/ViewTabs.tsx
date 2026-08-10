"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Prominent top-right segmented toggle: "AI" (the board) vs "Recruiter" (the call sheet). The active
// side is a solid colour pill so it reads at a glance. (owner request 2026-08-10)
const AI_ICON = "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z";
const REC_ICON = "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87";

function Ic({ d }: { d: string }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

export default function ViewTabs() {
  const path = usePathname();
  const onRecruiter = !!path?.startsWith("/jobs/recruiters");
  const cls = (active: boolean, onColor: string) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold no-underline transition-colors ${active ? onColor : "text-gray-500 hover:bg-gray-100"}`;
  return (
    <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm shrink-0">
      <Link href="/jobs" title="AI finds jobs for me" className={cls(!onRecruiter, "bg-blue-600 text-white shadow-sm")}><Ic d={AI_ICON} />AI</Link>
      <Link href="/jobs/recruiters" title="Recruiters find for me" className={cls(onRecruiter, "bg-indigo-600 text-white shadow-sm")}><Ic d={REC_ICON} />Recruiter</Link>
    </div>
  );
}
