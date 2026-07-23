import { getBoard } from "@/lib/queries";
import type { AppRow } from "@/lib/db";
import { getLogo } from "@/lib/logos";
import Link from "next/link";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic"; // always read live SQLite

const GRAD = ["#0969da", "#8250df", "#bf3989", "#1a7f37", "#9a6700", "#1b9aaa"];
function Logo({ company }: { company: string | null }) {
  const uri = getLogo(company);
  if (uri) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={uri} alt="" width={22} height={22} className="inline-block rounded-[5px] align-middle bg-white border border-gray-200 object-contain" />;
  }
  const name = (company || "?").trim();
  const init = name.slice(0, 1).toUpperCase();
  const bg = GRAD[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % GRAD.length];
  return <span className="inline-flex items-center justify-center rounded-[5px] align-middle text-white text-[12px] font-bold" style={{ width: 22, height: 22, background: bg }}>{init}</span>;
}

const TILE: Record<string, string> = {
  kit_ready: "bg-green-50 border-green-200 text-green-700",     // green = ready to apply
  applied: "bg-blue-50 border-blue-200 text-blue-700",           // blue = applied
  manual_only: "bg-amber-50 border-amber-200 text-amber-700",    // orange = manual
  rejected: "bg-red-50 border-red-200 text-red-600",             // red = rejected
  skipped: "bg-gray-50 border-gray-200 text-gray-400",
  interviewing: "bg-purple-50 border-purple-200 text-purple-700",
};
const DOT: Record<string, string> = {
  kit_ready: "#1a7f37", applied: "#0969da", manual_only: "#9a6700",
  rejected: "#cf222e", skipped: "#8a949e", interviewing: "#8250df",
};
// Color-coded gradient header per bucket (green / black / orange / red)
const HGRAD: Record<string, string> = {
  kit_ready: "from-emerald-500 to-green-600",
  applied: "from-blue-500 to-blue-700",
  manual_only: "from-amber-400 to-orange-500",
  rejected: "from-rose-500 to-red-600",
  interviewing: "from-purple-500 to-violet-600",
  skipped: "from-gray-400 to-gray-500",
};
// Row hover tint matching each panel's color
const HOVER: Record<string, string> = {
  kit_ready: "hover:bg-green-50",
  applied: "hover:bg-blue-50",
  manual_only: "hover:bg-amber-50",
  rejected: "hover:bg-red-50",
  interviewing: "hover:bg-purple-50",
  skipped: "hover:bg-gray-50",
};

// Derive the job source (ATS / board) from its apply URL.
function jobSource(url: string | null): string {
  if (!url || !url.startsWith("http")) return "-";
  const u = url.toLowerCase();
  if (u.includes("ashbyhq")) return "Ashby";
  if (u.includes("greenhouse") || u.includes("gh_jid")) return "Greenhouse";
  if (u.includes("lever.co")) return "Lever";
  if (u.includes("indeed")) return "Indeed";
  if (u.includes("linkedin")) return "LinkedIn";
  try {
    return new URL(url).hostname.replace(/^www\.|^careers\.|^jobs\./, "").split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    return "Direct";
  }
}

function pfBadge(r: AppRow) {
  const st = r.pf_status;
  if (r.status !== "kit_ready") {
    if (r.status === "applied" && r.applied_at) return <span className="text-xs text-gray-400">{r.applied_at}</span>;
    return null;
  }
  // Green ONLY when the Chrome plugin pre-ran the real form and reported ZERO red
  // (owner rule 2026-07-22). Reds show their count so you know how many inputs need rules.
  // Count pair: green = covered, red = uncovered. Goal: all green / 0 red.
  if (r.pf_ats === "plugin" && r.pf_total) {
    const red = (r.pf_total ?? 0) - (r.pf_covered ?? 0);
    if (red === 0) return <span className="text-sm font-bold text-green-600">&#10003; {r.pf_covered}</span>;
    return (
      <span className="text-sm font-bold whitespace-nowrap">
        <span className="text-green-600">{r.pf_covered}</span>
        <span className="text-gray-300 mx-1">&middot;</span>
        <span className="text-red-600">{red}</span>
      </span>
    );
  }
  return <span className="text-xs text-gray-400 whitespace-nowrap">pre-run needed</span>;
}

export default function Board() {
  const { groups, counts } = getBoard();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tiles = ["kit_ready", "manual_only", "applied", "rejected"].filter((s) => counts[s]);

  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]" style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div className="max-w-[900px] mx-auto px-5 py-7 pb-16">
        <AutoRefresh />
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <span className="font-mono text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-2 py-0.5">/jobs</span>
            <h1 className="text-3xl font-bold text-blue-700 mt-3 mb-1">Jobs</h1>
            <div className="text-[13px] text-gray-500">{total} tracked &middot; live from SQLite &middot; zero-token</div>
            <div className="mt-2 flex gap-3 text-[13px]"><Link href="/jobs/ai" className="text-blue-700 no-underline font-semibold">Apply queue &rarr;</Link><Link href="/jobs/skills" className="text-blue-700 no-underline font-semibold">Skills &rarr;</Link><Link href="/jobs/answers" className="text-blue-700 no-underline font-semibold">Screening answers &rarr;</Link></div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Jobs" width={52} height={52} className="rounded-[12px] shadow-sm shrink-0" />
        </div>

        <div className="flex gap-2.5 flex-wrap mb-2">
          {tiles.map((s) => (
            <div key={s} className={`flex-1 min-w-[104px] border rounded-[10px] px-4 py-3 ${TILE[s]}`}>
              <div className="text-[26px] font-bold leading-none">{s === "applied" ? (counts.applied || 0) + (counts.rejected || 0) : counts[s]}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s === "kit_ready" ? "Ready" : s === "manual_only" ? "Manual" : s[0].toUpperCase() + s.slice(1)}</div>
            </div>
          ))}
        </div>

        {total === 0 ? (
          <div className="bg-white border border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm mt-4">No applications yet. Run the engine scan + migrate to populate the board.</div>
        ) : null}
        {groups.filter((g) => g.status !== "planned" && g.status !== "skipped").map((g) => (
          <div key={g.status} className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className={`bg-gradient-to-r ${HGRAD[g.status] || "from-gray-500 to-gray-600"} px-4 py-2.5 flex items-center justify-between`}>
              <h3 className="text-sm font-bold text-white tracking-wide">{g.label}</h3>
              <span className="text-xs font-bold text-white bg-white/25 rounded-full px-2.5 py-0.5">{g.rows.length}</span>
            </div>
            <table className="w-full table-fixed border-collapse text-[13px]">
              <colgroup><col className="w-[44px]" /><col className="w-[26%]" /><col className="w-[48%]" /><col className="w-[14%]" /><col className="w-[9%]" /></colgroup>
              <thead><tr className="bg-[#f6f8fa] text-gray-400 text-[11px] text-left">
                <th className="pl-3 pr-1 py-2 font-medium">Src</th>
                <th className="px-1 py-2 font-medium">Company</th><th className="px-2.5 py-2 font-medium">Role</th>
                <th className="px-1.5 py-2 font-medium text-right">Status</th><th className="px-3 py-2 font-medium text-right">Score</th>
              </tr></thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.id} className={`border-t border-gray-100 cursor-pointer ${HOVER[g.status] || "hover:bg-gray-50"}`}>
                    <td className="pl-3 pr-1 py-2">
                      {(() => {
                        const src = jobSource(r.url);
                        const uri = getLogo(`src:${src}`);
                        return uri ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={uri} alt={src} title={src} width={18} height={18} className="inline-block rounded-[4px] align-middle bg-white border border-gray-200 object-contain" />
                        ) : (
                          <span className="text-[10px] text-gray-400" title={src}>{src}</span>
                        );
                      })()}
                    </td>
                    <td className="px-1 py-2 truncate">
                      <Link href={`/jobs/${r.id}`} className="flex items-center gap-1.5 font-semibold text-[#1f2328] no-underline hover:text-blue-700">
                        <Logo company={r.company} />
                        <span className="truncate">{r.company || "?"}</span>
                      </Link>
                    </td>
                    <td className="px-2.5 py-2 truncate">
                      <Link href={`/jobs/${r.id}`} className="text-[#1f2328] no-underline hover:text-blue-700">{r.title}</Link>
                      {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" title="Open posting" className="text-blue-700 no-underline ml-1.5 align-middle">&#8599;</a> : null}
                    </td>
                    <td className="px-1.5 py-2 text-right"><Link href={`/jobs/${r.id}`} className="no-underline">{pfBadge(r)}</Link></td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: DOT[g.status] }}><Link href={`/jobs/${r.id}`} className="no-underline" style={{ color: "inherit" }}>{r.score ?? "-"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div className="mt-8 text-center text-xs text-gray-400">Jobs &middot; reads jobs.db &middot; localhost/jobs</div>
      </div>
    </main>
  );
}
