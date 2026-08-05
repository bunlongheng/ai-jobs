// auto_email_apply.mjs - autonomously apply to HN "Who is Hiring" jobs by email.
// For every kit_ready HN job with a prepped cover, resolve the real apply email from
// the HN comment, compose the application (cover + links + resume PDF attached), send
// it AS Bunlong (bheng.code@gmail.com) via the Gmail API, and flip the row to applied.
//
// Sends for real ONLY with `--send`. A bare run is a DRY RUN: it resolves recipients
// and prints exactly what it would send, so extraction can be proven before any email
// leaves. Uses the same GMAIL_REFRESH_TOKEN as rejection_sweep.mjs (now minted with the
// gmail.send scope by gmail_auth.mjs). Pure fetch + better-sqlite3, no other deps.
//
// CORRECTNESS RAILS (a bad recipient is worse than not sending):
//   - never invent a recipient: no valid email -> skip + log, never guess
//   - placeholder emails (first.last@, name@, example.com ...) are rejected outright
//   - multiple emails with no clear apply address -> skip + log (never guess)
//   - resume PDF + cover required; idempotent status flip; per-run cap; BCC self
//   - kill switch: JOBS_AUTOSEND_OFF=1 forces dry-run even with --send

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Database = require("/Users/bheng/Sites/jobs/web/node_modules/better-sqlite3");

const ENV_PATH = "/Users/bheng/Sites/jobs/web/.env.local";
const DB_PATH = process.env.JOBS_DB || "/Users/bheng/Sites/jobs/web/jobs.db";
const RESUME_PDF = "/Users/bheng/Sites/jobs/resume-bunlong.pdf";
const LOG = "/tmp/auto-email-apply.log";
const FROM_NAME = "Bunlong Heng";
const FROM_EMAIL = "bheng.code@gmail.com";
const GAPI = "https://gmail.googleapis.com/gmail/v1/users/me";
const ALGOLIA = "https://hn.algolia.com/api/v1";

const SEND = process.argv.includes("--send") && process.env.JOBS_AUTOSEND_OFF !== "1";
const MAX = Number((process.argv.find((a) => a.startsWith("--max=")) || "").split("=")[1]) || 20;

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

// ---------- recipient resolution ----------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// localparts that mean "put your name here", not a real inbox
const PLACEHOLDER_LOCAL =
  /^(first\.?last|firstname\.?lastname|f\.?last|your\.?name|yourname|your\.?email|name|firstname|lastname|first|last|someone|somebody|user|username|email|e-?mail|me|you|hello|hi|test|example|foo|bar|abc|xyz)$/i;
const PLACEHOLDER_DOMAIN =
  /^(example|domain|company|yourcompany|mycompany|email|test|sample|acme|foo|bar|xyz|somewhere|website|placeholder)\.(com|org|io|net|co|dev)$/i;
// file-ext "TLDs" that mean we matched an asset path (logo@2x.png), not an email
const ASSET_TLD = /\.(png|jpe?g|gif|svg|webp|pdf|js|css|html?|json|zip)$/i;
const ROLE_LOCAL = /^(careers?|jobs?|hiring|recruit(ing|er)?|talent|hr|people|work|apply|join|team|staffing)$/i;

function validEmail(e) {
  const [local, domain] = e.split("@");
  if (!local || !domain) return false;
  if (PLACEHOLDER_LOCAL.test(local)) return false;
  if (PLACEHOLDER_DOMAIN.test(domain)) return false;
  if (ASSET_TLD.test(domain)) return false;
  if (!/\.[A-Za-z]{2,}$/.test(domain)) return false;
  return true;
}

const companyTokens = (co) =>
  (co || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w.length >= 3);

// Pick THE apply address, or null when it can't be resolved with confidence.
// text is the raw comment; company is used to prefer a domain-matching address.
function resolveRecipient(text, company) {
  const raw = String(text || "").replace(/\s+/g, " ");
  const all = [...new Set((raw.match(EMAIL_RE) || []).map((e) => e.toLowerCase()))].filter(validEmail);
  if (all.length === 0) return { email: null, why: "no valid email" };
  if (all.length === 1) return { email: all[0], why: "single email" };

  // multiple -> prefer, in order: role inbox, company-domain match, keyword-adjacent.
  const role = all.filter((e) => ROLE_LOCAL.test(e.split("@")[0]));
  if (role.length === 1) return { email: role[0], why: "role inbox" };

  const toks = companyTokens(company);
  const domMatch = all.filter((e) => toks.some((t) => e.split("@")[1].includes(t)));
  if (domMatch.length === 1) return { email: domMatch[0], why: "company-domain match" };
  if (role.length > 1) {
    const roleDom = role.filter((e) => toks.some((t) => e.split("@")[1].includes(t)));
    if (roleDom.length === 1) return { email: roleDom[0], why: "role inbox @ company domain" };
  }

  // an email sitting right after apply/email/contact/resume/send is very likely the one
  const near = raw.match(
    /(?:apply|e-?mail|contact|reach|resume|send|write|get in touch)[^@]{0,40}?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i
  );
  if (near && validEmail(near[1].toLowerCase())) return { email: near[1].toLowerCase(), why: "keyword-adjacent" };

  return { email: null, why: `ambiguous (${all.length} emails, no clear apply address)` };
}

async function hnCommentText(url) {
  const id = (url || "").match(/[?&]id=(\d+)/)?.[1];
  if (!id) return "";
  try {
    const j = await fetch(`${ALGOLIA}/items/${id}`).then((r) => r.json());
    return String(j.text || "")
      .replace(/<a\b[^>]*>(.*?)<\/a>/gis, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x2f;/gi, "/").replace(/&#x27;|&#39;/gi, "'").replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

// ---------- email body ----------
const dedash = (s) => String(s || "").replace(/[–—‑]/g, "-");

function buildBody(coverMd, title) {
  let b = dedash(coverMd || "").trim();
  const i = b.search(/with great excitement|best regard|sincerely/i); // drop any existing sign-off
  if (i >= 0) b = b.slice(0, i).trim();
  return [
    b,
    "",
    "A few links if useful:",
    "Portfolio - https://www.bunlongheng.com",
    "Resume - https://www.bunlongheng.com/resume",
    "GitHub - https://github.com/bunlongheng",
    "LinkedIn - https://www.linkedin.com/in/bunlongheng",
    "",
    "Happy to walk through any of these projects if one catches your eye - just let me know and we can find a time.",
    "",
    "With great excitement,",
    FROM_NAME,
  ].join("\n");
}

function buildRaw({ to, subject, body, pdfB64 }) {
  const nl = "\r\n";
  const boundary = "b_" + Buffer.from(subject).toString("hex").slice(0, 16) + to.length;
  const headers = [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${to}`,
    `Bcc: ${FROM_EMAIL}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join(nl);
  const parts = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64").match(/.{1,76}/g).join(nl),
    "",
    `--${boundary}`,
    'Content-Type: application/pdf; name="Bunlong-Heng-Resume.pdf"',
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="Bunlong-Heng-Resume.pdf"',
    "",
    pdfB64.match(/.{1,76}/g).join(nl),
    "",
    `--${boundary}--`,
  ].join(nl);
  return Buffer.from(headers + nl + nl + parts, "utf8").toString("base64url");
}

async function sendMessage(raw, token) {
  const r = await fetch(`${GAPI}/messages/send`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!r.ok) throw new Error("send failed: " + r.status + " " + (await r.text()).slice(0, 200));
  return (await r.json()).id;
}

function logLine(s) {
  try { require("node:fs").appendFileSync(LOG, s + "\n"); } catch {}
}

async function main() {
  const env = readEnv();
  if (SEND && (!env.GMAIL_REFRESH_TOKEN || !env.GOOGLE_CLIENT_ID)) {
    console.error("auto_email_apply: no GMAIL_REFRESH_TOKEN - run: node gmail_auth.mjs (one-time, needs gmail.send). Skipping.");
    process.exit(0);
  }
  const pdfB64 = readFileSync(RESUME_PDF).toString("base64");
  const db = new Database(DB_PATH);
  const rows = db
    .prepare(
      "SELECT id, company, title, url, cover_md, jd, notes FROM applications " +
        "WHERE status='kit_ready' AND url LIKE '%news.ycombinator.com%' AND cover_md IS NOT NULL " +
        "ORDER BY score DESC"
    )
    .all();
  const cacheJd = db.prepare("UPDATE applications SET jd=? WHERE id=? AND (jd IS NULL OR jd='')");
  const markApplied = db.prepare(
    "UPDATE applications SET status='applied', applied_at=date('now','localtime'), " +
      "notes = COALESCE(notes,'') || ' [auto-emailed to ' || ? || ']', updated_at=datetime('now') WHERE id=?"
  );

  const token = SEND ? await accessToken(env) : null;
  const stamp = new Date().toISOString();
  console.log(`\n=== auto_email_apply ${stamp} | mode=${SEND ? "SEND" : "DRY-RUN"} | candidates=${rows.length} | cap=${MAX} ===`);
  logLine(`\n=== ${stamp} mode=${SEND ? "SEND" : "DRY-RUN"} candidates=${rows.length} ===`);

  let sent = 0, skipped = 0;
  for (const row of rows) {
    if (sent >= MAX) { console.log(`(cap ${MAX} reached, stopping)`); break; }

    // recipient: DB text first, then self-heal from the live HN comment (and cache it)
    let text = `${row.jd || ""} ${row.notes || ""}`;
    let { email, why } = resolveRecipient(text, row.company);
    if (!email) {
      const live = await hnCommentText(row.url);
      if (live) {
        cacheJd.run(live, row.id);
        ({ email, why } = resolveRecipient(live, row.company));
      }
    }

    if (!email) {
      skipped++;
      const msg = `SKIP  ${row.company} - ${row.title} | ${why} | ${row.url}`;
      console.log(msg);
      logLine(msg);
      continue;
    }

    const subject = `Application: ${row.title} - Bunlong Heng`;
    const body = buildBody(row.cover_md, row.title);
    const line = `${SEND ? "SEND" : "WOULD"} -> ${email}  (${why})  | ${row.company} - ${row.title}`;

    if (!SEND) {
      console.log(line);
      logLine(line);
      sent++; // counts toward the cap so dry-run mirrors a real run
      continue;
    }

    try {
      const raw = buildRaw({ to: email, subject, body, pdfB64 });
      const msgId = await sendMessage(raw, token);
      markApplied.run(email, row.id);
      sent++;
      console.log(`${line}  [sent ${msgId}]`);
      logLine(`${line}  [sent ${msgId}]`);
    } catch (e) {
      skipped++;
      const msg = `ERROR ${row.company} - ${row.title} | ${e.message} | ${row.url}`;
      console.error(msg);
      logLine(msg);
    }
  }

  console.log(`\n${SEND ? "sent" : "would send"}: ${sent}   skipped: ${skipped}   (log: ${LOG})`);
  if (!SEND) console.log("DRY-RUN only. Re-run with --send to actually apply.");
}

main().catch((e) => { console.error(e); process.exit(1); });
