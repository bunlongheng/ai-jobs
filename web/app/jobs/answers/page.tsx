import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import Link from "next/link";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// This page is the owner's mirror of everything the job engine knows about him: the full
// profile.json (identity, apply answers, targets, stack, certs, highlights, EEO, sources,
// scoring, exclusions, education) rendered as plain left/right paper tables so he can spot
// anything wrong and tell me to correct it - PLUS the canonical essay answer bank below.
// Deliberately plain: no bold, no oversized headings, just a long readable sheet. (owner
// request 2026-08-05)
function readUp(file: string): string {
  for (const p of [path.join(process.cwd(), "..", file), path.join(process.cwd(), file)]) {
    try { return fs.readFileSync(p, "utf8"); } catch { /* try next */ }
  }
  return "";
}

const label = (k: string) => k.replace(/_/g, " ").replace(/\b\w/, (c) => c.toUpperCase());

// Flatten any value into printable [label, text] rows. Nested objects prefix with " > ";
// scalar arrays join with commas; arrays of objects nest by index.
function flatten(obj: Record<string, unknown>, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("_")) continue;
    const key = prefix ? `${prefix} > ${label(k)}` : label(k);
    if (v === null || v === undefined || v === "") out.push([key, "-"]);
    else if (Array.isArray(v)) {
      if (v.every((x) => typeof x !== "object")) out.push([key, v.join(", ")]);
      else v.forEach((x, i) => out.push(...flatten(x as Record<string, unknown>, `${key} ${i + 1}`)));
    } else if (typeof v === "object") out.push(...flatten(v as Record<string, unknown>, key));
    else out.push([key, String(v)]);
  }
  return out;
}

function Table({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <section className="mb-6">
      <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1.5">{title}</div>
      <table className="w-full text-[13px] border-collapse">
        <tbody>
          {flatten(data).map(([k, v], i) => (
            <tr key={i} className="border-t border-gray-100 align-top">
              <td className="py-1.5 pr-4 text-gray-500 w-[36%] font-normal">{k}</td>
              <td className="py-1.5 text-[#1f2328] whitespace-pre-wrap break-words font-normal">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function List({ title, items }: { title: string; items: unknown[] }) {
  return (
    <section className="mb-6">
      <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1.5">{title}</div>
      <ul className="text-[13px] text-[#1f2328] leading-relaxed list-disc pl-5 space-y-0.5">
        {items.map((it, i) => <li key={i} className="font-normal">{String(it)}</li>)}
      </ul>
    </section>
  );
}

export default function Answers() {
  const raw = readUp("profile.json");
  let p: Record<string, unknown> = {};
  try { p = raw ? JSON.parse(raw) : {}; } catch { p = {}; }
  const md = readUp("answer-bank.md");
  const html = md ? DOMPurify.sanitize(marked.parse(md) as string) : "";
  const obj = (k: string) => (p[k] && typeof p[k] === "object" && !Array.isArray(p[k]) ? (p[k] as Record<string, unknown>) : {});
  const arr = (k: string) => (Array.isArray(p[k]) ? (p[k] as unknown[]) : []);

  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]">
      {/* Scope: make the answer-bank markdown read at the SAME size/weight as the profile
          tables above it, so the page is one consistent document (not two). Kit pages that
          also use .prose-kit are untouched. (owner request 2026-08-05) */}
      <style>{`
        .answers-doc, .answers-doc p, .answers-doc li, .answers-doc td, .answers-doc th { font-size:13px !important; }
        .answers-doc h1, .answers-doc h2, .answers-doc h3 { font-size:13px !important; font-weight:600 !important; margin:14px 0 4px !important; }
      `}</style>
      <div className="max-w-[820px] mx-auto px-5 py-7 pb-16">
        <Link href="/jobs" className="text-xs text-blue-700 no-underline">&larr; board</Link>
        <h1 className="text-[16px] font-medium text-gray-800 mt-2 mb-0.5">What we know about you</h1>
        <p className="text-[12px] text-gray-500 mb-5">Everything on file for the job engine - review it and tell me what to correct. Last updated {String(p.updated ?? "-")}.</p>

        <div className="bg-white border border-gray-200 rounded-xl px-6 py-5">
          <Table title="Identity" data={obj("identity")} />
          <Table title="Application answers" data={obj("apply_answers")} />
          <Table title="Targets" data={obj("targets")} />
          <List title="Must haves" items={arr("must_haves")} />
          <List title="Deal breakers" items={arr("deal_breakers")} />
          <Table title="Stack" data={obj("stack")} />
          <List title="Certifications" items={arr("certs")} />
          <List title="Highlights" items={arr("highlights")} />
          <Table title="Education" data={obj("education")} />
          <Table title="Scoring" data={obj("scoring")} />
          <List title="Tech excluded" items={arr("tech_exclude")} />
          <List title="Employment excluded" items={arr("employment_exclude")} />
          <Table title="Sources" data={obj("sources")} />
        </div>

        <h2 className="text-[16px] font-medium text-gray-800 mt-8 mb-0.5">Screening answers</h2>
        <p className="text-[12px] text-gray-500 mb-4">Canonical essay bank - paste-ready responses to recurring one-off questions.</p>
        {html
          ? <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 prose-kit answers-doc text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
          : <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500 text-sm">answer-bank.md not found next to the app.</div>}
      </div>
    </main>
  );
}
