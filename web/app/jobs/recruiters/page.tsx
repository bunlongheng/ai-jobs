import fs from "node:fs";
import path from "node:path";
import { getLogo } from "@/lib/logos";
import { db } from "@/lib/db";
import RecruiterStatus from "../RecruiterStatus";
import RecruiterNote from "../RecruiterNote";
import RecruiterMeeting from "../RecruiterMeeting";
import RecruiterPhone from "../RecruiterPhone";
import ViewTabs from "../ViewTabs";
import Backdrop from "../Backdrop";
import PhonePitch from "../PhonePitch";
import { FocusProvider, FocusCard } from "../CardFocus";

export const dynamic = "force-dynamic"; // reads cached firm logos + outreach status live

// Per-firm outreach state (flags + "spoke to" note), keyed by "name|city". (owner 2026-08-09)
type FirmState = { flags: string[]; note: string; meeting: string; badPhone: boolean };
function flagsMap(): Record<string, FirmState> {
  const d = db(); // recruiter_status is created by lib/schema.sql on db init - no per-request DDL
  const rows = d.prepare("SELECT firm, status, note, meeting_at, bad_phone FROM recruiter_status").all() as { firm: string; status: string; note: string; meeting_at: string; bad_phone: number }[];
  return Object.fromEntries(rows.map((r) => [r.firm, { flags: (r.status || "").split(",").filter(Boolean), note: r.note || "", meeting: r.meeting_at || "", badPhone: !!r.bad_phone }]));
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
  cal: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
};

// Format a stored "YYYY-MM-DDTHH:mm" (local) as "Aug 14, 2:30 PM" - deterministic (no Date/locale),
// so the server-rendered badge never mismatches on hydration.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMeeting(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return v;
  const [, , mo, d, hh, mm] = m;
  let h = parseInt(hh, 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${MONTHS[parseInt(mo, 10) - 1]} ${parseInt(d, 10)}, ${h}:${mm} ${ap}`;
}
function Ic({ k, s = 14, cls = "" }: { k: string; s?: number; cls?: string }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden><path d={P[k]} /></svg>;
}

// Recruiter/staffing call + email sheet - real, source-verified firms in Southern NH + Greater
// Boston that place software engineers. Phones/emails were seen on the firm's own page; toll-free
// lines and form-only firms are flagged; nothing is pattern-guessed. Distances are approximate
// driving miles from your home base. (owner request 2026-08-09)
type Person = { n: string; li?: string; em?: string };
type Firm = {
  name: string; city: string; miles: number; phone?: string; tel?: string; verifiedPhone?: boolean;
  domain: string; site: string; siteUrl: string;
  email?: string; form?: string; apply?: string; specialty: string; people?: Person[]; star?: boolean;
};

// Recruiter data is PII (real names, emails, phones), so it lives OUTSIDE source in a gitignored
// data/recruiters.json - copy data/recruiters.example.json to it and fill your own. Falls back to
// the committed sample so the page renders on a fresh clone. (open-source prep 2026-08-10)
type RecruiterData = { nh: Firm[]; boutique: Firm[]; national: Firm[]; us: Firm[] };
function loadRecruiters(): RecruiterData {
  const dir = path.join(process.cwd(), "data");
  const real = path.join(dir, "recruiters.json");
  const sample = path.join(dir, "recruiters.example.json");
  const file = fs.existsSync(real) ? real : sample;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return { nh: raw.nh || [], boutique: raw.boutique || [], national: raw.national || [], us: raw.us || [] };
}

// Personal bits for this page come from profile.json (gitignored) with the committed example as a
// fallback, so nothing is hardcoded: `pitch` = the call script, `home` = the origin for distances /
// Google Maps directions. (open-source prep 2026-08-10)
function loadProfileBits(): { pitch: string; home: string } {
  for (const p of [path.join(process.cwd(), "..", "profile.json"), path.join(process.cwd(), "..", "profile.example.json")]) {
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      return { pitch: j.pitch || "", home: (j.identity && j.identity.location) || "your home base" };
    } catch { /* try next */ }
  }
  return { pitch: "", home: "your home base" };
}

// Proper LinkedIn brandmark (blue rounded square + white "in") - self-coloured, so it looks clean
// at small sizes instead of the blobby monochrome glyph. (owner request 2026-08-10)
const LI = (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden className="rounded-[3px]"><rect width="24" height="24" rx="4" fill="#0A66C2" /><path fill="#fff" d="M7.2 9.6H4.7V19h2.5V9.6zM5.95 5.2a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9zM19.3 19h-2.5v-4.7c0-1.18-.42-1.98-1.48-1.98-.8 0-1.28.54-1.5 1.06-.07.19-.09.45-.09.71V19h-2.5v-9.4h2.5v1.28c.33-.5.92-1.2 2.24-1.2 1.64 0 2.83 1.07 2.83 3.36V19z" /></svg>
);

// Same pill shape as the city badge (consistency). When it's a real distance, it links to Google
// Maps directions from your home base so a click shows the route/time. (owner request 2026-08-10)
const BADGE = "text-[10px] font-medium rounded-md px-1.5 py-0.5";
function distBadge(m: number, city: string, home: string) {
  if (m < 0) return <span className={`${BADGE} text-violet-700 bg-violet-100`} title="Remote / nationwide - work from home">remote</span>;
  const cls = m <= 15 ? "text-emerald-700 bg-emerald-100" : m <= 35 ? "text-blue-700 bg-blue-100" : "text-gray-500 bg-gray-100";
  const tag = m <= 15 ? "near" : m <= 35 ? "commutable" : "far";
  const maps = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(home)}&destination=${encodeURIComponent(city)}`;
  return <a href={maps} target="_blank" rel="noopener noreferrer" className={`${BADGE} no-underline hover:brightness-95 ${cls}`} title={`${tag} - about ${m} mi from ${home}. Click for Google Maps directions.`}>~{m} mi</a>;
}

// Contacts as a compact aligned mini-table (Name | LinkedIn | Email) - clean to scan when calling.
function PeopleTable({ people, domain }: { people: Person[]; domain: string }) {
  const liLink = (p: Person) => p.li
    ? <a href={`https://www.linkedin.com/in/${p.li}`} target="_blank" rel="noopener noreferrer" className="inline-flex no-underline" title="LinkedIn">{LI}</a>
    : <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${p.n.split("(")[0].trim()} ${domain.split(".")[0]}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex opacity-70 no-underline" title="Find on LinkedIn">{LI}</a>;
  return (
    <div className="mt-2 bg-slate-50 rounded-lg px-2 py-1 overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <tbody>
          {people.map((p, i) => (
            <tr key={i} className="border-t border-slate-200/70 first:border-0">
              <td className="py-1.5 pr-3 text-gray-700 align-middle">{p.n}</td>
              <td className="py-1.5 pr-3 align-middle w-5">{liLink(p)}</td>
              <td className="py-1.5 align-middle text-indigo-600 whitespace-nowrap">{p.em ? <a href={`mailto:${p.em}`} className="no-underline">{p.em}</a> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ f, accent, st, home }: { f: Firm; accent: string; st: FirmState; home: string }) {
  const logo = getLogo(f.domain);
  return (
    <FocusCard id={firmKey(f)}>
    <div className={`bg-white border rounded-2xl px-4 py-3.5 mb-2.5 shadow-sm ${f.star ? "border-teal-300 ring-1 ring-teal-200" : "border-gray-200"}`}>
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          {logo
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={logo} alt="" width={26} height={26} className="w-[26px] h-[26px] rounded-[6px] object-contain bg-white border border-gray-100 shrink-0" />
            : <span className="w-[26px] h-[26px] rounded-[6px] bg-gray-100 text-gray-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">{f.name.slice(0, 1)}</span>}
          <div className="min-w-0">
            <div className="font-bold text-[15px] text-[#1f2328] leading-tight">{f.name} {f.star ? <span title="Strongest local lead">⭐</span> : null}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`${BADGE} ${accent}`}>{f.city}</span>
              {distBadge(f.miles, f.city, home)}
              {st.note.trim() ? <span className={`${BADGE} text-slate-700 bg-slate-100 inline-flex items-center gap-1`} title="Spoke to"><Ic k="user" s={10} />{st.note.trim()}</span> : null}
              {st.meeting ? <span className={`${BADGE} text-rose-700 bg-rose-100 inline-flex items-center gap-1`} title="Next meeting"><Ic k="cal" s={10} />{fmtMeeting(st.meeting)}</span> : null}
              {f.email ? <a href={`mailto:${f.email}`} title="Email" className={`${BADGE} text-indigo-700 bg-indigo-100 no-underline inline-flex items-center gap-1 hover:brightness-95`}><Ic k="mail" s={10} />{f.email}</a>
                : f.form ? <a href={f.form} target="_blank" rel="noopener noreferrer" title="Contact form" className={`${BADGE} text-gray-600 bg-gray-100 no-underline inline-flex items-center gap-1 hover:brightness-95`}><Ic k="form" s={10} />contact form</a> : null}
              {f.apply ? <a href={f.apply} target="_blank" rel="noopener noreferrer" title="Apply" className={`${BADGE} text-violet-700 bg-violet-100 no-underline inline-flex items-center gap-1 hover:brightness-95`}><Ic k="check" s={10} />Apply</a> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {f.tel ? <RecruiterPhone firm={firmKey(f)} phone={f.phone || ""} tel={f.tel} initialBroken={st.badPhone} /> : null}
          <div className="flex items-center gap-1.5 justify-end flex-wrap">
            <RecruiterNote firm={firmKey(f)} initial={st.note} />
            <RecruiterStatus firm={firmKey(f)} initial={st.flags} />
            <RecruiterMeeting firm={firmKey(f)} initial={st.meeting} />
          </div>
        </div>
      </div>
      <div className="text-[13px] text-gray-500 mt-2">{f.specialty} · <a href={f.siteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 no-underline">{f.site}</a></div>
      {f.people?.length ? <PeopleTable people={f.people} domain={f.domain} /> : null}
    </div>
    </FocusCard>
  );
}

// A region rendered as a board-style panel: gradient header (icon + title + count) over a card list.
function Section({ icon, title, grad, firms, accent, fmap, home }: { icon: string; title: string; grad: string; firms: Firm[]; accent: string; fmap: Record<string, FirmState>; home: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className={`bg-gradient-to-r ${grad} px-4 py-2.5 flex items-center gap-2`}>
        <span className="text-white shrink-0"><Ic k={icon} s={16} /></span>
        <h3 className="text-sm font-bold tracking-wide text-white">{title}</h3>
        <span className="text-xs font-bold rounded-full px-2.5 py-0.5 bg-white/30 text-white">{firms.length}</span>
      </div>
      <div className="p-3 sm:p-4">
        {firms.map((f) => <Card key={f.name + f.city} f={f} accent={accent} st={fmap[firmKey(f)] || { flags: [], note: "", meeting: "", badPhone: false }} home={home} />)}
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
  const { nh: NH, boutique: BOUTIQUE, national: NATIONAL, us: US } = loadRecruiters();
  const { pitch, home } = loadProfileBits();
  const all = [...NH, ...BOUTIQUE, ...NATIONAL, ...US];
  const has = (flag: string) => all.filter((f) => (fmap[firmKey(f)]?.flags || []).includes(flag)).length;
  return (
    <FocusProvider>
    <div className="min-h-screen">
      <Backdrop variant="rec" />
      <div className="max-w-[900px] mx-auto px-4 sm:px-5 py-4 sm:py-7 pb-16">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="AI-Jobs" width={52} height={52} className="block w-11 h-11 sm:w-[52px] sm:h-[52px] rounded-[12px] shadow-sm shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1f2328] mb-0.5 whitespace-nowrap">AI-Jobs</h1>
              <div className="text-[12px] sm:text-[13px] text-gray-500">{all.length} recruiters &middot; NH &middot; Boston &middot; US</div>
            </div>
          </div>
          <ViewTabs />
        </div>

        <div className="flex flex-nowrap sm:flex-wrap gap-1.5 sm:gap-2 mb-2">
          <Tile n={all.length} label="Firms" grad="from-gray-700 to-gray-900" icon="users" />
          <Tile n={has("called")} label="Called" grad="from-emerald-500 to-green-600" icon="phone" />
          <Tile n={has("emailed")} label="Emailed" grad="from-indigo-500 to-violet-600" icon="mail" />
        </div>


        <Section icon="home" title="Southern NH - closest to home" grad="from-teal-500 to-emerald-600" firms={NH} accent="text-teal-700 bg-teal-100" fmap={fmap} home={home} />
        <Section icon="city" title="Greater Boston - tech boutiques" grad="from-blue-600 to-indigo-700" firms={BOUTIQUE} accent="text-blue-700 bg-blue-100" fmap={fmap} home={home} />
        <Section icon="building" title="Greater Boston - national tech firms" grad="from-sky-500 to-blue-600" firms={NATIONAL} accent="text-blue-700 bg-blue-100" fmap={fmap} home={home} />
        <Section icon="users" title="US - nationwide & remote-friendly" grad="from-violet-600 to-purple-700" firms={US} accent="text-violet-700 bg-violet-100" fmap={fmap} home={home} />

        <div className="text-center text-[11px] text-gray-400 mt-5">Distances are approximate driving miles from {home}. Every phone/email was seen on the firm&apos;s own page or a directory - none pattern-guessed. Confirm named recruiters still cover your market.</div>
      </div>
      <PhonePitch pitch={pitch} />
    </div>
    </FocusProvider>
  );
}
