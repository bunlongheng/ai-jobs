import { getLogo } from "@/lib/logos";
import { db } from "@/lib/db";
import RecruiterStatus from "../RecruiterStatus";
import ViewTabs from "../ViewTabs";

export const dynamic = "force-dynamic"; // reads cached firm logos + outreach status live

// Per-firm outreach flags (called/emailed/replied), keyed by "name|city". (owner 2026-08-09)
function flagsMap(): Record<string, string[]> {
  const d = db();
  d.prepare("CREATE TABLE IF NOT EXISTS recruiter_status (firm TEXT PRIMARY KEY, status TEXT, updated_at TEXT)").run();
  const rows = d.prepare("SELECT firm, status FROM recruiter_status").all() as { firm: string; status: string }[];
  return Object.fromEntries(rows.map((r) => [r.firm, (r.status || "").split(",").filter(Boolean)]));
}
const firmKey = (f: Firm) => `${f.name}|${f.city}`;

// Recruiter/staffing call + email sheet - real, source-verified firms in Southern NH + Greater
// Boston that place software engineers. Phones/emails were seen on the firm's own page; toll-free
// lines and form-only firms are flagged; nothing is pattern-guessed. Distances are approximate
// driving miles from Pelham NH (home). (owner request 2026-08-09)
type Person = { n: string; li?: string; em?: string };
type Firm = {
  name: string; city: string; miles: number; phone: string; tel: string; verifiedPhone: boolean;
  domain: string; site: string; siteUrl: string;
  email?: string; form?: string; specialty: string; people?: Person[]; star?: boolean;
};

const NH: Firm[] = [
  { name: "Techneeds", city: "Salem NH", miles: 6, phone: "(603) 898-3000", tel: "+16038983000", verifiedPhone: true, domain: "techneeds.com", site: "techneeds.com", siteUrl: "https://www.techneeds.com", form: "https://www.techneeds.com/contact-us/", specialty: "Tech, engineering & manufacturing" },
  { name: "Alexander Technology Group", city: "Bedford NH", miles: 22, phone: "(603) 637-1466", tel: "+16036371466", verifiedPhone: true, domain: "alexandertg.com", site: "alexandertg.com", siteUrl: "https://www.alexandertg.com", specialty: "Pure IT / software staffing", star: true, people: [
    { n: "John Whelan (runs NH office)", li: "johnwhelan01", em: "jwhelan@alexandertg.com" },
    { n: "Paul Silvio (President)", li: "psilvio", em: "psilvio@alexandertg.com" },
    { n: "Scott Dinneen", li: "scott-dinneen-54bb608", em: "sdinneen@alexandertg.com" },
    { n: "Tim Darcy", li: "timothy-j-darcy-20aa917", em: "tdarcy@alexandertg.com" },
  ] },
  { name: "The DAVIS Companies", city: "Manchester NH", miles: 25, phone: "(603) 891-0111", tel: "+16038910111", verifiedPhone: true, domain: "daviscos.com", site: "daviscos.com", siteUrl: "https://www.daviscos.com", email: "edavis@daviscos.com", specialty: "Technical & IT staffing/recruiting", people: [
    { n: "Eric Davis (VP Partnerships)", em: "edavis@daviscos.com" },
    { n: "Andrea Pion (VP Client Programs)", em: "apion@daviscos.com" },
    { n: "Claire Gibree (HR)", em: "cgibree@daviscos.com" },
  ] },
  { name: "Robert Half Technology", city: "Manchester NH", miles: 25, phone: "(603) 932-4231", tel: "+16039324231", verifiedPhone: true, domain: "roberthalf.com", site: "roberthalf.com", siteUrl: "https://www.roberthalf.com", form: "https://www.roberthalf.com", specialty: "Tech practice (SWE, data, AI) · Nashua (603) 932-4842 · no email, use their portal", people: [{ n: "Andrew Hall (Lead Recruiter, RH Tech)", li: "" }] },
  { name: "Market Street Talent", city: "Portsmouth NH", miles: 45, phone: "(603) 431-0070", tel: "+16034310070", verifiedPhone: true, domain: "marketstreettalent.com", site: "marketstreettalent.com", siteUrl: "https://www.marketstreettalent.com", email: "goodfit@marketstreettalent.com", specialty: "IT-only staffing boutique" },
  { name: "PRI Technology", city: "Manchester NH", miles: 25, phone: "(603) 641-2000", tel: "+16036412000", verifiedPhone: true, domain: "pritechnology.com", site: "pritechnology.com", siteUrl: "https://pritechnology.com", email: "info@prisearch.com", specialty: "IT staffing (parent: Perennial Resources)" },
  { name: "Seaglass Technology Partners", city: "Portsmouth NH", miles: 45, phone: "(603) 319-8083", tel: "+16033198083", verifiedPhone: true, domain: "seaglassit.com", site: "seaglassit.com", siteUrl: "https://seaglassit.com", email: "mnguyen@seaglassit.com", specialty: "Software dev, infrastructure, IT", people: [{ n: "Mariam Nguyen", em: "mnguyen@seaglassit.com" }, { n: "Recruiting team also: krogers@, khogan@, egoodridge@" }] },
  { name: "NESC Staffing", city: "Portsmouth NH", miles: 45, phone: "(603) 431-9740", tel: "+16034319740", verifiedPhone: true, domain: "nesc.com", site: "nesc.com", siteUrl: "https://www.nesc.com", email: "info@nesc.com", specialty: "Technical & engineering staffing" },
  { name: "HW Staffing (Top Prospect IT)", city: "Nashua NH", miles: 12, phone: "(603) 966-2725", tel: "+16039662725", verifiedPhone: true, domain: "hwstaffing.com", site: "hwstaffing.com", siteUrl: "https://hwstaffing.com", email: "info@hwstaffing.com", specialty: "Acquired Top Prospect (IT) - ask for IT desk" },
  { name: "Insight Global", city: "Manchester NH", miles: 25, phone: "(855) 485-8853", tel: "+18554858853", verifiedPhone: false, domain: "insightglobal.com", site: "insightglobal.com", siteUrl: "https://insightglobal.com", email: "consultantexperience@insightglobal.com", specialty: "Toll-free · 3rd largest US IT staffing", people: [{ n: "Wes Newcomb (Nashua NH)", li: "jw-newcomb" }] },
];

const BOUTIQUE: Firm[] = [
  { name: "Motion Recruitment", city: "Boston", miles: 35, phone: "(617) 804-0399", tel: "+16178040399", verifiedPhone: true, domain: "motionrecruitment.com", site: "motionrecruitment.com", siteUrl: "https://motionrecruitment.com", form: "https://motionrecruitment.com/contact", specialty: "Pure-play tech (software, mobile, data, cyber)", people: [{ n: "Michael Couhig", li: "michael-couhig-a30589200" }, { n: "Trevor Murdock", li: "trevor-murdock-048186297" }] },
  { name: "Talener", city: "Boston", miles: 35, phone: "(617) 651-8070", tel: "+16176518070", verifiedPhone: true, domain: "talener.com", site: "talener.com", siteUrl: "https://talener.com", email: "info@talener.com", specialty: "Pure IT/tech (Java, .NET, QA, mobile, AI/ML)", people: [{ n: "Bethany Moulthrop (Tech Recruitment Partner)" }] },
  { name: "Eliassen Group", city: "Reading MA", miles: 22, phone: "(800) 354-2773", tel: "+18003542773", verifiedPhone: false, domain: "eliassen.com", site: "eliassen.com", siteUrl: "https://eliassen.com", form: "https://www.eliassen.com/contact", specialty: "Toll-free · IT staffing & consulting", people: [{ n: "Rebecca Gavel (Lead Recruiter)" }] },
  { name: "Planet Technology", city: "Bedford MA", miles: 30, phone: "(888) 845-2539", tel: "+18888452539", verifiedPhone: false, domain: "theplanetgroup.com", site: "theplanetgroup.com", siteUrl: "https://theplanetgroup.com", form: "https://www.theplanetgroup.com/contact-us", specialty: "Toll-free · dedicated tech staffing", people: [{ n: "Sean Dowling (Sr VP Tech Recruiting)", li: "sdowling" }] },
  { name: "Beacon Hill Technologies", city: "Boston", miles: 35, phone: "(617) 326-4000", tel: "+16173264000", verifiedPhone: true, domain: "bhsg.com", site: "bhsg.com", siteUrl: "https://bhsg.com", form: "https://bhsg.com/contact-us/", specialty: "Tech division (Agile, apps, infosec, infra)", people: [{ n: "James Nguyen (Sr)" }, { n: "Ryan Lang", li: "ryan-lang-967a22236" }, { n: "Michaella Walsh", li: "michaellawalsh" }, { n: "Summer Reigles", li: "summer-reigles" }] },
  { name: "Sullivan & Cogliano", city: "Waltham MA", miles: 33, phone: "(781) 890-7890", tel: "+17818907890", verifiedPhone: true, domain: "sullivancogliano.com", site: "sullivancogliano.com", siteUrl: "https://sullivancogliano.com", email: "jobs@sullivancogliano.com", specialty: "IT staffing (software/hardware/network eng)" },
  { name: "INSPYR Solutions", city: "Boston", miles: 35, phone: "(617) 412-4300", tel: "+16174124300", verifiedPhone: true, domain: "inspyrsolutions.com", site: "inspyrsolutions.com", siteUrl: "https://inspyrsolutions.com", form: "https://www.inspyrsolutions.com/contact-us/", specialty: "Pure-play IT staffing (formerly Advantis)" },
  { name: "The Judge Group", city: "Waltham MA", miles: 33, phone: "(781) 966-3600", tel: "+17819663600", verifiedPhone: true, domain: "judge.com", site: "judge.com", siteUrl: "https://judge.com", email: "info@judge.com", specialty: "IT staffing + tech consulting" },
];

const NATIONAL: Firm[] = [
  { name: "TEKsystems", city: "Boston", miles: 35, phone: "(617) 449-3000", tel: "+16174493000", verifiedPhone: true, domain: "teksystems.com", site: "teksystems.com", siteUrl: "https://www.teksystems.com", form: "https://www.teksystems.com", specialty: "Pure IT staffing · no applicant email, use careers site", people: [{ n: "Richika Kaushik (Sr Tech TA)" }, { n: "George Sommerville" }] },
  { name: "Robert Half Technology", city: "Boston", miles: 35, phone: "(617) 843-2915", tel: "+16178432915", verifiedPhone: true, domain: "roberthalf.com", site: "roberthalf.com", siteUrl: "https://www.roberthalf.com", form: "https://www.roberthalf.com", specialty: "Tech practice · use their portal", people: [{ n: "Andrew Hall (Lead Recruiter, RH Tech)" }] },
  { name: "Randstad Technologies", city: "Boston", miles: 35, phone: "(617) 864-1871", tel: "+16178641871", verifiedPhone: true, domain: "randstadusa.com", site: "randstaddigital.com", siteUrl: "https://www.randstaddigital.com", form: "https://www.randstadusa.com/contact/", specialty: "Tech/digital · Woburn eng (781) 938-1910" },
  { name: "Kforce", city: "Boston", miles: 35, phone: "(877) 453-6723", tel: "+18774536723", verifiedPhone: false, domain: "kforce.com", site: "kforce.com", siteUrl: "https://www.kforce.com", form: "https://www.kforce.com/contact-us/", specialty: "Toll-free · Technology + Finance practices" },
];

const LI = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21H20v-5.5c0-1.3-.02-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9V21H12z" /></svg>
);

function distBadge(m: number) {
  const cls = m <= 15 ? "text-emerald-700 bg-emerald-100" : m <= 35 ? "text-blue-700 bg-blue-100" : "text-gray-500 bg-gray-100";
  const tag = m <= 15 ? "near" : m <= 35 ? "commutable" : "far";
  return <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${cls}`} title={`${tag} - approx driving miles from Pelham NH`}>~{m} mi</span>;
}

function PersonRow({ p, domain }: { p: Person; domain: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap py-0.5">
      <span className="text-[12.5px] text-gray-700">👤 {p.n}</span>
      {p.li ? <a href={`https://www.linkedin.com/in/${p.li}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-[#0a66c2] no-underline" title="LinkedIn">{LI}</a> : (
        <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${p.n.split("(")[0].trim()} ${domain.split(".")[0]}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-[#0a66c2]/70 no-underline" title="Find on LinkedIn">{LI}</a>
      )}
      {p.em ? <a href={`mailto:${p.em}`} className="text-[12px] text-indigo-600 no-underline">{p.em}</a> : null}
    </div>
  );
}

function Card({ f, accent, flags }: { f: Firm; accent: string; flags: string[] }) {
  const logo = getLogo(f.domain);
  return (
    <div className={`bg-white border rounded-2xl px-4 py-3.5 mb-2.5 shadow-sm ${f.star ? "border-teal-300 ring-1 ring-teal-200" : "border-gray-200"}`}>
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          {logo
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={logo} alt="" width={26} height={26} className="w-[26px] h-[26px] rounded-[6px] object-contain bg-white border border-gray-100 shrink-0" />
            : <span className="w-[26px] h-[26px] rounded-[6px] bg-gray-100 text-gray-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">{f.name.slice(0, 1)}</span>}
          <div className="min-w-0">
            <div className="font-bold text-[15px] text-[#1f2328] leading-tight">{f.name} {f.star ? <span title="Strongest local lead">⭐</span> : null}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-[11px] font-bold rounded px-1.5 py-0.5 ${accent}`}>{f.city}</span>
              {distBadge(f.miles)}
            </div>
          </div>
        </div>
        <a href={`tel:${f.tel}`} className={`font-bold text-[15px] no-underline shrink-0 ${f.verifiedPhone ? "text-green-700" : "text-amber-600"}`}>📞 {f.phone}</a>
      </div>
      <div className="text-[13px] text-gray-500 mt-2">{f.specialty} · <a href={f.siteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 no-underline">{f.site}</a></div>
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        {f.email ? <a href={`mailto:${f.email}`} className="text-[13px] font-bold text-indigo-600 no-underline inline-flex items-center gap-1">✉️ {f.email}</a>
          : f.form ? <a href={f.form} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-gray-500 no-underline inline-flex items-center gap-1">📝 contact form (no public email)</a> : null}
      </div>
      {f.people?.length ? <div className="mt-2 bg-slate-50 rounded-lg px-2.5 py-1.5">{f.people.map((p, i) => <PersonRow key={i} p={p} domain={f.domain} />)}</div> : null}
      <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex justify-end">
        <RecruiterStatus firm={firmKey(f)} initial={flags} />
      </div>
    </div>
  );
}

// A region rendered as a board-style panel: gradient header (icon + title + count) over a card list.
function Section({ icon, title, grad, firms, accent, fmap }: { icon: string; title: string; grad: string; firms: Firm[]; accent: string; fmap: Record<string, string[]> }) {
  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className={`bg-gradient-to-r ${grad} px-4 py-2.5 flex items-center gap-2`}>
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-bold tracking-wide text-white">{title}</h3>
        <span className="text-xs font-bold rounded-full px-2.5 py-0.5 bg-white/30 text-white">{firms.length}</span>
      </div>
      <div className="p-3 sm:p-4">
        {firms.map((f) => <Card key={f.name + f.city} f={f} accent={accent} flags={fmap[firmKey(f)] || []} />)}
      </div>
    </div>
  );
}

function Tile({ n, label, grad }: { n: number; label: string; grad: string }) {
  return (
    <div className={`flex-1 min-w-0 sm:min-w-[88px] rounded-[10px] px-2 py-1.5 sm:px-4 sm:py-3 text-white shadow-sm bg-gradient-to-r ${grad} flex items-center justify-between gap-2`}>
      <div className="min-w-0">
        <div className="text-[17px] sm:text-[26px] font-bold leading-none">{n}</div>
        <div className="text-[9px] sm:text-xs text-white/85 mt-0.5 truncate">{label}</div>
      </div>
    </div>
  );
}

export default function RecruitersPage() {
  const fmap = flagsMap();
  const all = [...NH, ...BOUTIQUE, ...NATIONAL];
  const has = (flag: string) => all.filter((f) => (fmap[firmKey(f)] || []).includes(flag)).length;
  return (
    <div className="min-h-screen bg-[#f6f8fa]">
      <div className="max-w-[900px] mx-auto px-4 sm:px-5 py-4 sm:py-7 pb-16">
        <div className="mb-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="AI-Jobs" width={52} height={52} className="block w-11 h-11 sm:w-[52px] sm:h-[52px] rounded-[12px] shadow-sm shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1f2328] mb-0.5 whitespace-nowrap">AI-Jobs</h1>
            <div className="text-[12px] sm:text-[13px] text-gray-500">{all.length} recruiters &middot; NH + Boston &middot; zero-token</div>
          </div>
        </div>

        <ViewTabs />

        <div className="flex flex-nowrap sm:flex-wrap gap-1.5 sm:gap-2 mb-2">
          <Tile n={all.length} label="Firms" grad="from-gray-700 to-gray-900" />
          <Tile n={NH.length} label="Southern NH" grad="from-teal-500 to-emerald-600" />
          <Tile n={BOUTIQUE.length + NATIONAL.length} label="Boston" grad="from-blue-600 to-indigo-700" />
          <Tile n={has("called")} label="Called" grad="from-emerald-500 to-green-600" />
          <Tile n={has("emailed")} label="Emailed" grad="from-indigo-500 to-violet-600" />
          <Tile n={has("replied")} label="Replied" grad="from-fuchsia-500 to-pink-600" />
        </div>

        <div className="text-[12px] text-gray-500 leading-relaxed mb-1 px-1">
          Tap 📞 to call, ✉️ to email, <span className="inline-block align-middle text-[#0a66c2]">{LI}</span> for LinkedIn, then check off <b>Called</b>/<b>Emailed</b>. <b className="text-green-700">Green phone</b> = verified · <b className="text-amber-600">amber</b> = toll-free · <b className="text-emerald-700">~mi</b> = driving distance from Pelham. Nothing was guessed - form-only firms show a form link.
        </div>

        <Section icon="🏠" title="Southern NH - closest to home" grad="from-teal-500 to-emerald-600" firms={NH} accent="text-teal-700 bg-teal-100" fmap={fmap} />
        <Section icon="🏙️" title="Greater Boston - tech boutiques" grad="from-blue-600 to-indigo-700" firms={BOUTIQUE} accent="text-blue-700 bg-blue-100" fmap={fmap} />
        <Section icon="🏢" title="Greater Boston - national tech firms" grad="from-sky-500 to-blue-600" firms={NATIONAL} accent="text-blue-700 bg-blue-100" fmap={fmap} />

        <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3.5">
          <div className="font-bold text-[14px] text-indigo-800 mb-1.5">📧 Email to send before you call</div>
          <div className="text-[13px] text-indigo-900 leading-relaxed"><b>Subject:</b> Senior full-stack engineer (NH/Boston) - open to new roles<br /><br />
            Hi [name/team],<br /><br />
            I&apos;m Bunlong Heng, a senior full-stack engineer based in New Hampshire with about 12 years in TypeScript, React, and Node. I&apos;m looking for my next role - open to remote or hybrid around the Boston/NH area.<br /><br />
            I&apos;d love to know if you place software engineers and whether you have anything open that might be a fit. My resume is attached, and my work is at bunlongheng.com and github.com/bunlongheng.<br /><br />
            Happy to hop on a quick call whenever works - thanks for your time.<br /><br />
            With great excitement,<br />
            Bunlong Heng · bheng.code@gmail.com · 978-677-0861
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-indigo-200 bg-white px-4 py-3.5">
          <div className="font-bold text-[14px] text-indigo-800 mb-1.5">📞 Your phone opener</div>
          <div className="text-[13px] text-gray-700 leading-relaxed">&quot;Hi, my name&apos;s Bunlong Heng. I&apos;m a senior full-stack engineer up in New Hampshire, looking for my next role - open to remote or hybrid around Boston, about 12 years in TypeScript, React, and Node. I wanted to see if you place software engineers, and whether you&apos;ve got anything that might be a fit. Would it be alright to send you my resume?&quot;</div>
        </div>

        <div className="text-center text-[11px] text-gray-400 mt-5">Distances are approximate driving miles from Pelham NH. Every phone/email was seen on the firm&apos;s own page or a directory - none pattern-guessed. Confirm named recruiters still cover your market.</div>
      </div>
    </div>
  );
}
