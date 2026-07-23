import { getApp, type Field } from "@/lib/queries";
import { getKit } from "@/lib/kit";
import { getLogo } from "@/lib/logos";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function Section({ title, sub, html }: { title: string; sub?: string; html: string }) {
  if (!html) return null;
  return (
    <div className="bg-white border border-gray-300 rounded-xl px-6 py-5 mb-3.5">
      <h2 className="text-[15px] font-bold mb-2.5">{title}{sub ? <span className="text-xs text-gray-400 font-normal ml-2">{sub}</span> : null}</h2>
      <div className="prose-kit text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

const STBG: Record<string, string> = {
  applied: "bg-green-50 text-green-700", kit_ready: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-red-600", interviewing: "bg-purple-50 text-purple-700",
  manual_only: "bg-amber-50 text-amber-700", planned: "bg-gray-50 text-gray-600",
};

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { app, events } = getApp(id);
  if (!app) notFound();
  const kit = getKit(id);

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

  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]" style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div className="max-w-[900px] mx-auto px-5 py-6 pb-16">
        <Link href="/jobs" className="text-xs text-blue-700 no-underline">&larr; back to board</Link>

        <div className="bg-white border border-gray-300 rounded-xl px-6 py-5 mt-3 mb-3.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {(() => {
                const uri = getLogo(app.company);
                return uri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uri} alt="" width={44} height={44} className="rounded-[10px] bg-white border border-gray-200 object-contain shrink-0" />
                ) : (
                  <span className="inline-flex items-center justify-center rounded-[10px] bg-blue-600 text-white text-lg font-bold shrink-0" style={{ width: 44, height: 44 }}>{(app.company || "?").trim().slice(0, 1).toUpperCase()}</span>
                );
              })()}
              <div className="min-w-0">
                <div className="text-[22px] font-extrabold truncate">{app.company || "?"}</div>
                <div className="text-[15px] text-gray-500 mt-0.5">{app.title}</div>
              </div>
            </div>
            <div className="text-right">
              <span className={`font-bold text-xs px-3 py-1 rounded-lg uppercase ${STBG[app.status || "planned"] || "bg-gray-50 text-gray-600"}`}>{app.status}</span>
              <div className="text-[22px] font-extrabold text-blue-700 mt-1.5">{app.score ?? "-"}</div>
            </div>
          </div>
          {app.url ? <div className="mt-3"><a href={app.url} target="_blank" rel="noopener noreferrer" className="inline-block bg-green-700 text-white font-bold text-[13px] px-4 py-2 rounded-lg no-underline">Open apply page</a></div> : null}
          {meta.length ? <div className="mt-3 text-xs text-gray-600 leading-relaxed">{meta.map((m, i) => <div key={i}>{m}</div>)}</div> : null}
        </div>

        <Section title="Resume (this version)" html={kit.resumeHtml} />
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
        <Section title="Cover letter" html={kit.coverHtml} />
        <Section title="Screening answers" html={kit.screeningHtml} />

        {(() => {
          const isRed = (f: Field) => String(f[1] ?? "").trim().toUpperCase().startsWith("MANUAL");
          const reds = fields.filter(isRed);
          const greens = fields.filter((f) => !isRed(f));
          return (
            <>
              {reds.length ? (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl px-5 py-4 mb-3.5">
                  <h2 className="text-[15px] font-bold mb-2.5 text-red-700">Red - needs a rule or you <span className="text-xs font-bold text-white bg-red-600 rounded-full px-2 py-0.5 ml-2">{reds.length}</span></h2>
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
