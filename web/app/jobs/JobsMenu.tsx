import Link from "next/link";

const LINKS = [
  { href: "/jobs/skills", label: "Skills" },
  { href: "/jobs/answers", label: "Screening answers" },
  { href: "/jobs/settings", label: "Settings - automations" },
];

// Top-right hamburger (owner request 2026-07-24). Native <details> so it opens on tap
// with zero client JS - the old useState version was dead on the phone until React
// hydrated over the slow Tailscale link. (fixed 2026-08-01)
export default function JobsMenu() {
  return (
    <details className="relative shrink-0">
      <summary
        aria-label="Menu"
        className="list-none [&::-webkit-details-marker]:hidden flex items-center justify-center w-9 h-9 rounded-[10px] border border-gray-200 bg-white shadow-sm text-gray-700 hover:bg-gray-50 cursor-pointer select-none"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </summary>
      <div className="absolute right-0 mt-2 z-20 w-52 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden py-1">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block px-4 py-2.5 text-[13px] font-semibold text-[#1f2328] no-underline hover:bg-gray-50 hover:text-blue-700"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
