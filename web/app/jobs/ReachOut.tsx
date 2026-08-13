"use client";
import { useState } from "react";
import CopyButton from "./CopyButton";

// Warm-path outreach, tucked behind a button so it doesn't clutter the detail page. Click the
// "Reach out" button (top action row) to open a modal with: a LinkedIn job-search deep-link to
// confirm the role + see the poster, recruiter/hiring-manager searches, any name pulled from the
// posting, and a ready-to-send draft. Hidden until you ask for it. (owner request 2026-08-11)
function HIcon({ d, cls = "text-white" }: { d: string; cls?: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${cls} shrink-0`} aria-hidden><path d={d} /></svg>;
}

function recruiterFromJd(jd: string): string {
  if (!jd) return "";
  const pats = [
    /(?:recruiter|talent partner|talent acquisition|hiring manager|point of contact)\s*[:\-]?\s*([A-Z][a-z]+ [A-Z][a-z]+)/,
    /([A-Z][a-z]+ [A-Z][a-z]+),?\s+(?:our |the )?(?:technical |senior )?recruiter/i,
    /(?:reach out to|please contact|questions[,]? (?:please )?(?:email|contact))\s+([A-Z][a-z]+ [A-Z][a-z]+)/i,
  ];
  for (const p of pats) { const m = jd.match(p); if (m && m[1]) return m[1]; }
  return "";
}

type Me = { name?: string; site?: string; github?: string; linkedin?: string };
export default function ReachOut({ company, title, jd, me }: { company: string; title: string; jd?: string; me?: Me }) {
  const [open, setOpen] = useState(false);
  if (!company) return null;
  const kw = (extra: string) => `https://www.linkedin.com/${extra}`;
  const jobSearch = kw(`jobs/search/?keywords=${encodeURIComponent(`${company} ${title}`)}`);
  const peopleSearch = (role: string) => kw(`search/results/people/?keywords=${encodeURIComponent(`${company} ${role}`)}`);
  const recruiter = recruiterFromJd(jd || "");
  const strip = (u?: string) => (u || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const links = [strip(me?.site), strip(me?.github), strip(me?.linkedin)].filter(Boolean).join(" | ");
  const msg = `Hi ${recruiter ? recruiter.split(" ")[0] : "[name]"},\n\nI just applied for the ${title} role at ${company} and wanted to reach out directly. I think I'd be a strong fit and would love a quick chat, or to be pointed to the right person on the team.\n\nEither way, thanks for considering my application.\n\nBest,\n${me?.name || "[your name]"}${links ? `\n${links}` : ""}`;
  const linkCls = "inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-1.5 no-underline";

  return (
    <>
      <button onClick={() => setOpen(true)} title="Reach out (warm path)"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg px-3 py-1.5">
        <HIcon d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 6L2 7" cls="text-teal-600" />
        Reach out
      </button>

      {open ? (
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] flex items-start justify-center p-4 sm:p-8 overflow-y-auto">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[560px] bg-white rounded-2xl shadow-2xl overflow-hidden my-auto">
            <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2.5 flex items-center gap-2">
              <HIcon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
              <h2 className="text-sm text-white tracking-wide flex-1">Reach out (warm path)</h2>
              <button onClick={() => setOpen(false)} title="Close" className="text-white/80 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12px] text-gray-500 mb-3">A direct message to a real human beats a cold form. Open this role on LinkedIn to confirm it&apos;s posted there and see the poster (with photo) in your own session - check <b>&ldquo;Meet the hiring team&rdquo;</b> / <b>&ldquo;Posted by&rdquo;</b>.</p>
              <div className="flex flex-wrap gap-2 mb-3">
                <a href={jobSearch} target="_blank" rel="noopener noreferrer" className={`${linkCls} bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100`}>Find this job on LinkedIn &#8599;</a>
                <a href={peopleSearch("recruiter talent")} target="_blank" rel="noopener noreferrer" className={linkCls}>Recruiters at {company} &#8599;</a>
                <a href={peopleSearch("engineering manager")} target="_blank" rel="noopener noreferrer" className={linkCls}>Hiring managers &#8599;</a>
              </div>
              {recruiter ? (
                <div className="text-[12px] text-gray-600 mb-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                  Named in the posting: <b className="text-emerald-800">{recruiter}</b> - message them directly.
                </div>
              ) : null}
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Ready-to-send message</span>
                  <CopyButton text={msg} tone="onLight" />
                </div>
                <div className="text-[13px] text-[#1f2328] whitespace-pre-wrap leading-relaxed">{msg}</div>
                {recruiter ? null : <p className="text-[11px] text-gray-400 mt-2">Replace <b>[name]</b> once you find the person.</p>}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
