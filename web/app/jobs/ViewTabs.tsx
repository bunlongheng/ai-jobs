"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Top-level view switch: "Myself" (I find jobs - the board) vs "Recruiter" (recruiters find for
// me - the call sheet). Same look on both pages so it reads as one app. (owner request 2026-08-09)
export default function ViewTabs() {
  const path = usePathname();
  const onRecruiter = !!path?.startsWith("/jobs/recruiters");
  const base = "flex-1 text-center rounded-lg px-3 py-2 no-underline transition-colors leading-tight";
  return (
    <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1 mb-4">
      <Link href="/jobs" className={`${base} ${!onRecruiter ? "bg-white shadow-sm" : "hover:bg-gray-50"}`}>
        <div className={`text-[13px] sm:text-sm font-bold ${!onRecruiter ? "text-blue-700" : "text-gray-500"}`}>🧑‍💻 Myself</div>
        <div className="text-[10px] text-gray-400">I find jobs</div>
      </Link>
      <Link href="/jobs/recruiters" className={`${base} ${onRecruiter ? "bg-white shadow-sm" : "hover:bg-gray-50"}`}>
        <div className={`text-[13px] sm:text-sm font-bold ${onRecruiter ? "text-indigo-700" : "text-gray-500"}`}>🤝 Recruiter</div>
        <div className="text-[10px] text-gray-400">Recruiters find for me</div>
      </Link>
    </div>
  );
}
