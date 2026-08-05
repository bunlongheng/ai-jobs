import { getBoard, SCORE_TIERS } from "@/lib/queries";
import type { AppRow } from "@/lib/db";
import { getLogo } from "@/lib/logos";
import RowLink from "./RowLink";
import AutoRefresh from "./AutoRefresh";
import JobsMenu from "./JobsMenu";
import ScoreMenu from "./ScoreMenu";
import CommandK from "./CommandK";

export const dynamic = "force-dynamic"; // always read live SQLite

const GRAD = ["#0969da", "#8250df", "#bf3989", "#1a7f37", "#9a6700", "#1b9aaa"];
function Logo({ company }: { company: string | null }) {
  const uri = getLogo(company);
  if (uri) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={uri} alt={`${company ?? ""} logo`} width={20} height={20} className="inline-block rounded-[5px] align-middle bg-white border border-gray-200 object-contain shrink-0" />;
  }
  const name = (company || "?").trim();
  const init = name.slice(0, 1).toUpperCase();
  const bg = GRAD[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % GRAD.length];
  return <span className="inline-flex items-center justify-center rounded-[5px] align-middle text-white text-[12px] font-bold" style={{ width: 20, height: 20, background: bg }}>{init}</span>;
}

// Resolve a source/company mark: prefer the ATS logo (src:Ashby...), then the company
// logo cached under the bare name (direct sites like Coinbase live there), so a company
// source never falls through to a globe. (owner rule 2026-08-05: always an icon, never
// the raw name)
function markUri(src: string, company?: string | null): string | null {
  return getLogo(`src:${src}`) || getLogo(src) || (company ? getLogo(company) : null);
}
// Last-resort brand tile - a colored initial, NEVER a globe or raw name text.
function LetterTile({ name, size = 20, round = false }: { name: string; size?: number; round?: boolean }) {
  const n = (name || "?").trim();
  const init = n.slice(0, 1).toUpperCase();
  const bg = GRAD[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % GRAD.length];
  return <span className={`inline-flex items-center justify-center align-middle text-white font-bold shrink-0 ${round ? "rounded-full" : "rounded-[5px]"}`} style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.5) }}>{init}</span>;
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
  planned: "#0284c7", kit_ready: "#1d4ed8", kit_only: "#64748b", applied: "#16a34a", manual_only: "#9a6700",
  rejected: "#cf222e", skipped: "#8a949e", interviewing: "#8250df",
};
// Color-coded gradient header per bucket (owner scheme 2026-08-05):
// New = light/baby blue (just arrived) -> Ready = dark blue (real, pre-scanned) ->
// Applied = green (done). Manual amber, Rejected/Archived rose/gray, Interviewing purple.
const HGRAD: Record<string, string> = {
  planned: "from-sky-400 to-sky-500",
  kit_ready: "from-blue-600 to-blue-800",
  kit_only: "from-slate-400 to-slate-600",
  applied: "from-green-600 to-emerald-700",
  manual_only: "from-amber-400 to-orange-500",
  rejected: "from-rose-300 to-rose-400",
  interviewing: "from-purple-500 to-violet-600",
  skipped: "from-gray-400 to-gray-500",
  archived: "from-gray-400 to-gray-500",
};
// Row hover tint matching each panel's color
const HOVER: Record<string, string> = {
  planned: "hover:bg-sky-50",
  kit_ready: "hover:bg-blue-50",
  kit_only: "hover:bg-slate-50",
  applied: "hover:bg-green-50",
  manual_only: "hover:bg-amber-50",
  rejected: "hover:bg-red-50",
  interviewing: "hover:bg-purple-50",
  skipped: "hover:bg-gray-50",
  archived: "hover:bg-gray-100",
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
  if (u.includes("news.ycombinator.com")) return "HackerNews";
  try {
    return new URL(url).hostname.replace(/^www\.|^careers\.|^jobs\./, "").split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    return "Direct";
  }
}

// "Applied via" - the channel the application actually went out through. HN jobs the
// engine auto-emailed show Gmail; ATS/board rows show that platform; everything else is
// the company's own careers site. (owner request 2026-08-05)
function applyVia(r: AppRow): string {
  const notes = (r.notes || "").toLowerCase();
  if (notes.includes("auto-emailed") || notes.includes("emailed")) return "Gmail";
  const src = jobSource(r.url);
  if (["Ashby", "Greenhouse", "Lever", "LinkedIn", "Indeed", "HackerNews"].includes(src)) return src;
  return "Company";
}
// The Via cell only shows once a row has actually been applied to - blank on New/Ready.
function ViaCell({ r }: { r: AppRow }) {
  const applied = r.status === "applied" || r.status === "rejected" || r.status === "interviewing" || !!r.applied_at;
  if (!applied) return null;
  const via = applyVia(r);
  const label = via === "Company" ? "Company site" : via === "HackerNews" ? "Hacker News" : via;
  const uri = via === "Company" ? getLogo(r.company) : markUri(via, r.company);
  return uri ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={uri} alt={label} title={`Applied via ${label}`} width={18} height={18} className="w-[18px] h-[18px] rounded-[5px] object-contain inline-block align-middle bg-white border border-gray-200" />
  ) : (
    <LetterTile name={r.company || label} size={18} />
  );
}

// Relative "how long ago" from a YYYY-MM-DD date. "today" / "1d ago" / "12d ago".
function agoLabel(d?: string | null): string {
  if (!d) return "";
  const t = new Date(`${String(d).slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(t)) return "";
  const days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
  return days === 0 ? "today" : `${days}d ago`;
}

// A consistent status pill (same shape everywhere) so Applied reads like Rejected does.
// Fixed-width pill + fixed-width "ago" slot so the column aligns cleanly: every pill
// lines up, every date lines up, whether or not a date is present. (owner request 2026-08-05)
function statusPill(label: string, cls: string, ago?: string | null) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <span className={`text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 text-center ${cls}`} style={{ width: 66 }}>{label}</span>
      <span className="text-[11px] text-gray-400 font-normal text-left inline-block" style={{ width: 48 }}>{ago || ""}</span>
    </span>
  );
}

function pfBadge(r: AppRow) {
  if (r.status !== "kit_ready" && r.status !== "manual_only") {
    // Applied: green pill + how long ago (consistent with the rejected pill). (2026-08-05)
    if (r.status === "applied") return statusPill("applied", "bg-green-100 text-green-700", agoLabel(r.applied_at));
    return null;
  }
  // Green ONLY when the Chrome plugin pre-ran the real form and reported ZERO red
  // (owner rule 2026-07-22). Reds show their count so you know how many inputs need rules.
  // Count pair: green = covered, red = uncovered. Goal: all green / 0 red.
  if (r.pf_ats === "plugin" && r.pf_total) {
    const red = (r.pf_total ?? 0) - (r.pf_covered ?? 0);
    if (red === 0) return <span className="text-green-600">{r.pf_covered}</span>;
    return (
      <span className="whitespace-nowrap">
        <span className="text-green-600">{r.pf_covered}</span>
        <span className="text-gray-300 mx-1">&middot;</span>
        <span className="text-red-600">{red}</span>
      </span>
    );
  }
  // Listing sources (LinkedIn/Indeed/HN) have no external form to pre-run - show the
  // SOURCE LOGO (not the word "source"/"apply"), plus a blue "easy" pill for LinkedIn
  // Easy Apply so those are easy to spot and bang out first. (owner request 2026-08-05)
  const u = (r.url || "").toLowerCase();
  const src = jobSource(r.url);
  const uri = markUri(src, r.company);
  const logo = uri
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={uri} alt={src} title={src} width={18} height={18} className="w-[18px] h-[18px] rounded-full object-contain inline-block align-middle" />
    : <LetterTile name={r.company || src} size={18} round />;
  if (u.includes("news.ycombinator.com"))
    return <span className="inline-flex items-center justify-end whitespace-nowrap" title="Apply via the Hacker News post">{logo}</span>;
  if (u.includes("linkedin.com") || u.includes("indeed.com")) {
    if (r.easy_apply)
      return <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap" title="Easy / Quick Apply - bang these out first">{logo}<span className="text-[9px] font-bold uppercase tracking-wide rounded px-1 py-0.5 bg-blue-100 text-blue-700">easy</span></span>;
    return <span className="inline-flex items-center justify-end whitespace-nowrap" title="Apply on the source site">{logo}</span>;
  }
  // A direct-ATS form not yet pre-run: show the source logo (like the listing rows),
  // never the noisy "pre-run needed" text - the kit is still ready to apply. (owner 2026-08-05)
  return <span className="inline-flex items-center justify-start whitespace-nowrap" title="Apply on the source ATS">{logo}</span>;
}

export default async function Board({ searchParams }: { searchParams: Promise<{ min?: string }> }) {
  const sp = await searchParams;
  // Default to 80+ so the board opens on the highest-priority few with actual content
  // (top score is ~88, so 90+ would be empty). (owner request 2026-07-24)
  const min = sp.min !== undefined ? parseInt(sp.min) || 0 : 80;
  const { groups, counts, buckets } = getBoard(min);
  // Full job index for the Cmd+K search (ALL scores/statuses, independent of the min filter).
  const searchJobs = getBoard(0).groups.flatMap((g) => g.rows.map((r) => ({
    id: r.id, title: r.title || "", company: r.company || "", score: r.score ?? 0, status: r.status || "",
  })));
  // Total excludes skipped so the tiles reconcile: New + Ready + Manual + Applied = Total.
  // Applied folds in rejected (they were applied to), and there is no separate Rejected tile.
  const total = Object.entries(counts).reduce((a, [k, v]) => a + (k === "skipped" || k === "archived" ? 0 : v), 0);
  const tiles = ["planned", "kit_ready", "kit_only", "manual_only", "applied"].filter((s) => counts[s]);

  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]" style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div className="max-w-[900px] mx-auto px-5 py-7 pb-16">
        <AutoRefresh />
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="Jobs" width={52} height={52} className="hidden sm:block rounded-[12px] shadow-sm shrink-0" />
            <div>
              <h1 className="text-3xl font-bold text-[#1f2328] mb-1">Jobs</h1>
              <div className="text-[13px] text-gray-500">{total} tracked &middot; live from SQLite &middot; zero-token</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CommandK jobs={searchJobs} />
            <ScoreMenu min={min} buckets={buckets} tiers={[...SCORE_TIERS]} />
            <JobsMenu />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          <div className="flex-1 min-w-[88px] rounded-[10px] px-2.5 py-2.5 sm:px-4 sm:py-3 text-white shadow-sm bg-gradient-to-r from-gray-700 to-gray-900">
            <div className="text-[20px] sm:text-[26px] font-bold leading-none">{total}</div>
            <div className="text-[10px] sm:text-xs text-white/85 mt-0.5 truncate">Total</div>
          </div>
          {tiles.map((s) => (
            <div key={s} className={`flex-1 min-w-[88px] rounded-[10px] px-2.5 py-2.5 sm:px-4 sm:py-3 text-white shadow-sm bg-gradient-to-r ${HGRAD[s]}`}>
              <div className="text-[20px] sm:text-[26px] font-bold leading-none">{s === "applied" ? (counts.applied || 0) + (counts.rejected || 0) : counts[s]}</div>
              <div className="text-[10px] sm:text-xs text-white/85 mt-0.5 truncate">{s === "planned" ? "New" : s === "kit_ready" ? "Ready" : s === "kit_only" ? "Not ready" : s === "manual_only" ? "Manual" : s[0].toUpperCase() + s.slice(1)}</div>
            </div>
          ))}
        </div>


        {total === 0 ? (
          <div className="bg-white border border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm mt-4">No applications yet. Run the engine scan + migrate to populate the board.</div>
        ) : null}
        {groups.filter((g) => g.status !== "skipped").map((g) => {
          // per-source breakdown for this group's header (LinkedIn 17, Indeed 13, ...)
          const bySource = g.rows.reduce((m, r) => { const s = jobSource(r.url); m[s] = (m[s] || 0) + 1; return m; }, {} as Record<string, number>);
          const breakdown = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
          return (
          <div key={g.status} className={`mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden ${g.status === "archived" ? "opacity-75 [&_img]:grayscale" : ""}`}>
            <div className={`bg-gradient-to-r ${HGRAD[g.status] || "from-gray-500 to-gray-600"} px-4 py-2.5 flex items-center justify-between gap-2`}>
              <div className="flex items-center gap-2 shrink-0">
                <h3 className="text-sm font-bold text-white tracking-wide">{g.label}</h3>
                <span className="text-xs font-bold text-white bg-white/30 rounded-full px-2.5 py-0.5">{g.rows.length}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {breakdown.map(([src, n]) => {
                  const uri = markUri(src);
                  return (
                    <span key={src} title={src} className="inline-flex items-center justify-center gap-1 min-w-[46px] text-[11px] font-bold text-white bg-white/20 rounded-full pl-1 pr-2 py-0.5 whitespace-nowrap">
                      {uri
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={uri} alt={src} width={16} height={16} className="w-4 h-4 rounded-full bg-white object-contain shrink-0" />
                        : <LetterTile name={src} size={16} round />}
                      {n}
                    </span>
                  );
                })}
              </div>
            </div>
            <table className="w-full table-fixed border-collapse text-[11px] sm:text-[13px]">
              {/* ONE fixed colgroup on EVERY panel so all columns align top-down across
                  panels - Src, Company, Role (arrow pinned to its right edge), Status
                  (reserved even on New/planned), Score. (owner request 2026-08-05) */}
              <colgroup><col className="w-[30px] sm:w-[44px]" /><col className="w-[20%]" /><col className="w-[40%]" /><col className="w-[16%]" /><col className="w-[8%]" /><col className="w-[10%]" /></colgroup>
              <thead><tr className="bg-[#f6f8fa] text-gray-400 text-[11px] text-left">
                <th className="pl-3 pr-1 py-2 font-medium">Src</th>
                <th className="px-1 py-2 font-medium">Company</th><th className="px-2.5 py-2 font-medium">Role</th>
                <th className="px-1.5 py-2 font-medium text-left">Status</th><th className="px-1 py-2 font-medium text-center">Via</th><th className="pl-1 pr-3 py-2 font-medium text-right">Score</th>
              </tr></thead>
              <tbody>
                {g.rows.map((r) => (
                  <RowLink key={r.id} id={r.id} className={`border-t border-gray-100 cursor-pointer ${HOVER[g.status] || "hover:bg-gray-50"}`}>
                    <td className="pl-3 pr-1 py-2">
                      {(() => {
                        const src = jobSource(r.url);
                        const uri = markUri(src, r.company);
                        return (
                          <span className="relative inline-block align-middle shrink-0" style={{ width: 20, height: 20 }}>
                            {uri
                              /* eslint-disable-next-line @next/next/no-img-element */
                              ? <img src={uri} alt={src} title={src} width={20} height={20} className="block rounded-[5px] bg-white border border-gray-200 object-contain" />
                              : <LetterTile name={r.company || src} size={20} />}
                            {r.easy_apply ? <span className="absolute -bottom-1 -right-1 leading-none pointer-events-none font-bold text-blue-600 bg-white rounded px-0.5" style={{ fontSize: 7 }} title="Easy/Quick Apply">easy</span> : null}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-1 py-2 truncate">
                      <span className="flex items-center gap-1.5 text-[#1f2328]">
                        <Logo company={r.company} />
                        <span className="truncate">{r.company || "?"}</span>
                      </span>
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="flex-1 min-w-0 truncate text-[#1f2328]">{r.title}</span>
                        {r.url ? <a data-external href={r.url} target="_blank" rel="noopener noreferrer" title="Open posting" className="shrink-0 text-blue-700 no-underline align-middle">&#8599;</a> : null}
                      </div>
                    </td>
                    <td className="px-1.5 py-2 text-left">{g.status === "archived" ? (r.status === "rejected" ? statusPill("rejected", "bg-gray-100 text-gray-500", agoLabel(r.rejected_at) || agoLabel(r.updated_at)) : r.status === "expired" ? statusPill("expired", "bg-amber-100 text-amber-700", agoLabel(r.updated_at)) : statusPill("disliked", "bg-rose-100 text-rose-600", agoLabel(r.updated_at))) : pfBadge(r)}</td>
                    <td className="px-1 py-2 text-center"><ViaCell r={r} /></td>
                    <td className="pl-1 pr-3 py-2 text-right" style={{ color: DOT[g.status] }}>{r.score ?? "-"}</td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
          );
        })}
        <div className="mt-8 text-center text-xs text-gray-400">Jobs &middot; reads jobs.db &middot; localhost/jobs</div>
      </div>
    </main>
  );
}
