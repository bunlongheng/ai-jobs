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

// Small line icons (no emoji) - keyed paths so tiles, panels, and cards share one clean set.
const P: Record<string, string> = {
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  home: "M3 10.5 12 3l9 7.5M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9",
  city: "M3 21h18M9 21V8l-4 2.5V21M15 21V4L9 5.5M15 21h4V10l-4-2.5",
  building: "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 7h.01M14 7h.01M9 11h.01M14 11h.01M9 15h.01M14 15h.01M9 21v-4h6v4",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 6L2 7",
  check: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  form: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4",
};
function Ic({ k, s = 14, cls = "" }: { k: string; s?: number; cls?: string }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden><path d={P[k]} /></svg>;
}

// Recruiter/staffing call + email sheet - real, source-verified firms in Southern NH + Greater
// Boston that place software engineers. Phones/emails were seen on the firm's own page; toll-free
// lines and form-only firms are flagged; nothing is pattern-guessed. Distances are approximate
// driving miles from Pelham NH (home). (owner request 2026-08-09)
type Person = { n: string; li?: string; em?: string };
type Firm = {
  name: string; city: string; miles: number; phone?: string; tel?: string; verifiedPhone?: boolean;
  domain: string; site: string; siteUrl: string;
  email?: string; form?: string; apply?: string; specialty: string; people?: Person[]; star?: boolean;
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

// Remote work = distance is irrelevant, so miles: -1 renders a "remote" badge. Many are platforms
// you sign up on rather than call, so they carry an `apply` link instead of a phone. (owner 2026-08-09)
const US: Firm[] = [
  { name: "CyberCoders", city: "Irvine CA", miles: -1, phone: "(949) 333-3380", tel: "+19493333380", verifiedPhone: true, domain: "cybercoders.com", site: "cybercoders.com", siteUrl: "https://www.cybercoders.com", form: "https://www.cybercoders.com/contactus/", specialty: "National tech recruiter, remote + onsite SWE" },
  { name: "Genesis10", city: "New York NY", miles: -1, phone: "(212) 688-5522", tel: "+12126885522", verifiedPhone: true, domain: "genesis10.com", site: "genesis10.com", siteUrl: "https://www.genesis10.com", email: "Contactus@genesis10.com", specialty: "Contract/direct-hire incl. remote SWE" },
  { name: "Collabera", city: "Basking Ridge NJ", miles: -1, phone: "(877) 264-6424", tel: "+18772646424", verifiedPhone: true, domain: "collabera.com", site: "collabera.com", siteUrl: "https://www.collabera.com", email: "info@collabera.com", specialty: "Contract/direct-hire SWE, remote, 60+ offices" },
  { name: "Toptal", city: "Remote (US)", miles: -1, phone: "(888) 867-7001", tel: "+18888677001", verifiedPhone: true, domain: "toptal.com", site: "toptal.com", siteUrl: "https://www.toptal.com", email: "support@toptal.com", apply: "https://www.toptal.com/talent/apply", specialty: "Top-3% senior devs, fully remote" },
  { name: "Jobot", city: "Newport Beach CA", miles: -1, domain: "jobot.com", site: "jobot.com", siteUrl: "https://jobot.com", email: "feedback@jobot.com", specialty: "AI recruiter, nationwide remote SWE roles" },
  { name: "Mondo", city: "Philadelphia PA", miles: -1, domain: "mondo.com", site: "mondo.com", siteUrl: "https://mondo.com", form: "https://mondo.com/contact/", specialty: "National IT/tech staffing, remote listings" },
];

const GLOBAL: Firm[] = [
  { name: "Trust in SODA", city: "London / Boston", miles: -1, phone: "+44 203 762 2010", tel: "+442037622010", verifiedPhone: true, domain: "trustinsoda.com", site: "trustinsoda.com", siteUrl: "https://www.trustinsoda.com", email: "info@trustinsoda.com", specialty: "SWE / DevOps / Cloud recruiting, multi-region" },
  { name: "Gun.io", city: "Nashville TN", miles: -1, phone: "(615) 541-8095", tel: "+16155418095", verifiedPhone: true, domain: "gun.io", site: "gun.io", siteUrl: "https://gun.io", apply: "https://gun.io/find-work/", specialty: "Elite freelance / senior SWE at vetted SaaS clients" },
  { name: "Turing", city: "Global remote", miles: -1, domain: "turing.com", site: "turing.com", siteUrl: "https://www.turing.com", apply: "https://developers.turing.com/signup", specialty: "Vetted remote React/Node devs to US companies" },
  { name: "Arc.dev", city: "Global remote", miles: -1, domain: "arc.dev", site: "arc.dev", siteUrl: "https://arc.dev", apply: "https://arc.dev/talent", specialty: "Remote dev platform, skill + English vetting" },
  { name: "Lemon.io", city: "Global remote", miles: -1, domain: "lemon.io", site: "lemon.io", siteUrl: "https://lemon.io", apply: "https://lemon.io/for-developers/", specialty: "Curated senior dev marketplace for startups" },
  { name: "Revelo", city: "LatAm / remote", miles: -1, domain: "revelo.com", site: "revelo.com", siteUrl: "https://www.revelo.com", apply: "https://careers.revelo.com/", specialty: "Nearshore full-stack TS / React / Node" },
  { name: "Braintrust", city: "Global remote", miles: -1, domain: "usebraintrust.com", site: "usebraintrust.com", siteUrl: "https://www.usebraintrust.com", apply: "https://www.usebraintrust.com/join", specialty: "AI-matched remote engineering marketplace" },
  { name: "Andela", city: "Global remote", miles: -1, domain: "andela.com", site: "andela.com", siteUrl: "https://andela.com", apply: "https://www.andela.com/for-talent", specialty: "Global engineering marketplace, 135+ countries" },
  { name: "X-Team", city: "Global remote", miles: -1, domain: "x-team.com", site: "x-team.com", siteUrl: "https://x-team.com", apply: "https://x-team.com/careers", specialty: "Long-term remote teams for senior devs" },
];

const LI = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21H20v-5.5c0-1.3-.02-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9V21H12z" /></svg>
);

function distBadge(m: number) {
  if (m < 0) return <span className="text-[11px] font-bold rounded-full px-2 py-0.5 text-violet-700 bg-violet-100" title="Remote / nationwide - work from home">remote</span>;
  const cls = m <= 15 ? "text-emerald-700 bg-emerald-100" : m <= 35 ? "text-blue-700 bg-blue-100" : "text-gray-500 bg-gray-100";
  const tag = m <= 15 ? "near" : m <= 35 ? "commutable" : "far";
  return <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${cls}`} title={`${tag} - approx driving miles from Pelham NH`}>~{m} mi</span>;
}

function PersonRow({ p, domain }: { p: Person; domain: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap py-0.5">
      <span className="text-[12.5px] text-gray-700 inline-flex items-center gap-1"><Ic k="user" s={12} cls="text-gray-400" />{p.n}</span>
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
        {f.tel ? <a href={`tel:${f.tel}`} className={`font-bold text-[15px] no-underline shrink-0 inline-flex items-center gap-1 ${f.verifiedPhone ? "text-green-700" : "text-amber-600"}`}><Ic k="phone" s={13} />{f.phone}</a> : null}
      </div>
      <div className="text-[13px] text-gray-500 mt-2">{f.specialty} · <a href={f.siteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 no-underline">{f.site}</a></div>
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        {f.email ? <a href={`mailto:${f.email}`} className="text-[13px] font-bold text-indigo-600 no-underline inline-flex items-center gap-1"><Ic k="mail" s={13} />{f.email}</a>
          : f.form ? <a href={f.form} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-gray-500 no-underline inline-flex items-center gap-1"><Ic k="form" s={13} />contact form (no public email)</a> : null}
        {f.apply ? <a href={f.apply} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-violet-600 no-underline inline-flex items-center gap-1"><Ic k="check" s={13} />Apply / sign up</a> : null}
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
        <span className="text-white shrink-0"><Ic k={icon} s={16} /></span>
        <h3 className="text-sm font-bold tracking-wide text-white">{title}</h3>
        <span className="text-xs font-bold rounded-full px-2.5 py-0.5 bg-white/30 text-white">{firms.length}</span>
      </div>
      <div className="p-3 sm:p-4">
        {firms.map((f) => <Card key={f.name + f.city} f={f} accent={accent} flags={fmap[firmKey(f)] || []} />)}
      </div>
    </div>
  );
}

function Tile({ n, label, grad, icon }: { n: number; label: string; grad: string; icon: string }) {
  return (
    <div className={`flex-1 min-w-0 sm:min-w-[88px] rounded-[10px] px-2 py-1.5 sm:px-4 sm:py-3 text-white shadow-sm bg-gradient-to-r ${grad} flex items-start justify-between gap-2`}>
      <div className="min-w-0">
        <div className="text-[17px] sm:text-[26px] font-bold leading-none">{n}</div>
        <div className="text-[9px] sm:text-xs text-white/85 mt-0.5 truncate">{label}</div>
      </div>
      <span className="text-white/45 shrink-0"><Ic k={icon} s={16} /></span>
    </div>
  );
}

export default function RecruitersPage() {
  const fmap = flagsMap();
  const all = [...NH, ...BOUTIQUE, ...NATIONAL, ...US, ...GLOBAL];
  const has = (flag: string) => all.filter((f) => (fmap[firmKey(f)] || []).includes(flag)).length;
  return (
    <div className="min-h-screen bg-[#f6f8fa]">
      <div className="max-w-[900px] mx-auto px-4 sm:px-5 py-4 sm:py-7 pb-16">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="AI-Jobs" width={52} height={52} className="block w-11 h-11 sm:w-[52px] sm:h-[52px] rounded-[12px] shadow-sm shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1f2328] mb-0.5 whitespace-nowrap">AI-Jobs</h1>
              <div className="text-[12px] sm:text-[13px] text-gray-500">{all.length} recruiters &middot; NH &middot; Boston &middot; US &middot; global</div>
            </div>
          </div>
          <ViewTabs />
        </div>

        <div className="flex flex-nowrap sm:flex-wrap gap-1.5 sm:gap-2 mb-2">
          <Tile n={all.length} label="Firms" grad="from-gray-700 to-gray-900" icon="users" />
          <Tile n={has("called")} label="Called" grad="from-emerald-500 to-green-600" icon="phone" />
          <Tile n={has("emailed")} label="Emailed" grad="from-indigo-500 to-violet-600" icon="mail" />
          <Tile n={has("replied")} label="Replied" grad="from-fuchsia-500 to-pink-600" icon="check" />
        </div>

        <div className="text-[12px] text-gray-500 leading-relaxed mb-1 px-1">
          Tap a number to call, an address to email, the <span className="inline-block align-middle text-[#0a66c2]">{LI}</span> icon for LinkedIn, then check off <b>Called</b>/<b>Emailed</b>. <b className="text-green-700">Green phone</b> = verified · <b className="text-amber-600">amber</b> = toll-free · <b className="text-emerald-700">~mi</b> = driving distance from Pelham. Nothing was guessed - form-only firms show a form link.
        </div>

        <Section icon="home" title="Southern NH - closest to home" grad="from-teal-500 to-emerald-600" firms={NH} accent="text-teal-700 bg-teal-100" fmap={fmap} />
        <Section icon="city" title="Greater Boston - tech boutiques" grad="from-blue-600 to-indigo-700" firms={BOUTIQUE} accent="text-blue-700 bg-blue-100" fmap={fmap} />
        <Section icon="building" title="Greater Boston - national tech firms" grad="from-sky-500 to-blue-600" firms={NATIONAL} accent="text-blue-700 bg-blue-100" fmap={fmap} />
        <Section icon="users" title="US - nationwide & remote-friendly" grad="from-violet-600 to-purple-700" firms={US} accent="text-violet-700 bg-violet-100" fmap={fmap} />
        <Section icon="building" title="Global - remote dev platforms (for your field)" grad="from-fuchsia-600 to-pink-600" firms={GLOBAL} accent="text-fuchsia-700 bg-fuchsia-100" fmap={fmap} />

        <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3.5">
          <div className="font-bold text-[14px] text-indigo-800 mb-1.5 inline-flex items-center gap-1.5"><Ic k="mail" s={15} />Email to send before you call</div>
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
          <div className="font-bold text-[14px] text-indigo-800 mb-1.5 inline-flex items-center gap-1.5"><Ic k="phone" s={15} />Your phone opener</div>
          <div className="text-[13px] text-gray-700 leading-relaxed">&quot;Hi, my name&apos;s Bunlong Heng. I&apos;m a senior full-stack engineer up in New Hampshire, looking for my next role - open to remote or hybrid around Boston, about 12 years in TypeScript, React, and Node. I wanted to see if you place software engineers, and whether you&apos;ve got anything that might be a fit. Would it be alright to send you my resume?&quot;</div>
        </div>

        <div className="text-center text-[11px] text-gray-400 mt-5">Distances are approximate driving miles from Pelham NH. Every phone/email was seen on the firm&apos;s own page or a directory - none pattern-guessed. Confirm named recruiters still cover your market.</div>
      </div>
    </div>
  );
}
