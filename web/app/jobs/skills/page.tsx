import Link from "next/link";

export const dynamic = "force-static";

type SkillCard = {
  n: number; verb: string; cmd: string; grad: string; dot: string;
  what: string; output: string; benefit: string; loop: string; status?: string;
};

const SKILLS: SkillCard[] = [
  {
    n: 1, verb: "setup", cmd: "/job setup", grad: "from-gray-500 to-gray-700", dot: "#57606a",
    what: "Establish or edit the profile every other stage reads: resume, target roles, comp floor, locations, scoring rubric, apply answers (sponsorship, salary, notice...).",
    output: "profile.json",
    benefit: "One honest profile powers every fill, score, and essay - change it once, every stage updates.",
    loop: "Once, then only when your targets or comp change.",
  },
  {
    n: 2, verb: "search", cmd: "/job search", grad: "from-blue-500 to-blue-700", dot: "#0969da",
    what: "Scan Greenhouse/Ashby/Lever public APIs (+ pasted URLs), score each job 0-100 against the rubric, rank matches.",
    output: "scored candidates -> jobs.db pipeline",
    benefit: "Replaces hours of board-scrolling with a ranked shortlist filtered by your hard rules (no Java, no contract...).",
    loop: "Weekly - fresh postings decay fast; a 7-day cadence keeps the top of the funnel full.",
    status: "being ported to TypeScript - engine is parked in legacy-python/",
  },
  {
    n: 3, verb: "tailor", cmd: "/job tailor <id>", grad: "from-purple-500 to-violet-600", dot: "#8250df",
    what: "Reweight and rephrase your REAL experience toward the JD's keywords - never invents. Modes: --ats (keyword match %), --review (adversarial QA), --pdf (house-style PDF).",
    output: "applications/<id>/resume.md + resume.pdf",
    benefit: "Beats the ATS keyword screen with a resume that is still 100% true - the difference between auto-reject and human eyes.",
    loop: "Per job, right after a search run - tailor the top scorers first.",
  },
  {
    n: 4, verb: "cover", cmd: "/job cover <id>", grad: "from-pink-500 to-rose-600", dot: "#bf3989",
    what: "Write a tailored cover letter from real profile highlights - honest, specific, no fabricated claims.",
    output: "applications/<id>/cover-letter.md",
    benefit: "A specific letter citing real work (ACE editor, 5s->0.5s TTFB) reads human; generic letters read as spam.",
    loop: "Per job, straight after tailor.",
  },
  {
    n: 5, verb: "apply", cmd: "/job apply <id>", grad: "from-emerald-500 to-green-600", dot: "#1a7f37",
    what: "Assemble the kit (resume + cover + screening answers + apply link), probe the REAL form headlessly (verified preflight), stamp ready/gaps into jobs.db. You review + click Submit; the extension fills.",
    output: "kit dir + verified pf_status in jobs.db",
    benefit: "Every 'Ready' row is proven fillable end-to-end before you spend a click - zero surprise questions mid-apply.",
    loop: "Per job after cover; re-probe if a form changes.",
  },
  {
    n: 6, verb: "report", cmd: "/job report", grad: "from-amber-400 to-orange-500", dot: "#9a6700",
    what: "Gmail-sync first (confirmations -> applied, rejections -> rejected, invites -> interviewing), update jobs.db, then open this board.",
    output: "fresh statuses on /jobs",
    benefit: "The board never lies - inbox truth flows into the db so you chase real opportunities, not ghosts.",
    loop: "Daily or every few days - rejections and invites arrive on the employer's clock.",
  },
];

export default function Skills() {
  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]" style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div className="max-w-[900px] mx-auto px-5 py-7 pb-16">
        <Link href="/jobs" className="text-xs text-blue-700 no-underline">&larr; board</Link>
        <span className="font-mono text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-2 py-0.5 ml-3">/jobs/skills</span>
        <h1 className="text-3xl font-bold text-blue-700 mt-3 mb-1">Pipeline skills</h1>
        <div className="text-[13px] text-gray-500 mb-5">6 stages, one loop: setup once &middot; search weekly &middot; tailor &rarr; cover &rarr; apply per job &middot; report daily</div>

        {/* the loop, at a glance */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-5 py-4 mb-6">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">The loop</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
            {SKILLS.map((s, i) => (
              <span key={s.verb} className="flex items-center gap-1.5">
                <span className={`rounded-lg px-2.5 py-1 text-white bg-gradient-to-r ${s.grad}`}>{s.n}. {s.verb}</span>
                {i < SKILLS.length - 1 ? <span className="text-gray-300">&rarr;</span> : <span className="text-gray-300">&#8635;</span>}
              </span>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-2.5">Steady state: <b>search</b> refills the funnel weekly, <b>tailor/cover/apply</b> burn it down per job, <b>report</b> closes the feedback loop daily. Submit clicks stay yours - everything else is machine.</div>
        </div>

        {/* skill cards */}
        <div className="grid gap-4">
          {SKILLS.map((s) => (
            <div key={s.verb} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className={`bg-gradient-to-r ${s.grad} px-4 py-2.5 flex items-center justify-between`}>
                <h2 className="text-sm font-bold text-white tracking-wide">{s.n}. {s.verb}</h2>
                <code className="text-xs font-bold text-white bg-white/25 rounded-full px-2.5 py-0.5">{s.cmd}</code>
              </div>
              <div className="px-5 py-4 text-[13px] leading-relaxed">
                <p className="mb-2">{s.what}</p>
                <div className="grid sm:grid-cols-3 gap-3 mt-3">
                  <div className="bg-[#f6f8fa] border border-gray-100 rounded-lg px-3 py-2">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Output</div>
                    <div className="text-xs mt-0.5 font-mono">{s.output}</div>
                  </div>
                  <div className="bg-[#f6f8fa] border border-gray-100 rounded-lg px-3 py-2">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Benefit</div>
                    <div className="text-xs mt-0.5">{s.benefit}</div>
                  </div>
                  <div className="bg-[#f6f8fa] border border-gray-100 rounded-lg px-3 py-2">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Loop cadence</div>
                    <div className="text-xs mt-0.5">{s.loop}</div>
                  </div>
                </div>
                {s.status ? <div className="mt-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 inline-block">&#9888; {s.status}</div> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center text-xs text-gray-400">run any stage via Claude: <code>/job &lt;verb&gt;</code> &middot; state lives in jobs.db</div>
      </div>
    </main>
  );
}
