import Link from "next/link";

export const dynamic = "force-static";

// Recruiter/staffing call sheet - real, source-verified firms in Southern NH + Greater Boston that
// place software engineers. Every phone was seen on the firm's own page or a directory; toll-free /
// national lines are flagged so you ask for the local tech desk. Named recruiters are public
// LinkedIn/site leads - confirm they still cover the market. (owner request 2026-08-09)
type Firm = {
  name: string; city: string; phone: string; tel: string; verified: boolean;
  site: string; siteUrl: string; specialty: string; recruiters?: string; star?: boolean;
};

const NH: Firm[] = [
  { name: "Techneeds", city: "Salem NH", phone: "(603) 898-3000", tel: "+16038983000", verified: true, site: "techneeds.com", siteUrl: "https://www.techneeds.com", specialty: "Tech, engineering & manufacturing" },
  { name: "Alexander Technology Group", city: "Bedford NH", phone: "(603) 637-1466", tel: "+16036371466", verified: true, site: "alexandertg.com", siteUrl: "https://www.alexandertg.com", specialty: "Pure IT / software staffing", recruiters: "John Whelan (runs NH office) jwhelan@alexandertg.com · Paul Silvio (President) psilvio@alexandertg.com", star: true },
  { name: "The DAVIS Companies", city: "Manchester NH", phone: "(603) 891-0111", tel: "+16038910111", verified: true, site: "daviscos.com", siteUrl: "https://www.daviscos.com", specialty: "Technical & IT staffing/recruiting" },
  { name: "Robert Half Technology", city: "Manchester NH", phone: "(603) 932-4231", tel: "+16039324231", verified: true, site: "roberthalf.com", siteUrl: "https://www.roberthalf.com", specialty: "Tech practice (SWE, data, AI) · Nashua office (603) 932-4842" },
  { name: "Market Street Talent", city: "Portsmouth NH", phone: "(603) 431-0070", tel: "+16034310070", verified: true, site: "marketstreettalent.com", siteUrl: "https://www.marketstreettalent.com", specialty: "IT-only staffing boutique" },
  { name: "TEKsystems", city: "Portsmouth NH", phone: "(603) 501-4340", tel: "+16035014340", verified: true, site: "teksystems.com", siteUrl: "https://www.teksystems.com", specialty: "National pure-play IT staffing" },
  { name: "PRI Technology", city: "Manchester NH", phone: "(603) 641-2000", tel: "+16036412000", verified: true, site: "pritechnology.com", siteUrl: "https://pritechnology.com", specialty: "IT staffing, Manchester-based" },
  { name: "Seaglass Technology Partners", city: "Portsmouth NH", phone: "(603) 319-8083", tel: "+16033198083", verified: true, site: "seaglassit.com", siteUrl: "https://seaglassit.com", specialty: "Software dev, infrastructure, IT", recruiters: "Ask for Mariam, Katherine, or Michelle" },
  { name: "NESC Staffing", city: "Portsmouth NH", phone: "(603) 431-9740", tel: "+16034319740", verified: true, site: "nesc.com", siteUrl: "https://www.nesc.com", specialty: "Technical & engineering staffing" },
  { name: "HW Staffing (Top Prospect IT)", city: "Nashua NH", phone: "(603) 966-2725", tel: "+16039662725", verified: true, site: "hwstaffing.com", siteUrl: "https://hwstaffing.com", specialty: "Acquired Top Prospect (IT) - ask for the IT desk" },
  { name: "Insight Global", city: "Manchester NH", phone: "(855) 485-8853", tel: "+18554858853", verified: false, site: "insightglobal.com", siteUrl: "https://insightglobal.com", specialty: "Toll-free · 3rd largest US IT staffing", recruiters: "Wes Newcomb - recruiter, Nashua NH" },
];

const BOUTIQUE: Firm[] = [
  { name: "Motion Recruitment", city: "Boston", phone: "(617) 804-0399", tel: "+16178040399", verified: true, site: "motionrecruitment.com", siteUrl: "https://motionrecruitment.com", specialty: "Pure-play tech (software, mobile, data, infra, cyber)", recruiters: "Michael Couhig, Trevor Murdock" },
  { name: "Talener", city: "Boston", phone: "(617) 651-8070", tel: "+16176518070", verified: true, site: "talener.com", siteUrl: "https://talener.com", specialty: "Pure IT/tech (Java, .NET, QA, mobile, AI/ML)", recruiters: "Bethany Moulthrop - Tech Recruitment Partner" },
  { name: "Eliassen Group", city: "Reading MA", phone: "(800) 354-2773", tel: "+18003542773", verified: false, site: "eliassen.com", siteUrl: "https://eliassen.com", specialty: "Toll-free · IT staffing & consulting", recruiters: "Rebecca Gavel - Lead Recruiter" },
  { name: "Planet Technology", city: "Bedford MA", phone: "(888) 845-2539", tel: "+18888452539", verified: false, site: "theplanetgroup.com", siteUrl: "https://theplanetgroup.com", specialty: "Toll-free · dedicated tech staffing", recruiters: "Sean Dowling - Sr VP Technology Recruiting" },
  { name: "Beacon Hill Technologies", city: "Boston", phone: "(617) 326-4000", tel: "+16173264000", verified: true, site: "bhsg.com", siteUrl: "https://bhsg.com", specialty: "Tech division (Agile, apps, infosec, infra)", recruiters: "James Nguyen (Sr), Ryan Lang, Michaella Walsh, Summer Reigles" },
  { name: "Sullivan & Cogliano", city: "Waltham MA", phone: "(781) 890-7890", tel: "+17818907890", verified: true, site: "sullivancogliano.com", siteUrl: "https://sullivancogliano.com", specialty: "IT staffing (software/hardware/network eng)" },
  { name: "INSPYR Solutions", city: "Boston", phone: "(617) 412-4300", tel: "+16174124300", verified: true, site: "inspyrsolutions.com", siteUrl: "https://inspyrsolutions.com", specialty: "Pure-play IT staffing (formerly Advantis)" },
  { name: "The Judge Group", city: "Waltham MA", phone: "(781) 966-3600", tel: "+17819663600", verified: true, site: "judge.com", siteUrl: "https://judge.com", specialty: "IT staffing + tech consulting" },
];

const NATIONAL: Firm[] = [
  { name: "TEKsystems", city: "Boston", phone: "(617) 449-3000", tel: "+16174493000", verified: true, site: "teksystems.com", siteUrl: "https://www.teksystems.com", specialty: "Pure IT staffing/services", recruiters: "Richika Kaushik (Sr Tech TA), George Sommerville" },
  { name: "Robert Half Technology", city: "Boston", phone: "(617) 843-2915", tel: "+16178432915", verified: true, site: "roberthalf.com", siteUrl: "https://www.roberthalf.com", specialty: "Tech practice (SWE, data, AI)", recruiters: "Andrew Hall - Lead Recruiter, RH Technology" },
  { name: "Randstad Technologies", city: "Boston", phone: "(617) 864-1871", tel: "+16178641871", verified: true, site: "randstaddigital.com", siteUrl: "https://www.randstaddigital.com", specialty: "Tech/digital · Woburn eng desk (781) 938-1910" },
  { name: "Kforce", city: "Boston", phone: "(877) 453-6723", tel: "+18774536723", verified: false, site: "kforce.com", siteUrl: "https://www.kforce.com", specialty: "Toll-free · Technology + Finance practices" },
];

function Card({ f, accent }: { f: Firm; accent: string }) {
  return (
    <div className={`bg-white border rounded-2xl px-4 py-3.5 mb-2.5 shadow-sm ${f.star ? "border-teal-300 ring-1 ring-teal-200" : "border-gray-200"}`}>
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <div className="font-bold text-[15px] text-[#1f2328]">
          {f.name}
          <span className={`ml-2 text-[11px] font-bold rounded px-1.5 py-0.5 ${accent}`}>{f.city}</span>
          {f.star ? <span className="ml-1.5 text-[11px]" title="Strongest local lead">⭐</span> : null}
        </div>
        <a href={`tel:${f.tel}`} className={`font-bold text-[15px] no-underline ${f.verified ? "text-green-700" : "text-amber-600"}`}>📞 {f.phone}</a>
      </div>
      <div className="text-[13px] text-gray-500 mt-1.5">{f.specialty} · <a href={f.siteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 no-underline">{f.site}</a></div>
      {f.recruiters ? <div className="text-[12.5px] text-gray-700 mt-2 bg-slate-50 rounded-lg px-2.5 py-1.5">👤 {f.recruiters}</div> : null}
    </div>
  );
}

function Section({ icon, title, color, firms, accent }: { icon: string; title: string; color: string; firms: Firm[]; accent: string }) {
  return (
    <>
      <div className="flex items-center gap-2 mt-7 mb-3">
        <span className="text-lg">{icon}</span>
        <h2 className={`text-[16px] font-extrabold ${color}`}>{title}</h2>
      </div>
      {firms.map((f) => <Card key={f.name + f.city} f={f} accent={accent} />)}
    </>
  );
}

export default function RecruitersPage() {
  return (
    <div className="min-h-screen bg-[#f6f8fa]">
      <div className="max-w-[820px] mx-auto px-4 sm:px-5 py-5 pb-16">
        <Link href="/jobs" className="text-[13px] text-blue-600 no-underline">&larr; Board</Link>

        <div className="mt-3 rounded-2xl p-5 text-white shadow-sm bg-gradient-to-br from-blue-700 to-indigo-700">
          <div className="text-[22px] font-extrabold">Recruiter Call Sheet</div>
          <div className="text-[14px] opacity-90 mt-0.5">Software engineering staffing - Southern NH + Greater Boston</div>
          <div className="text-[12px] opacity-80 mt-2.5 leading-relaxed">
            Tap a phone to dial. <b className="text-emerald-200">Green</b> = number verified on the firm&apos;s own page. <b className="text-amber-200">Amber</b> = toll-free / national line (ask for the local tech desk). Recruiter names are public LinkedIn/site leads - ask for them by name, or ask for &quot;the software engineering desk.&quot;
          </div>
        </div>

        <Section icon="🏠" title="Southern NH - call these first (near home)" color="text-teal-700" firms={NH} accent="text-teal-700 bg-teal-100" />
        <Section icon="🏙️" title="Greater Boston - tech boutiques" color="text-blue-700" firms={BOUTIQUE} accent="text-blue-700 bg-blue-100" />
        <Section icon="🏢" title="Greater Boston - national tech firms (local office)" color="text-blue-700" firms={NATIONAL} accent="text-blue-700 bg-blue-100" />

        <div className="mt-6 rounded-2xl border border-amber-200 bg-white px-4 py-3.5 shadow-sm">
          <div className="font-bold text-[14px] mb-1">Also worth a call - grab the number off the site (loads via JS/blocked)</div>
          <div className="text-[12.5px] text-gray-600 leading-relaxed">
            <b>Apex Systems</b> (Burlington MA) - apexsystems.com · Alexa Whalen (Infra Recruiter, New England)<br />
            <b>Experis</b> (Wakefield MA) - experis.com · Michael Bleau (Sr Recruiter, Boston)<br />
            <b>Akkodis</b> (Burlington MA) - akkodis.com · IT + engineering<br />
            <b>Dexian</b> (Boston/Woburn) - dexian.com · top-10 US IT staffing<br />
            <b>Aerotek</b> (Boston/Woburn) - aerotek.com · Tom Brennan (Technical Recruiter)
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3.5">
          <div className="font-bold text-[14px] text-indigo-800 mb-1.5">📝 Your 30-second pitch when they pick up</div>
          <div className="text-[13px] text-indigo-900 leading-relaxed">
            &quot;Hi, I&apos;m Bunlong Heng, a staff-level full-stack engineer with 12+ years in TypeScript, React, and Node. I&apos;m based in Pelham NH, open to remote or hybrid in the Boston/NH area, targeting 140K+. I led the Auth0/SAML rollout across every app at Thryv and cut a dashboard&apos;s load time from 5 seconds to half a second. Who on your team handles senior software engineering placements?&quot;
          </div>
        </div>

        <div className="text-center text-[11px] text-gray-400 mt-5">Every number pulled from the firm&apos;s own page or a directory listing. Confirm named recruiters still cover your market.</div>
      </div>
    </div>
  );
}
