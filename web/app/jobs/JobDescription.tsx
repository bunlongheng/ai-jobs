import React from "react";

// Turn a scraped plain-text job description (one merged blob) into cleanly structured, readable
// content: section headings, bullet lists, paragraphs, with URLs/emails linkified and `inline
// code` styled. Server component - pure formatting, no state. (owner request 2026-08-11)

const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

// Linkify URLs + emails inside a plain string.
function linkify(text: string, kp: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0, i = 0, m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(
      m[1]
        ? <a key={`${kp}-${i++}`} href={tok} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline break-words">{tok}</a>
        : <a key={`${kp}-${i++}`} href={`mailto:${tok}`} className="text-blue-700 underline">{tok}</a>
    );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Inline: split out `code` spans, linkify the rest.
function renderInline(text: string, kp: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = text.split(/(`[^`]+`)/);
  parts.forEach((part, idx) => {
    if (!part) return;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push(<code key={`${kp}-c${idx}`} className="px-1 py-0.5 rounded bg-gray-100 text-[0.92em] font-mono text-[#1f2328]">{part.slice(1, -1)}</code>);
    } else {
      out.push(...linkify(part, `${kp}-t${idx}`));
    }
  });
  return out;
}

const HEADER_WORDS = /^(about|who we are|what you|responsibilities|requirements|qualifications|benefits|perks|what we|the role|your role|role overview|skills|experience|nice to have|must have|compensation|salary|our stack|tech stack|day to day|how we work|why join|equal opportunity|about the team)\b/i;
const BULLET_RE = /^\s*([-•*·▪◦‣]|\d+[.)])\s+/;

function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 64) return false;
  if (/[.!?,;]$/.test(t)) return false;
  if (t.endsWith(":")) return true;
  if (HEADER_WORDS.test(t)) return true;
  const letters = t.replace(/[^a-zA-Z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase(); // ALL-CAPS line
}

export default function JobDescription({ text }: { text: string }) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  let k = 0;

  const flushPara = () => {
    const joined = para.join(" ").trim();
    if (joined) blocks.push(<p key={`p${k++}`} className="mb-2.5">{renderInline(joined, `p${k}`)}</p>);
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`u${k++}`} className="list-disc pl-5 mb-2.5 space-y-1 marker:text-gray-400">
          {bullets.map((b, i) => <li key={i}>{renderInline(b, `u${k}-${i}`)}</li>)}
        </ul>
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { flushBullets(); flushPara(); continue; }
    if (BULLET_RE.test(line)) { flushPara(); bullets.push(line.replace(BULLET_RE, "")); continue; }
    if (isHeading(line)) {
      flushBullets(); flushPara();
      blocks.push(<div key={`h${k++}`} className="font-semibold text-[#1f2328] mt-4 mb-1.5 first:mt-0">{line.trim().replace(/:$/, "")}</div>);
      continue;
    }
    flushBullets();
    para.push(line.trim());
  }
  flushBullets(); flushPara();

  return <div className="text-[13px] leading-relaxed text-[#1f2328]">{blocks}</div>;
}
