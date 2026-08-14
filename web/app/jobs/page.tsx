import { getBoard, getTrends, getSearchIndex, SCORE_TIERS } from "@/lib/queries";
import type { AppRow } from "@/lib/db";
import { getLogo } from "@/lib/logos";
import RowLink from "./RowLink";
import AutoRefresh from "./AutoRefresh";
import JobsMenu from "./JobsMenu";
import ScoreMenu from "./ScoreMenu";
import CommandK from "./CommandK";
import PrescanIcon from "./PrescanIcon";
import ReadyScanIcon from "./ReadyScanIcon";
import CollapsiblePanel from "./CollapsiblePanel";
import PanelNav from "./PanelNav";
import ViewTabs from "./ViewTabs";
import Backdrop from "./Backdrop";
import ScanSpinner from "./ScanSpinner";
import { techMeta } from "@/lib/tech";
import { nearHome } from "@/lib/near-home";
import { altitude, ALT_META } from "@/lib/altitude";

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

// Color-coded gradient header per bucket (owner scheme 2026-08-05):
// New = light/baby blue (just arrived) -> Ready = dark blue (real, pre-scanned) ->
// Applied = green (done). Manual amber, Rejected/Archived rose/gray, Interviewing purple.
// Modern blue ramp - New (lightest) -> Not-ready (mid, vivid pop) -> Ready (deepest).
// White text on all for consistency. These feed BOTH the hero tiles and the panel headers.
const HGRAD: Record<string, string> = {
  planned: "from-sky-400 to-cyan-400",
  kit_ready: "from-blue-600 to-indigo-700",
  kit_only: "from-sky-500 to-blue-500",
  applied: "from-emerald-500 to-green-600",
  manual_only: "from-amber-400 to-orange-500",
  rejected: "from-rose-400 to-pink-500",
  interviewing: "from-violet-500 to-purple-600",
  skipped: "from-slate-400 to-slate-500",
  archived: "from-slate-400 to-slate-500",
};
// Per-panel chevron color so you can tell at a glance which panel you're scrolled into:
// Not-ready = light blue, Ready = green, Archived = dark gray. Others stay white.
// (owner request 2026-08-05)
// Open-posting (external ↗) link color per panel, matched to that panel's gradient so you
// can tell which panel a row belongs to at a glance. (owner request 2026-08-05)
const LINKC: Record<string, string> = {
  planned: "#0ea5e9",      // sky - New
  kit_only: "#3b82f6",     // blue - Not ready
  kit_ready: "#4f46e5",    // indigo - Ready
  applied: "#10b981",      // emerald - Applied
  manual_only: "#f59e0b",  // amber - Manual
  rejected: "#f43f5e",     // rose
  interviewing: "#8b5cf6", // violet
  archived: "#64748b",     // slate
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

// "Not ready" pile badge - tells the TRUTH about how each job is applied to, instead of a
// blanket "needs prescan". Pre-scan (headless form fill) only works on a real ATS form, so a
// HN comment (apply by email) or a LinkedIn/Indeed listing (apply on their site) can never be
// pre-scanned - labelling them "needs prescan" is a lie. Only a direct, not-yet-scanned ATS
// URL genuinely needs a pre-scan. (owner question 2026-08-07)
function notReadyBadge(r: AppRow) {
  const chip = (label: string, cls: string, title: string, icon: React.ReactNode) => (
    <span title={title} className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 whitespace-nowrap ${cls}`}>{icon}{label}</span>
  );
  const u = r.url || "";
  if (r.pf_status === "wall") return chip("not fillable", "bg-rose-50 text-rose-500", "Blocked (Cloudflare) - fill in your Chrome", <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>);
  // A real ATS form was resolved from the post (pf_direct_url) but it's a JS SPA (Ashby/Lever/
  // Workday) whose form only loads after clicking "Apply" - so it can't headless-prescan. It IS
  // applyable though: open the form (arrow) and run JobFill in your Chrome. (owner 2026-08-09)
  if (r.pf_direct_url) return chip("open + fill", "bg-indigo-50 text-indigo-600", "Real ATS form found in the post - open it (arrow) and run JobFill in your Chrome (SPA, can't auto-verify)", <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>);
  if (r.pf_status === "noform") return chip("not fillable", "bg-rose-50 text-rose-500", "This URL has no application form (redirects to a listing) - not auto-fillable", <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>);
  if (u.includes("news.ycombinator.com")) return chip("email apply", "bg-violet-50 text-violet-600", "HN 'who is hiring' post - you apply by EMAIL, there is no web form to pre-scan", <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>);
  if (u.includes("linkedin.com")) return chip("on linkedin", "bg-blue-50 text-blue-500", "LinkedIn listing - apply on LinkedIn; there is no external form to pre-scan", <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>);
  if (u.includes("indeed.com")) return chip("on indeed", "bg-indigo-50 text-indigo-500", "Indeed listing - apply on Indeed; there is no external form to pre-scan", <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>);
  return chip("needs prescan", "bg-sky-50 text-sky-400", "Direct ATS form not yet pre-scanned - the pre-scan will fill it and check readiness", null);
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
  return sourceBadge(r, u);
}

// Ready-panel Status cell: a tiny per-row completion bar (covered / total fields from the
// pre-scan) sitting in the status gap, so you see at a glance which pre-scanned forms are
// fully done vs still short (e.g. 25/27). Green fill = covered, red tail = still open.
// (owner request 2026-08-05)
function readyProgress(r: AppRow) {
  const total = r.pf_total ?? 0;
  const covered = Math.min(r.pf_covered ?? 0, total);
  if (!total) return pfBadge(r); // not pre-scanned - fall back to the source logo
  const pct = Math.round((covered / total) * 100);
  const done = covered >= total;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`${covered} of ${total} fields answered${done ? "" : ` - ${total - covered} still open`}`}>
      <span className="relative inline-block h-1.5 w-14 rounded-full bg-gray-200 overflow-hidden shrink-0">
        <span className="absolute inset-y-0 left-0 rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
      </span>
      {/* Ready jobs are full by definition, so covered==total - show ONE number, not "23/23".
          Only a rare not-yet-full row keeps the covered/total split. (owner request 2026-08-07) */}
      <span className={`text-[10px] tabular-nums ${done ? "text-blue-700 font-bold" : "text-gray-500"}`}>{done ? total : `${covered}/${total}`}</span>
    </span>
  );
}

function sourceBadge(r: AppRow, u: string) {
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
  return <span className="inline-flex items-center justify-start whitespace-nowrap" title="Apply on the source ATS">{logo}</span>;
}

// Tech column: ONE icon - the single most telling stack for the job. React/Next/TS show
// up on almost every full-stack role and carry no signal, so we surface the most
// distinctive tech (Python, Go, Rust, Kafka, AWS...) when the job has one, and only fall
// back to the ubiquitous trio when that's all there is. (owner request 2026-08-05)
const UBIQUITOUS = new Set(["react", "nextjs", "typescript", "javascript", "node"]);
function topTech(slugs: string[]): string | null {
  if (!slugs.length) return null;
  return slugs.find((s) => !UBIQUITOUS.has(s)) || (slugs.includes("typescript") ? "typescript" : slugs[0]);
}
function techCell(r: AppRow) {
  let slugs: string[] = [];
  try { slugs = JSON.parse(r.tech || "[]"); } catch { /* bad json */ }
  const s = topTech(slugs);
  if (!s) return <span className="text-gray-300">-</span>;
  const label = techMeta(s)?.label || s;
  const uri = getLogo(`tech:${s}`);
  // Click the tech chip -> Google it (preset search) to learn more; data-external so the
  // whole-row link ignores this click. Hover still shows the tech name. (owner 2026-08-06)
  const search = `https://www.google.com/search?q=${encodeURIComponent(label)}`;
  const inner = uri
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={uri} alt={label} width={18} height={18} className="w-[18px] h-[18px] rounded-[4px] object-contain bg-white shrink-0 inline-block align-middle" />
    : <span className="text-[9px] font-bold uppercase tracking-tight text-gray-500 bg-gray-100 rounded px-1 py-0.5 leading-none">{label.slice(0, 3)}</span>;
  return <a data-external href={search} target="_blank" rel="noopener noreferrer" title={`${label} - click to search`} className="inline-flex no-underline align-middle">{inner}</a>;
}

// Tiny 7-day area sparkline for the hero tiles - white on the gradient, last point (today)
// dotted. Answers "am I slacking or sprinting" without a separate dashboard. (owner 2026-08-05)
function Sparkline({ data, w = 62, h = 26 }: { data: number[]; w?: number; h?: number }) {
  const n = data.length;
  if (n < 2) return null;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => [(i / (n - 1)) * w, h - 2 - (v / max) * (h - 5)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `M0 ${h} ${pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} L${w} ${h} Z`;
  const [lx, ly] = pts[n - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <path d={area} fill="rgba(255,255,255,0.22)" />
      <path d={line} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.2" fill="#fff" />
    </svg>
  );
}

// A single compact status glyph for narrow (phone) screens - one icon per state instead
// of the full desktop pill/bar/text. (owner request 2026-08-05)
function glyphSvg(g: string) {
  const p = { fill: "none", stroke: "#fff", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (g) {
    case "check": return <svg width="11" height="11" viewBox="0 0 24 24" {...p}><polyline points="20 6 9 17 4 12" /></svg>;
    case "clock": return <svg width="11" height="11" viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="8" /><polyline points="12 8 12 12 15 14" /></svg>;
    case "x": return <svg width="10" height="10" viewBox="0 0 24 24" {...p}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>;
    case "down": return <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M17 2H6.5a2 2 0 0 0-2 1.7l-1.4 8A2 2 0 0 0 5 14h5v4a3 3 0 0 0 3 3l4-9V2z" /></svg>;
    case "half": return <svg width="11" height="11" viewBox="0 0 24 24" {...p}><line x1="6" y1="12" x2="18" y2="12" /></svg>;
    default: return <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", display: "block" }} />;
  }
}
function statusIcon(gstatus: string, r: AppRow) {
  let color = "#94a3b8", glyph = "dot", title = "New";
  if (gstatus === "archived") {
    if (r.status === "rejected") { color = "#9ca3af"; glyph = "x"; title = "Rejected"; }
    else if (r.status === "expired") { color = "#d97706"; glyph = "clock"; title = "Expired"; }
    else if (r.status === "hold") { color = "#6366f1"; glyph = "clock"; title = "On hold"; }
    else { color = "#f43f5e"; glyph = "down"; title = "Not interested"; }
  } else if (gstatus === "kit_only") {
    const u = r.url || "";
    if (r.pf_status === "wall" || r.pf_status === "noform") { color = "#f43f5e"; glyph = "x"; title = "Not fillable"; }
    else if (u.includes("news.ycombinator.com")) { color = "#7c3aed"; glyph = "clock"; title = "Apply by email"; }
    else if (u.includes("linkedin.com") || u.includes("indeed.com")) { color = "#3b82f6"; glyph = "clock"; title = "Apply on site"; }
    else { color = "#38bdf8"; glyph = "clock"; title = "Needs pre-scan"; }
  }
  else if (gstatus === "kit_ready") {
    const done = (r.pf_total ?? 0) > 0 && (r.pf_covered ?? 0) >= (r.pf_total ?? 0);
    color = "#2563eb"; glyph = done ? "check" : "half"; title = done ? "Ready - all fields covered" : `Ready - ${r.pf_covered ?? 0}/${r.pf_total ?? 0} fields`;
  } else if (gstatus === "applied") { color = "#16a34a"; glyph = "check"; title = "Applied"; }
  else if (gstatus === "manual_only") { color = "#d97706"; glyph = "dot"; title = "Manual"; }
  else if (gstatus === "planned") { color = "#0ea5e9"; glyph = "dot"; title = "New"; }
  return (
    <span title={title} className="inline-flex items-center justify-center rounded-full align-middle" style={{ width: 18, height: 18, background: color }}>
      {glyphSvg(glyph)}
    </span>
  );
}

export default async function Board({ searchParams }: { searchParams: Promise<{ min?: string }> }) {
  const sp = await searchParams;
  // Default to 60+ - owner has already applied to everything 70+/80+/90+, so the live
  // work sits at 60+. Opening there puts focus straight on the Ready panel. (owner 2026-08-05)
  const min = sp.min !== undefined ? parseInt(sp.min) || 0 : 60;
  const { groups, counts, buckets } = getBoard(min);
  // Full job index for the Cmd+K search (ALL scores/statuses, independent of the min filter) - a
  // light direct query, not a second full getBoard() grouping pass.
  const searchJobs = getSearchIndex();
  // Deduped company -> real logo data-URI for the Cmd+K palette (avg ~1.4KB each, one per
  // distinct company). Real brand icons, not colored initials. (owner request 2026-08-05)
  const cmdkLogos: Record<string, string> = {};
  for (const j of searchJobs) {
    if (j.company && !(j.company in cmdkLogos)) { const l = getLogo(j.company); if (l) cmdkLogos[j.company] = l; }
  }
  // Total excludes skipped so the tiles reconcile: New + Ready + Manual + Applied = Total.
  // Applied folds in rejected (they were applied to), and there is no separate Rejected tile.
  const total = Object.entries(counts).reduce((a, [k, v]) => a + (k === "skipped" || k === "archived" ? 0 : v), 0);
  const tiles = ["planned", "kit_only", "kit_ready", "manual_only", "applied"].filter((s) => counts[s]);
  // Default-open panel: Ready if present (your normal landing), else the first non-archived panel
  // so a fresh board (only New matches) opens automatically instead of looking empty.
  const defaultOpenStatus = groups.some((g) => g.status === "kit_ready")
    ? "kit_ready"
    : (groups.find((g) => g.status !== "archived")?.status ?? "");
  // 7-day activity for the hero sparklines. Each tile shows the series most relevant to it:
  // detection for New/Not-ready/Total, pre-scan for Ready, applications for Applied.
  const trends = getTrends(7);
  const TREND: Record<string, number[]> = {
    total: trends.detected, planned: trends.detected, kit_only: trends.detected,
    kit_ready: trends.ready, manual_only: trends.applied, applied: trends.applied,
  };
  const todayOf = (arr: number[]) => arr[arr.length - 1] || 0;

  return (
    <main className="min-h-screen text-[#1f2328]" style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <Backdrop variant="ai" />
      <div className="max-w-[900px] mx-auto px-4 sm:px-5 py-4 sm:py-7 pb-16">
        <AutoRefresh />
        <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="AI-Jobs" width={52} height={52} className="block w-11 h-11 sm:w-[52px] sm:h-[52px] rounded-[12px] shadow-sm shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1f2328] mb-0.5 whitespace-nowrap">AI-Jobs</h1>
              <div className="text-[12px] sm:text-[13px] text-gray-500">{total} tracked &middot; live &middot; zero-token</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CommandK jobs={searchJobs} logos={cmdkLogos} />
            <ScoreMenu min={min} buckets={buckets} tiers={[...SCORE_TIERS]} />
            <JobsMenu />
            <ViewTabs />
          </div>
        </div>

        {/* All hero tiles stay on ONE row on a phone (flex-nowrap + shrinkable) so they never
            wrap and shove the job list down. Compact font/padding on mobile. (owner 2026-08-08) */}
        <div className="flex flex-nowrap sm:flex-wrap gap-1.5 sm:gap-2 mb-2">
          <div className="flex-1 min-w-0 sm:min-w-[88px] rounded-[10px] px-2 py-1.5 sm:px-4 sm:py-3 text-white shadow-sm bg-gradient-to-r from-gray-700 to-gray-900 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[17px] sm:text-[26px] font-bold leading-none">{total}</div>
              <div className="text-[9px] sm:text-xs text-white/85 mt-0.5 truncate">Total</div>
            </div>
            <div className="hidden sm:flex flex-col items-end shrink-0">
              <Sparkline data={TREND.total} />
              <span className="text-[10px] text-white/70 mt-0.5">+{todayOf(TREND.total)} today</span>
            </div>
          </div>
          {tiles.map((s) => (
            <div key={s} className={`flex-1 min-w-0 sm:min-w-[88px] rounded-[10px] px-2 py-1.5 sm:px-4 sm:py-3 text-white shadow-sm bg-gradient-to-r ${HGRAD[s]} flex items-center justify-between gap-2`}>
              <div className="min-w-0">
                <div className="text-[17px] sm:text-[26px] font-bold leading-none">{s === "applied" ? (counts.applied || 0) + (counts.rejected || 0) : counts[s]}</div>
                <div className="text-[9px] sm:text-xs text-white/85 mt-0.5 truncate">{s === "planned" ? "New" : s === "kit_ready" ? "Ready" : s === "kit_only" ? "Not ready" : s === "manual_only" ? "Manual" : s[0].toUpperCase() + s.slice(1)}</div>
              </div>
              <div className="hidden sm:flex flex-col items-end shrink-0">
                <Sparkline data={TREND[s] || trends.detected} />
                <span className="text-[10px] text-white/70 mt-0.5">+{todayOf(TREND[s] || trends.detected)} today</span>
              </div>
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
          const breakdownPills = breakdown.map(([src, n]) => {
            const uri = markUri(src);
            return (
              <span key={src} title={src} className="inline-flex items-center justify-center gap-1 min-w-[46px] text-[11px] font-bold rounded-full pl-1 pr-2 py-0.5 whitespace-nowrap text-white bg-white/20">
                {uri
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={uri} alt={src} width={16} height={16} className="w-4 h-4 rounded-full bg-white object-contain shrink-0" />
                  : <LetterTile name={src} size={16} round />}
                {n}
              </span>
            );
          });
          return (
          <CollapsiblePanel key={g.status} status={g.status} label={g.label} count={g.rows.length} gradient={HGRAD[g.status] || "from-gray-500 to-gray-600"} archived={g.status === "archived"} defaultOpen={g.status === defaultOpenStatus} breakdown={breakdownPills} action={g.status === "kit_only" ? <PrescanIcon /> : g.status === "kit_ready" ? <ReadyScanIcon /> : undefined}>
            <table className="w-full table-fixed border-collapse text-[11px] sm:text-[13px]">
              {/* Identical column widths on EVERY panel (thead governs table-fixed) so
                  columns align top-down across panels. Company + Score hide on phones;
                  Role widens and Status collapses to one icon there. (owner request 2026-08-05) */}
              <thead><tr className="bg-[#f6f8fa] text-gray-400 text-[11px] text-left">
                <th className="pl-3 pr-1 py-2 font-medium w-[24px]">Src</th>
                <th className="pl-1 pr-1 py-2 font-medium w-[36px] sm:w-[16%]"><span className="hidden sm:inline">Company</span></th>
                <th className="px-2 sm:px-2.5 py-2 font-medium w-[52%] sm:w-[50%]">Role</th>
                <th className="px-1 py-2 font-medium text-center w-[14%] sm:w-[8%]">Tech</th>
                <th className="px-1.5 py-2 font-medium text-right sm:text-left w-[24%] sm:w-[14%]">Status</th>
                <th className="pl-1 pr-3 py-2 font-medium text-right hidden sm:table-cell sm:w-[8%]">Score</th>
              </tr></thead>
              <tbody>
                {g.rows.map((r) => (
                  <RowLink key={r.id} id={r.id} className={`border-t border-gray-100 cursor-pointer ${HOVER[g.status] || "hover:bg-gray-50"}`}>
                    <td className="pl-3 pr-1 py-2">
                      {(() => {
                        const src = jobSource(r.url);
                        const uri = markUri(src, r.company);
                        // Click the source mark -> open the posting (same as the ↗ arrow);
                        // data-external so the row-click doesn't hijack it. (owner 2026-08-06)
                        const mark = (
                          <span className="relative inline-block align-middle shrink-0" style={{ width: 20, height: 20 }}>
                            {uri
                              /* eslint-disable-next-line @next/next/no-img-element */
                              ? <img src={uri} alt={src} title={src} width={20} height={20} className="block rounded-[5px] bg-white border border-gray-200 object-contain" />
                              : <LetterTile name={r.company || src} size={20} />}
                            {r.easy_apply ? <span className="absolute -bottom-1 -right-1 leading-none pointer-events-none font-bold text-blue-600 bg-white rounded px-0.5" style={{ fontSize: 7 }} title="Easy/Quick Apply">easy</span> : null}
                          </span>
                        );
                        return r.url
                          ? <a data-external href={r.url} target="_blank" rel="noopener noreferrer" title={`Open on ${src}`} className="inline-flex no-underline">{mark}</a>
                          : mark;
                      })()}
                    </td>
                    <td className="pl-2 pr-1 py-2.5 sm:pl-1 truncate">
                      <span className="flex items-center gap-2 text-[#1f2328]">
                        <span className="hidden sm:inline text-gray-300 font-normal select-none leading-none">|</span>
                        <Logo company={r.company} />
                        <span className="hidden sm:inline truncate">{r.company || "?"}</span>
                      </span>
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ScanSpinner id={r.id} />
                        {(() => { const a = altitude(r.company, r.title, !!nearHome(r.location)); const m = ALT_META[a]; return <span title={`${m.label} - ${m.hint}`} className={`shrink-0 w-1.5 h-1.5 rounded-full ${a === "reach" ? "bg-amber-400" : a === "near-home" ? "bg-emerald-500" : "bg-blue-500"}`} />; })()}
                        <span className="flex-1 min-w-0 truncate text-[#1f2328]">{r.title}</span>
                        {(r.pf_direct_url || r.url) ? <a data-external href={r.pf_direct_url || r.url || undefined} target="_blank" rel="noopener noreferrer" title={r.pf_direct_url ? "Open the application form" : "Open posting"} className="shrink-0 no-underline align-middle font-bold" style={{ color: LINKC[g.status] || "#2563eb" }}>&#8599;</a> : null}
                      </div>
                    </td>
                    <td className="px-1 py-2 text-center">{techCell(r)}</td>
                    <td className="px-1.5 py-2.5 text-right sm:text-left pr-3 sm:pr-1.5">
                      <span className="sm:hidden">{statusIcon(g.status, r)}</span>
                      <span className="hidden sm:inline">{g.status === "archived" ? (r.status === "rejected" ? statusPill("rejected", "bg-gray-100 text-gray-500", agoLabel(r.rejected_at) || agoLabel(r.updated_at)) : r.status === "expired" ? statusPill("expired", "bg-amber-100 text-amber-700", agoLabel(r.updated_at)) : r.status === "hold" ? statusPill("on hold", "bg-indigo-50 text-indigo-600", agoLabel(r.updated_at)) : statusPill("disliked", "bg-rose-100 text-rose-600", agoLabel(r.updated_at))) : g.status === "kit_only" ? notReadyBadge(r) : g.status === "kit_ready" ? readyProgress(r) : pfBadge(r)}</span>
                    </td>
                    <td className="pl-1 pr-3 py-2 text-right text-gray-400 hidden sm:table-cell">{r.score ?? "-"}</td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </CollapsiblePanel>
          );
        })}
        <div className="mt-8 text-center text-xs text-gray-400">Jobs &middot; reads jobs.db &middot; localhost/jobs</div>
      </div>
      <PanelNav />
    </main>
  );
}
