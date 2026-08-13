import { getApp, type Field } from "@/lib/queries";
import { getKit } from "@/lib/kit";
import { extractAllTech, techMeta, techCategory } from "@/lib/tech";
import { getLogo } from "@/lib/logos";
import { nearHome } from "@/lib/near-home";
import { altitude, ALT_META } from "@/lib/altitude";
import ReachOut from "../ReachOut";
import JobDescription from "../JobDescription";
import FindEmailButton from "../FindEmailButton";
import Reactions from "../Reactions";
import CopyButton from "../CopyButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// Outreach identity (name, links, contact) comes from profile.json at the repo root, so no
// personal data is hardcoded in source. Falls back to profile.example.json on a fresh clone.
// (open-source prep 2026-08-10)
function loadIdentity(): { name?: string; email?: string; phone?: string; site?: string; github?: string; linkedin?: string } {
  for (const p of [path.join(process.cwd(), "..", "profile.json"), path.join(process.cwd(), "..", "profile.example.json")]) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")).identity || {}; } catch { /* try next */ }
  }
  return {};
}

// Load the JobFill rules once so we can resolve a paste-ready ANSWER for each screening
// question the prescan flagged MANUAL - the owner wants an answer to copy, not just a flag.
// (owner request 2026-08-06)
const RULES: { match: string; kind?: string; v?: string; opts?: string[] }[] = (() => {
  for (const p of [path.join(process.cwd(), "..", "jobfill", "rules.json"), path.join(process.cwd(), "jobfill", "rules.json")]) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { /* next */ }
  }
  return [];
})();
function resolveAnswer(label: string): string {
  const l = String(label || "").toLowerCase().trim();
  for (const r of RULES) {
    try { if (new RegExp(r.match, "i").test(l)) return r.kind === "text" ? String(r.v || "") : (Array.isArray(r.opts) ? String(r.opts[0] || "") : ""); } catch { /* bad regex */ }
  }
  return "";
}

// Clean, consistent header icons for every detail-page section. White stroke, 15px.
function HIcon({ d }: { d: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white shrink-0" aria-hidden><path d={d} /></svg>;
}
const HD = {
  resume: "M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM9 13h6M9 17h6",
  cover: "M3 7l9 6 9-6M3 5h18v14H3z",
  screening: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  jd: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h6",
  email: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  red: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  files: "M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3 3 0 0 1 4 4l-8.5 8.5a1 1 0 0 1-1.4-1.4L15 8",
  filled: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 12l2.5 2.5L16 9",
};

function Section({ title, sub, html, grad = "from-blue-500 to-blue-700", copyText, icon }: { title: string; sub?: string; html: string; grad?: string; copyText?: string; icon?: string }) {
  if (!html) return null;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
      <div className={`group bg-gradient-to-r ${grad} px-4 py-2.5 flex items-center justify-between gap-2`}>
        <h2 className="text-sm text-white tracking-wide flex items-center gap-2">{icon ? <HIcon d={icon} /> : null}{title}{sub ? <span className="text-xs text-white/80 ml-2">{sub}</span> : null}</h2>
        {copyText ? <CopyButton text={copyText} /> : null}
      </div>
      <div className="prose-kit text-[13px] leading-relaxed px-6 py-5" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// Light, bordered status badge - the SAME look as the board's listing pills (not a solid
// fill), so the detail header reads consistently with the board. (owner request 2026-08-06)
const STPILL: Record<string, string> = {
  planned: "bg-sky-50 text-sky-600 border-sky-200",
  kit_ready: "bg-blue-50 text-blue-700 border-blue-200",
  kit_only: "bg-sky-50 text-sky-500 border-sky-200",
  applied: "bg-green-100 text-green-700 border-green-200",
  manual_only: "bg-amber-100 text-amber-700 border-amber-200",
  interviewing: "bg-violet-100 text-violet-700 border-violet-200",
  rejected: "bg-gray-100 text-gray-500 border-gray-200",
  expired: "bg-amber-100 text-amber-700 border-amber-200",
  hold: "bg-indigo-50 text-indigo-600 border-indigo-200",
};

export default async function JobDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ min?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  // Preserve the board's score filter so "back to board" returns to the same view. (2026-08-05)
  const backHref = sp.min !== undefined ? `/jobs?min=${sp.min}` : "/jobs";
  const { app, events } = getApp(id);
  if (!app) notFound();
  const kit = getKit(id);

  // Apply-by-email (Hacker News / direct recruiter outreach): the email IS the application.
  // Compose ONE ready-to-send email = subject + cover body + links + walk-through invite +
  // sign-off + contact. Gmail's URL-compose does NOT auto-insert the account signature, so
  // the sign-off block MUST live in the body. (owner 2026-08-05)
  const isEmailApply = (app.url || "").toLowerCase().includes("news.ycombinator.com");
  const me = loadIdentity();
  const emailSubject = `Application: ${app.title ?? ""}${me.name ? ` - ${me.name}` : ""}`;
  const coverBody = (() => {
    let b = (kit.coverText || "").trim();
    const i = b.search(/with great excitement|best regard|sincerely/i); // drop any existing sign-off
    if (i >= 0) b = b.slice(0, i).trim();
    return b;
  })();
  const links = [
    me.site && `Portfolio - ${me.site}`,
    me.site && `Resume - ${me.site.replace(/\/$/, "")}/resume`,
    me.github && `GitHub - ${me.github}`,
    me.linkedin && `LinkedIn - ${me.linkedin}`,
  ].filter(Boolean) as string[];
  const emailBody = [
    coverBody,
    "",
    ...(links.length ? ["A few links if useful:", ...links, ""] : []),
    "Happy to walk through any of these projects if one catches your eye - just let me know and we can find a time.",
    "",
    ...["With great excitement,", me.name, me.email, me.phone].filter(Boolean),
  ].join("\n");
  // Find the apply-to email in the posting. Handles plain addresses AND the HN-style obfuscation
  // "name [at] company [dot] com". VALIDATES the result so we never inject garbage into the To:
  // field - the old naive version matched prose like "data at scale. This" -> "data@scale.This"
  // and placeholders like "first.last@". A wrong recipient is worse than none. (owner 2026-08-07)
  const extractedEmail = (() => {
    const t = `${app.jd || ""} ${app.notes || ""}`;
    const PLACE_LOCAL = /^(first\.?last|firstname\.?lastname|f\.?last|your\.?name|yourname|your\.?email|name|firstname|lastname|first|last|someone|somebody|user|username|email|e-?mail|me|you|hello|hi|test|example|foo|bar)$/i;
    const PLACE_DOM = /^(example|domain|company|yourcompany|mycompany|email|test|sample|acme|foo|bar|placeholder)\.(com|org|io|net|co|dev)$/i;
    const valid = (e: string) => {
      const clean = e.trim().toLowerCase().replace(/[.,;:>)\]]+$/, "");
      const [local, domain] = clean.split("@");
      if (!local || !domain) return "";
      if (PLACE_LOCAL.test(local) || PLACE_DOM.test(domain)) return "";
      const tld = domain.split(".").pop() || "";
      if (!/^[a-z]{2,24}$/.test(tld)) return ""; // kills prose TLDs like "This"/"We"/"Compensation"
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,24}$/.test(domain)) return "";
      return clean;
    };
    const plain = t.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/);
    if (plain) { const v = valid(plain[0]); if (v) return v; }
    // Obfuscation must use EXPLICIT markers (brackets, or the word "dot") - never a literal ".",
    // which is what made prose match. Bracketed [at]..[dot] first, else spelled " at .. dot ".
    const obf = t.match(/([\w.+-]+)\s*[[(]\s*at\s*[\])]\s*([\w-]+)\s*[[(]?\s*(?:dot|\.)\s*[\])]?\s*([a-z]{2,24})/i)
      || t.match(/([\w.+-]+)\s+at\s+([\w-]+)\s+dot\s+([a-z]{2,24})/i);
    if (obf) { const v = valid(`${obf[1]}@${obf[2]}.${obf[3]}`); if (v) return v; }
    // "name at domain.tld" - spelled "at" with a REAL domain (literal dot), e.g. HN's
    // "email ben at bucket.bot". Guarded against prose verbs and job-board domains so it
    // doesn't grab "apply at workatastartup.com". (owner 2026-08-08)
    const at2 = t.match(/\b([a-z][\w.+-]{1,30})\s+at\s+([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i);
    if (at2 && !/^(apply|send|us|me|you|contact|email|reach|write|join|work|now|here|role|jobs?|hiring|team)$/i.test(at2[1])
      && !/ycombinator|workatastartup|linkedin|indeed|greenhouse|lever|ashby|workday|gmail|google/i.test(at2[2])) {
      const v = valid(`${at2[1]}@${at2[2]}`); if (v) return v;
    }
    return "";
  })();
  // Prefer the address in the post; else fall back to a Hunter-found contact cached on the row
  // (the "Find email" button below writes app.found_email). (owner request 2026-08-08)
  const recruiterEmail = extractedEmail || (app.found_email || "");
  let foundMeta: { name?: string; position?: string; confidence?: number } = {};
  try { foundMeta = app.found_email && !extractedEmail ? JSON.parse(app.found_email_meta || "{}") : {}; } catch { /* ignore */ }
  // A direct "apply here" link in the post (workatastartup / a careers page) - Step 1, done
  // before the warm email. Skip the HN item itself and any asset URL. (owner 2026-08-08)
  const applyLink = (() => {
    const t = `${app.jd || ""} ${app.notes || ""}`;
    const urls = t.match(/https?:\/\/[^\s)>\]]+/gi) || [];
    const link = urls.find((u) => !/news\.ycombinator\.com/i.test(u) && !/\.(png|jpe?g|gif|svg|pdf|webp)$/i.test(u));
    return link ? link.replace(/[.,);\]]+$/, "") : "";
  })();
  // "Apply now" opens Gmail web compose (primary account) with to/subject/body pre-injected.
  const gmailComposeUrl = `https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1${recruiterEmail ? `&to=${encodeURIComponent(recruiterEmail)}` : ""}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  const fields: Field[] = (() => {
    for (const e of events) {
      if (e.fields) { try { return JSON.parse(e.fields) as Field[]; } catch {} }
    }
    return [];
  })();

  // Only genuinely-needed context stays in the top-left meta. "Applied on" is redundant
  // (the APPLIED badge shows it), and the preflight status + LinkedIn-scrape note are moved
  // to a quiet bottom-right timestamp. (owner request 2026-08-06)
  const meta: string[] = [];
  if (app.rejected_at) meta.push(`Rejected ${app.rejected_at}`);
  const prescan = app.pf_status ? `Prescan: ${app.pf_status}${app.pf_total ? ` ${app.pf_covered}/${app.pf_total}` : ""}` : "";
  // Tech tags for the hero: the job's STORED tech (extracted from the job text at scan time,
  // never the resume - same source the board uses) plus anything else the title/JD names, so a
  // sparse JD still shows the curated stack. (owner request 2026-08-09)
  let storedTech: string[] = [];
  try { storedTech = JSON.parse(app.tech || "[]"); } catch { /* bad json */ }
  const techSlugs = [...new Set([...storedTech, ...extractAllTech(`${app.title || ""} ${typeof app.jd === "string" ? app.jd : ""}`)])].filter((s) => techMeta(s));

  // Posting age from the scan date (source_run = "linkedin-YYYY-MM-DD"). LinkedIn/Indeed
  // publish no hard "apply by" deadline, so we surface how long it has sat instead - the
  // older a listing, the likelier it has closed. Age flag only; never auto-archives. (2026-08-02)
  const seenIso = (app.source_run || "").match(/(\d{4}-\d{2}-\d{2})/)?.[1] || (app.updated_at || "").slice(0, 10) || "";
  // eslint-disable-next-line react-hooks/purity -- server component: per-request "now" for a read-only job-age flag
  const ageDays = seenIso ? Math.max(0, Math.floor((Date.now() - new Date(`${seenIso}T00:00:00`).getTime()) / 86400000)) : null;
  const showAge = ageDays !== null && ["planned", "kit_ready", "manual_only"].includes(app.status || "");
  const stale = ageDays !== null && ageDays >= 28;
  const aging = ageDays !== null && ageDays >= 15 && ageDays < 28;
  const ageLabel = ageDays === null ? "" : `Seen ${ageDays}d ago${stale ? " · likely expired" : aging ? " · apply soon" : ""}`;

  // Source (LinkedIn / Indeed / Ashby ...) derived from the apply URL, for its icon.
  const u = (app.url || "").toLowerCase();
  const src = !u.startsWith("http") ? ""
    : u.includes("ashbyhq") ? "Ashby"
    : u.includes("greenhouse") ? "Greenhouse"
    : u.includes("lever.co") ? "Lever"
    : u.includes("indeed") ? "Indeed"
    : u.includes("linkedin") ? "LinkedIn"
    : u.includes("news.ycombinator.com") ? "HackerNews" : "";
  const srcUri = src ? getLogo(`src:${src}`) : null;

  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div className="max-w-[900px] mx-auto px-5 py-6 pb-16" style={{ zoom: 0.85 }}>
        <Link href={backHref} className="text-xs text-blue-700 no-underline">&larr; back to board</Link>

        <div className="bg-white border border-gray-200 rounded-2xl px-6 py-5 mt-3 mb-4 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="relative shrink-0" style={{ width: 48, height: 48 }}>
                {(() => {
                  const uri = getLogo(app.company);
                  return uri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={uri} alt={`${app.company ?? ""} logo`} width={48} height={48} className="rounded-[12px] bg-white border border-gray-200 object-contain w-12 h-12" />
                  ) : (
                    <span className="inline-flex items-center justify-center rounded-[12px] bg-blue-600 text-white text-lg font-bold w-12 h-12">{(app.company || "?").trim().slice(0, 1).toUpperCase()}</span>
                  );
                })()}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[22px] font-extrabold truncate leading-tight">{app.company || "?"}</span>
                  {app.url ? <a href={app.url} target="_blank" rel="noopener noreferrer" title="Open apply page" className="shrink-0 text-blue-600 hover:text-blue-800 font-bold text-[18px] leading-none no-underline">&#8599;</a> : null}
                </div>
                <div className="text-[15px] text-gray-500 mt-0.5 leading-snug">{app.title}</div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {src ? (
                    <a href={app.url || "#"} target="_blank" rel="noopener noreferrer" title={`Open on ${src}`} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full pl-1 pr-2.5 py-0.5 no-underline">
                      {srcUri
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={srcUri} alt={src} width={16} height={16} className="w-4 h-4 rounded-full object-contain" />
                        : null}
                      {src}
                    </a>
                  ) : null}
                  {(() => {
                    const nh = nearHome(app.location);
                    if (!nh) return null;
                    return (
                      <span title={`${nh.town} - about ${nh.miles} miles from home`} className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="2.5" /></svg>
                        Near home {nh.miles > 0 ? `~${nh.miles}mi` : ""}
                      </span>
                    );
                  })()}
                  {(() => {
                    const alt = altitude(app.company, app.title, !!nearHome(app.location));
                    if (alt === "near-home") return null; // near-home already shows its own badge
                    const m = ALT_META[alt];
                    return <span title={m.hint} className={`inline-flex items-center text-[11px] font-bold border rounded-full px-2.5 py-0.5 ${m.cls}`}>{m.label}</span>;
                  })()}
                </div>
                {techSlugs.length ? (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    {techSlugs.map((s) => {
                      const label = techMeta(s)?.label || s;
                      const uri = getLogo(`tech:${s}`);
                      return (
                        <span key={s} title={techCategory(s)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-full pl-1 pr-2 py-0.5">
                          {uri
                            /* eslint-disable-next-line @next/next/no-img-element */
                            ? <img src={uri} alt="" width={14} height={14} className="w-3.5 h-3.5 rounded object-contain bg-white" />
                            : null}
                          {label}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className={`inline-block text-[11px] px-2.5 py-1 rounded-md uppercase font-bold tracking-wide border ${STPILL[app.status || "planned"] || "bg-gray-100 text-gray-500 border-gray-200"}`}>{app.status}</span>
              <div className="text-[26px] font-extrabold text-blue-700 mt-2 leading-none">{app.score ?? "-"}</div>
              <div className="mt-2.5 flex justify-end items-center gap-2 flex-wrap"><ReachOut company={app.company || ""} title={app.title || ""} jd={typeof app.jd === "string" ? app.jd : ""} me={me} /><Reactions id={app.id} liked={app.liked} status={app.status} appliedAt={app.applied_at} company={app.company} /></div>
            </div>
          </div>
          {/* Every action now lives in the icon row above (Applied + Hold-off included), so the
              button row is gone. Quiet context (prescan status + how long it has sat) goes
              bottom-right, out of the way. (owner request 2026-08-06) */}
          {meta.length ? <div className="mt-3 text-xs text-gray-600 leading-relaxed">{meta.map((m, i) => <div key={i}>{m}</div>)}</div> : null}
          {(prescan || showAge) ? (
            <div className="mt-3 flex justify-end items-center gap-2 text-[11px] text-gray-400">
              {prescan ? <span>{prescan}</span> : null}
              {prescan && showAge ? <span className="text-gray-300">·</span> : null}
              {showAge ? <span title={`First scanned ${seenIso}.`}>{ageLabel}</span> : null}
            </div>
          ) : null}
        </div>

        {app.jd ? (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
            <div className="bg-gradient-to-r from-slate-600 to-slate-800 px-4 py-2.5">
              <h2 className="text-sm text-white tracking-wide flex items-center gap-2"><HIcon d={HD.jd} />Job description</h2>
            </div>
            <div className="px-6 py-5">
              <JobDescription text={typeof app.jd === "string" ? app.jd : String(app.jd ?? "")} />
            </div>
          </div>
        ) : null}

        <Section title="Resume (this version)" grad="from-blue-500 to-blue-700" html={kit.resumeHtml} copyText={kit.resumeText} icon={HD.resume} />
        {!kit.resumeHtml && kit.hasResumePdf ? (
          <div className="bg-white border border-gray-300 rounded-xl px-6 py-5 mb-3.5">
            <h2 className="text-[15px] font-bold mb-2.5">Resume (this version)</h2>
            <p className="text-[13px] text-gray-600">Used the master resume PDF (no per-job tailored markdown). <a href={`/api/kit/${app.id}/file/resume.pdf`} target="_blank" rel="noopener noreferrer" className="text-blue-700">Open resume.pdf &rarr;</a></p>
          </div>
        ) : null}
        {kit.usedMaster ? (
          <div className="bg-white border border-gray-300 rounded-xl px-6 py-5 mb-3.5">
            <h2 className="text-[15px] font-bold mb-1">Resume (this version)</h2>
            <p className="text-[13px] text-gray-400">Used the master resume PDF.</p>
          </div>
        ) : null}
        {kit.hasResumePdf ? (
          <a href={`/api/kit/${app.id}/file/resume.pdf`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white shadow-sm px-5 py-4 mb-3.5 no-underline hover:bg-gray-50">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 text-red-600 text-[10px] font-bold shrink-0">PDF</span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[14px] font-bold text-[#1f2328]">Resume PDF (as submitted)</span>
              <span className="block text-[12px] text-blue-700">Tap to open the exact file &rarr;</span>
            </span>
          </a>
        ) : null}
        {/* Hacker News = apply by email: show ONE ready-to-send email (subject + body +
            links + invite), not a separate cover letter. Otherwise the normal cover. */}
        {isEmailApply && kit.coverText ? (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
            <div className="bg-gradient-to-r from-slate-600 to-slate-800 px-4 py-2.5 flex items-center justify-between gap-2">
              <h2 className="text-sm text-white tracking-wide flex items-center gap-2"><HIcon d={HD.email} />How to apply<span className="text-xs text-white/80 ml-2">Hacker News &middot; {applyLink ? "2 steps" : "1 step"}</span></h2>
              <span className="flex items-center gap-1.5 shrink-0">
                <a href={gmailComposeUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-white bg-green-600 hover:bg-green-700 rounded px-2.5 py-0.5 no-underline">Apply now (Gmail)</a>
                <CopyButton text={emailBody} label="Copy" />
              </span>
            </div>
            <div className="px-6 py-5">
              {/* Numbered so it is obvious what to do first: apply on their site (if the post
                  gives a link), THEN send the warm email to stand out. Email-only posts show
                  just one step. (owner request 2026-08-08) */}
              {applyLink ? (
                <div className="flex items-center gap-2.5 mb-4 pb-4 border-b border-gray-100">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-slate-700 text-white text-[11px] font-bold flex items-center justify-center">1</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-[#1f2328]">Apply on their site first</div>
                    <div className="text-[11px] text-gray-500 truncate">{applyLink.replace(/^https?:\/\/(www\.)?/, "")}</div>
                  </div>
                  <a href={applyLink} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded px-2.5 py-1 no-underline inline-flex items-center gap-1">Open &#8599;</a>
                </div>
              ) : null}
              <div className="flex items-center gap-2.5 mb-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-700 text-white text-[11px] font-bold flex items-center justify-center">{applyLink ? "2" : "1"}</span>
                <div className="text-[13px] font-bold text-[#1f2328]">{applyLink ? "Then email" : "Email"} {foundMeta.name || (recruiterEmail ? "them" : "the team")} directly{applyLink ? " to stand out" : ""}</div>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide shrink-0 w-12">To</span>
                {recruiterEmail
                  ? <>
                      <span className="flex-1 min-w-0 text-[14px] text-[#1f2328] truncate">{recruiterEmail}</span>
                      {(foundMeta.name || foundMeta.position) ? <span className="shrink-0 text-[11px] text-indigo-500 truncate max-w-[46%]" title={`Found via Hunter${foundMeta.confidence ? ` - ${foundMeta.confidence}% match` : ""}`}>via Hunter{foundMeta.name ? `: ${foundMeta.name}` : ""}{foundMeta.position ? ` (${foundMeta.position})` : ""}</span> : null}
                      <CopyButton text={recruiterEmail} tone="onLight" />
                    </>
                  : <>
                      <span className="flex-1 min-w-0 text-[13px] text-amber-600">No email in the post - try LinkedIn first (free), Hunter only if needed</span>
                      <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${app.company || ""} recruiter`)}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] font-bold text-white bg-[#0a66c2] hover:bg-[#004182] rounded px-2.5 py-1 no-underline inline-flex items-center gap-1" title="Find the recruiter / poster on LinkedIn - costs nothing">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21H20v-5.5c0-1.3-.02-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9V21H12z"/></svg>
                        LinkedIn
                      </a>
                      <FindEmailButton id={app.id} />
                    </>}
              </div>
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide shrink-0 w-12">Subject</span>
                <span className="flex-1 min-w-0 text-[14px] text-[#1f2328]">{emailSubject}</span>
                <CopyButton text={emailSubject} tone="onLight" />
              </div>
              <pre className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#1f2328]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>{emailBody}</pre>
              <p className="text-[11px] text-gray-400 mt-4 pt-3 border-t border-gray-100">Sign-off + contact are included in the body above (Gmail does not auto-add your signature to a pre-filled compose).</p>
            </div>
          </div>
        ) : (
          <Section title="Cover letter" grad="from-purple-500 to-violet-600" html={kit.coverHtml} copyText={kit.coverText} icon={HD.cover} />
        )}
        <Section title="Screening answers" grad="from-amber-400 to-orange-500" html={kit.screeningHtml} copyText={kit.screeningText} icon={HD.screening} />

        {(() => {
          const isRed = (f: Field) => String(f[1] ?? "").trim().toUpperCase().startsWith("MANUAL");
          // File uploads are NOT real gaps: resume + cover attach automatically when you apply,
          // and "attach / upload anything" are optional extras. Never lump them into the red
          // "needs a rule or you" list - that reads as broken. (owner request 2026-08-06)
          const isFile = (f: Field) => f[2] === "file"
            || /attach|resume|\bcv\b|curriculum|cover letter|upload|portfolio/i.test(String(f[0]))
            || /unlabeled upload/i.test(String(f[1]));
          const manualNonFile = fields.filter((f) => isRed(f) && !isFile(f));
          const answered = manualNonFile.map((f) => ({ q: String(f[0] ?? ""), a: resolveAnswer(String(f[0] ?? "")) })).filter((x) => x.a);
          const reds = manualNonFile.filter((f) => !resolveAnswer(String(f[0] ?? "")));
          const files = fields.filter((f) => isRed(f) && isFile(f));
          // Turn each raw file field into a plain-English row. The scanner shows a bare "attach"
          // when a form's file input has no readable label (common on Greenhouse/Ashby) - say so
          // instead of a cryptic "attach", and tell the truth about whether it auto-attaches or
          // needs a hand. (owner question 2026-08-07)
          const fileMeta = (f: Field): { label: string; note: string; auto: boolean } => {
            const l = String(f[0] ?? "").toLowerCase();
            const unlabeled = /unlabeled upload/i.test(String(f[1] ?? ""));
            if (/resume|\bcv\b|curriculum/.test(l)) return { label: "Resume / CV", note: "attaches automatically", auto: true };
            if (/cover letter/.test(l)) return { label: "Cover letter", note: "attaches automatically", auto: true };
            if (/portfolio/.test(l)) return { label: "Portfolio", note: "optional - your site link", auto: false };
            if (unlabeled || l === "attach") return { label: "Unlabeled upload box", note: "the form's file button has no label - drag a file by hand only if it asks", auto: false };
            if (/upload/.test(l)) return { label: "Extra upload", note: "optional - nothing required", auto: false };
            return { label: String(f[0] ?? "file"), note: "optional extra upload", auto: false };
          };
          const greens = fields.filter((f) => !isRed(f));
          return (
            <>
              {answered.length ? (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
                  <h2 className="bg-gradient-to-r from-sky-500 to-blue-600 text-white text-sm tracking-wide px-4 py-2.5 flex items-center gap-2"><HIcon d={HD.screening} />Answers to paste <span className="text-xs font-bold text-white bg-blue-700 rounded-full px-2 py-0.5 ml-1">{answered.length}</span></h2>
                  <div className="divide-y divide-gray-100">
                    {answered.map((x, i) => (
                      <div key={i} className="group px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-[13px] font-semibold text-gray-800">{x.q}</div>
                          <CopyButton text={x.a} tone="onLight" />
                        </div>
                        <div className="text-[13px] text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed">{x.a}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {reds.length ? (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
                  <h2 className="bg-gradient-to-r from-rose-500 to-red-600 text-white text-sm tracking-wide px-4 py-2.5 flex items-center gap-2"><HIcon d={HD.red} />Needs an answer <span className="text-xs font-bold text-white bg-red-600 rounded-full px-2 py-0.5 ml-1">{reds.length}</span></h2>
                  <table className="w-full border-collapse">
                    <tbody>
                      {reds.map((f: Field, i: number) => (
                        <tr key={i}>
                          <td className="px-2.5 py-1.5 border-b border-red-100 text-red-800 text-[13px] font-semibold w-[42%]">{f[0]}</td>
                          <td className="px-2.5 py-1.5 border-b border-red-100 text-xs text-red-600">{f[1]}{Array.isArray(f[3]) && f[3].length ? <span className="block text-gray-500 mt-0.5">options: {f[3].slice(0, 6).join(" | ").slice(0, 140)}</span> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {files.length ? (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
                  <h2 className="bg-gradient-to-r from-slate-500 to-slate-600 text-white text-sm tracking-wide px-4 py-2.5 flex items-center gap-2"><HIcon d={HD.files} />Files - handled when you apply <span className="text-xs font-bold text-white bg-slate-700 rounded-full px-2 py-0.5 ml-1">{files.length}</span></h2>
                  <div className="px-4 py-2.5 text-[12px] text-gray-500 border-b border-gray-100">Your resume and cover letter attach automatically when the extension fills the form. Anything marked <span className="text-amber-600 font-semibold">by hand</span> is just an unlabeled or optional upload box - only touch it if the form actually asks.</div>
                  <table className="w-full border-collapse">
                    <tbody>
                      {files.map((f: Field, i: number) => {
                        const m = fileMeta(f);
                        return (
                          <tr key={i}>
                            <td className="px-2.5 py-1.5 border-b border-gray-100 text-gray-700 text-[13px] font-semibold w-[42%]">{m.label}</td>
                            <td className={`px-2.5 py-1.5 border-b border-gray-100 text-xs ${m.auto ? "text-green-600" : "text-gray-400"}`}>{m.auto ? "attaches automatically" : m.note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {greens.length ? (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
                  <h2 className="bg-gradient-to-r from-green-600 to-emerald-700 text-white text-sm tracking-wide px-4 py-2.5 flex items-center gap-2"><HIcon d={HD.filled} />Filled by JobFill <span className="text-xs font-bold text-white bg-green-700 rounded-full px-2 py-0.5 ml-1">{greens.length}</span><span className="text-xs text-white/70 font-normal ml-1">latest pre-run</span></h2>
                  <table className="w-full border-collapse">
                    <tbody>
                      {greens.map((f: Field, i: number) => (
                        <tr key={i} className="group">
                          <td className="px-2.5 py-1.5 border-b border-gray-100 text-gray-500 text-xs w-[42%] align-top">{f[0]}</td>
                          <td className="px-2.5 py-1.5 border-b border-gray-100 text-[13px]">
                            <div className="flex items-start justify-between gap-2">
                              <span className="whitespace-pre-wrap">{f[1]}</span>
                              <CopyButton text={String(f[1] ?? "")} tone="onLight" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          );
        })()}
      </div>
    </main>
  );
}
