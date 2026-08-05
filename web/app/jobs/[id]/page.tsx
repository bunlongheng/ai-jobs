import { getApp, type Field } from "@/lib/queries";
import { getKit } from "@/lib/kit";
import { getLogo } from "@/lib/logos";
import { nearHome } from "@/lib/near-home";
import Reactions from "../Reactions";
import ApplyToggle from "../ApplyToggle";
import CopyButton from "../CopyButton";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function Section({ title, sub, html, grad = "from-blue-500 to-blue-700", copyText }: { title: string; sub?: string; html: string; grad?: string; copyText?: string }) {
  if (!html) return null;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
      <div className={`bg-gradient-to-r ${grad} px-4 py-2.5 flex items-center justify-between gap-2`}>
        <h2 className="text-sm text-white tracking-wide">{title}{sub ? <span className="text-xs text-white/80 ml-2">{sub}</span> : null}</h2>
        {copyText ? <CopyButton text={copyText} /> : null}
      </div>
      <div className="prose-kit text-[13px] leading-relaxed px-6 py-5" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

const STBG: Record<string, string> = {
  planned: "from-sky-400 to-sky-500", kit_ready: "from-blue-600 to-blue-800",
  applied: "from-green-600 to-emerald-700", rejected: "from-rose-500 to-red-600",
  interviewing: "from-purple-500 to-violet-600", manual_only: "from-amber-400 to-orange-500",
  expired: "from-amber-500 to-orange-600",
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
  const emailSubject = `Application: ${app.title ?? ""} - Bunlong Heng`;
  const coverBody = (() => {
    let b = (kit.coverText || "").trim();
    const i = b.search(/with great excitement|best regard|sincerely/i); // drop any existing sign-off
    if (i >= 0) b = b.slice(0, i).trim();
    return b;
  })();
  const emailBody = [
    coverBody,
    "",
    "A few links if useful:",
    "Portfolio - https://www.bunlongheng.com",
    "Resume - https://www.bunlongheng.com/resume",
    "GitHub - https://github.com/bunlongheng",
    "LinkedIn - https://www.linkedin.com/in/bunlongheng",
    "",
    "Happy to walk through any of these projects if one catches your eye - just let me know and we can find a time.",
    "",
    "With great excitement,",
    "Bunlong Heng",
    "bheng.code@gmail.com",
    "978-677-0861",
  ].join("\n");
  // Find the apply-to email in the posting. Handles plain addresses AND the HN-style
  // obfuscation "name [at] company [dot] com" / "name (at) company dot com". (owner 2026-08-05)
  const recruiterEmail = (() => {
    const t = `${app.jd || ""} ${app.notes || ""}`;
    const plain = t.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/);
    if (plain) return plain[0];
    const obf = t.match(/([\w.+-]+)\s*[[(]?\s*at\s*[\])]?\s*([\w-]+)\s*[[(]?\s*(?:dot|\.)\s*[\])]?\s*([\w.]{2,})/i);
    return obf ? `${obf[1]}@${obf[2]}.${obf[3]}` : "";
  })();
  // "Apply now" opens Gmail web compose (primary account) with to/subject/body pre-injected.
  const gmailComposeUrl = `https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1${recruiterEmail ? `&to=${encodeURIComponent(recruiterEmail)}` : ""}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  const fields: Field[] = (() => {
    for (const e of events) {
      if (e.fields) { try { return JSON.parse(e.fields) as Field[]; } catch {} }
    }
    return [];
  })();

  const meta: string[] = [];
  if (app.applied_at) meta.push(`Applied ${app.applied_at}`);
  if (app.rejected_at) meta.push(`Rejected ${app.rejected_at}`);
  if (app.pf_status) meta.push(`Preflight: ${app.pf_status}${app.pf_total ? ` ${app.pf_covered}/${app.pf_total}` : ""}`);
  if (app.notes) meta.push(app.notes);

  // Posting age from the scan date (source_run = "linkedin-YYYY-MM-DD"). LinkedIn/Indeed
  // publish no hard "apply by" deadline, so we surface how long it has sat instead - the
  // older a listing, the likelier it has closed. Age flag only; never auto-archives. (2026-08-02)
  const seenIso = (app.source_run || "").match(/(\d{4}-\d{2}-\d{2})/)?.[1] || (app.updated_at || "").slice(0, 10) || "";
  const ageDays = seenIso ? Math.max(0, Math.floor((Date.now() - new Date(`${seenIso}T00:00:00`).getTime()) / 86400000)) : null;
  const showAge = ageDays !== null && ["planned", "kit_ready", "manual_only"].includes(app.status || "");
  const stale = ageDays !== null && ageDays >= 28;
  const aging = ageDays !== null && ageDays >= 15 && ageDays < 28;
  const ageCls = stale ? "text-rose-700 bg-rose-100" : aging ? "text-amber-700 bg-amber-100" : "text-gray-500 bg-gray-100";
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
      <div className="max-w-[900px] mx-auto px-5 py-6 pb-16">
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
                <div className="text-[22px] font-extrabold truncate leading-tight">{app.company || "?"}</div>
                <div className="text-[15px] text-gray-500 mt-0.5 leading-snug">{app.title}</div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {src ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full pl-1 pr-2.5 py-0.5">
                      {srcUri
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={srcUri} alt={src} width={16} height={16} className="w-4 h-4 rounded-full object-contain" />
                        : null}
                      {src}
                    </span>
                  ) : null}
                  {(() => {
                    const nh = nearHome(app.location);
                    if (!nh) return null;
                    return (
                      <span title={`${nh.town} - about ${nh.miles} miles from Pelham, NH`} className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="2.5" /></svg>
                        Near home {nh.miles === 0 ? "(Pelham)" : `~${nh.miles}mi`}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className={`inline-block text-xs px-3 py-1 rounded-lg uppercase font-bold tracking-wide text-white bg-gradient-to-r ${STBG[app.status || "planned"] || "from-gray-400 to-gray-500"}`}>{app.status}</span>
              <div className="text-[26px] font-extrabold text-blue-700 mt-2 leading-none">{app.score ?? "-"}</div>
              <div className="mt-2.5 flex justify-end items-center gap-1"><Reactions id={app.id} liked={app.liked} status={app.status} /></div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {app.url ? <a href={app.url} target="_blank" rel="noopener noreferrer" className="inline-block bg-green-700 text-white font-bold text-[13px] px-4 py-2 rounded-lg no-underline">Open apply page</a> : null}
            <ApplyToggle id={app.id} status={app.status} appliedAt={app.applied_at} />
            {showAge ? <span className={`inline-flex items-center text-[12px] font-semibold px-3 py-2 rounded-lg ${ageCls}`} title={`First scanned ${seenIso}. LinkedIn/Indeed publish no hard deadline; this is how long it has been on the board.`}>{ageLabel}</span> : null}
          </div>
          {meta.length ? <div className="mt-3 text-xs text-gray-600 leading-relaxed">{meta.map((m, i) => <div key={i}>{m}</div>)}</div> : null}
        </div>

        {app.jd ? (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
            <div className="bg-gradient-to-r from-slate-600 to-slate-800 px-4 py-2.5">
              <h2 className="text-sm text-white tracking-wide">Job description</h2>
            </div>
            <div className="text-[13px] leading-relaxed px-6 py-5 whitespace-pre-wrap text-[#1f2328]">{typeof app.jd === "string" ? app.jd : String(app.jd ?? "")}</div>
          </div>
        ) : null}

        <Section title="Resume (this version)" grad="from-blue-500 to-blue-700" html={kit.resumeHtml} copyText={kit.resumeText} />
        {!kit.resumeHtml && kit.hasResumePdf ? (
          <div className="bg-white border border-gray-300 rounded-xl px-6 py-5 mb-3.5">
            <h2 className="text-[15px] font-bold mb-2.5">Resume (this version)</h2>
            <p className="text-[13px] text-gray-600">Used the master resume PDF (no per-job tailored markdown). <a href={`/api/kit/${app.id}/file/resume.pdf`} target="_blank" rel="noopener noreferrer" className="text-blue-700">Open resume.pdf &rarr;</a></p>
          </div>
        ) : null}
        {kit.usedMaster ? (
          <div className="bg-white border border-gray-300 rounded-xl px-6 py-5 mb-3.5">
            <h2 className="text-[15px] font-bold mb-1">Resume (this version)</h2>
            <p className="text-[13px] text-gray-400">Used the master resume (resume-bunlong.pdf).</p>
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
              <h2 className="text-sm text-white tracking-wide">Email to recruiter<span className="text-xs text-white/80 ml-2">Hacker News - ready to send</span></h2>
              <span className="flex items-center gap-1.5 shrink-0">
                <a href={gmailComposeUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-white bg-green-600 hover:bg-green-700 rounded px-2.5 py-0.5 no-underline">Apply now (Gmail)</a>
                <CopyButton text={emailBody} label="Copy" />
              </span>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide shrink-0 w-12">To</span>
                {recruiterEmail
                  ? <><span className="flex-1 min-w-0 text-[14px] text-[#1f2328] truncate">{recruiterEmail}</span><CopyButton text={recruiterEmail} tone="onLight" /></>
                  : <span className="flex-1 min-w-0 text-[13px] text-amber-600">No apply-email in the post - add it in Gmail (the posting uses a link or hid the address)</span>}
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
          <Section title="Cover letter" grad="from-purple-500 to-violet-600" html={kit.coverHtml} copyText={kit.coverText} />
        )}
        <Section title="Screening answers" grad="from-amber-400 to-orange-500" html={kit.screeningHtml} copyText={kit.screeningText} />

        {(() => {
          const isRed = (f: Field) => String(f[1] ?? "").trim().toUpperCase().startsWith("MANUAL");
          const reds = fields.filter(isRed);
          const greens = fields.filter((f) => !isRed(f));
          return (
            <>
              {reds.length ? (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
                  <h2 className="bg-gradient-to-r from-rose-500 to-red-600 text-white text-sm tracking-wide px-4 py-2.5">Red - needs a rule or you <span className="text-xs font-bold text-white bg-red-600 rounded-full px-2 py-0.5 ml-2">{reds.length}</span></h2>
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
              {greens.length ? (
                <div className="bg-white border border-gray-300 rounded-xl px-5 py-4 mb-3.5">
                  <h2 className="text-[15px] font-bold mb-2.5">Filled by JobFill <span className="text-xs font-bold text-white bg-green-600 rounded-full px-2 py-0.5 ml-2">{greens.length}</span><span className="text-xs text-gray-400 font-normal ml-2">latest pre-run</span></h2>
                  <table className="w-full border-collapse">
                    <tbody>
                      {greens.map((f: Field, i: number) => (
                        <tr key={i}>
                          <td className="px-2.5 py-1.5 border-b border-gray-100 text-gray-500 text-xs w-[42%]">{f[0]}</td>
                          <td className="px-2.5 py-1.5 border-b border-gray-100 text-[13px]">{f[1]}</td>
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
