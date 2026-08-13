// rejection_sweep.mjs - auto-detect job rejections in Gmail and flip applied -> rejected.
// Runs headless in the 12h cron (linkedin_search.sh). Uses the Gmail REST API with a
// refresh token minted once by gmail_auth.mjs (stored in web/.env.local). NO MCP, no deps
// beyond better-sqlite3 - pure fetch. Auto-flips only CONFIDENT matches (company in the
// email + role/title match, or a single applied role at that company); anything ambiguous
// is written to /tmp/rejection-sweep.log for the owner to review, never guessed.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const ROOT = dirname(fileURLToPath(import.meta.url));
const Database = require(join(ROOT, "web/node_modules/better-sqlite3"));

const ENV_PATH = join(ROOT, "web/.env.local");
const DB_PATH = process.env.JOBS_DB || join(ROOT, "web/jobs.db");
const LOG = "/tmp/rejection-sweep.log";

function readEnv() {
  const out = {};
  try {
    for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {}
  return out;
}

async function accessToken(env) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error("token refresh failed: " + r.status + " " + (await r.text()).slice(0, 200));
  return (await r.json()).access_token;
}

const GAPI = "https://gmail.googleapis.com/gmail/v1/users/me";
const QUERY =
  'newer_than:4d ("won\'t be moving forward" OR "will not be moving" OR "not be moving forward" OR "other candidates" OR "unfortunately" OR "regret to inform" OR "not to move forward" OR "not selected" OR "position has been filled" OR "pursue other" OR "no longer under consideration" OR "decided not to" OR "thanks for your interest" OR "thank you for your interest")';

const REJECT_RE = /(won'?t be moving|will not be moving|not be moving forward|not moving forward|other candidates|unfortunately|regret to inform|not to move forward|not selected|decided not to (?:move|proceed|advance)|position (?:has been|is) filled|will not be progressing|pursue other|no longer under consideration|not be proceeding|decided to move forward with other|move forward with other candidates|not moving forward with your)/i;
// confirmations / "received" emails are NOT rejections
const CONFIRM_RE = /(we'?ll be reviewing|thank you for showing interest|application (?:has been )?received|we have received your|reviewing your application shortly|will reach out to you on any next steps|schedule (?:a|your) interview|would like to (?:schedule|invite|move forward)|next steps|excited to move forward)/i;

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const words = (s) => norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
const STOP = new Set(["the", "and", "for", "senior", "staff", "software", "engineer", "developer", "principal", "lead", "sr", "full", "stack", "fullstack", "role", "position"]);

async function gmailGet(url, token) {
  const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("gmail " + r.status);
  return r.json();
}

async function main() {
  const env = readEnv();
  if (!env.GMAIL_REFRESH_TOKEN || !env.GOOGLE_CLIENT_ID) {
    console.error("rejection_sweep: no GMAIL_REFRESH_TOKEN in .env.local - run: node gmail_auth.mjs (one-time). Skipping.");
    process.exit(0);
  }
  const token = await accessToken(env);
  const list = await gmailGet(`${GAPI}/messages?maxResults=40&q=${encodeURIComponent(QUERY)}`, token);
  const ids = (list.messages || []).map((m) => m.id);

  const db = new Database(DB_PATH);
  const applied = db.prepare("SELECT id, company, title FROM applications WHERE status='applied'").all();
  const upd = db.prepare(
    "UPDATE applications SET status='rejected', rejected_at=date('now','localtime'), notes = COALESCE(notes,'') || ' [auto-rejected via Gmail sweep]', updated_at=datetime('now') WHERE id=?"
  );

  let flipped = 0;
  const review = [];
  const seen = new Set();

  for (const id of ids) {
    const msg = await gmailGet(`${GAPI}/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, token);
    const hdr = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
    const text = `${hdr.subject || ""} ${msg.snippet || ""}`;
    if (!REJECT_RE.test(text) || CONFIRM_RE.test(text)) continue; // not a rejection / is a confirmation

    // candidate applied jobs whose company name appears as a word in the email
    const t = norm(text);
    const cands = applied.filter((a) => a.company && new RegExp(`\\b${norm(a.company).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
    if (!cands.length) { review.push(`NO-MATCH company | ${hdr.subject} | ${(msg.snippet || "").slice(0, 90)}`); continue; }

    // score by role/title token overlap with the email
    const emailWords = new Set(words(text).filter((w) => !STOP.has(w)));
    const scored = cands.map((a) => {
      const tw = words(a.title).filter((w) => !STOP.has(w));
      const overlap = tw.filter((w) => emailWords.has(w)).length;
      return { a, overlap };
    });
    const best = Math.max(...scored.map((s) => s.overlap));

    let toFlip = [];
    if (cands.length === 1) toFlip = [cands[0]];                       // one role at company -> flip
    else if (best >= 1) toFlip = scored.filter((s) => s.overlap === best && best >= 1).map((s) => s.a); // role-matched
    else { review.push(`AMBIGUOUS ${cands[0].company} (${cands.length} roles, no role match) | ${hdr.subject}`); continue; }

    for (const a of toFlip) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      upd.run(a.id);
      flipped++;
      console.log(`rejected: ${a.company} - ${a.title}`);
    }
  }

  const stamp = new Date().toISOString();
  if (review.length) {
    const line = `\n=== ${stamp} needs review (${review.length}) ===\n` + review.join("\n") + "\n";
    try { require("node:fs").appendFileSync(LOG, line); } catch {}
  }
  console.log(`\nrejection sweep: scanned ${ids.length} candidate emails, flipped ${flipped}, ${review.length} for review (${LOG})`);
}

main().catch((e) => { console.error("rejection_sweep error:", e.message); process.exit(0); });
