// auto_email_apply.mjs - autonomously apply to HN "Who is Hiring" jobs by email.
// For every kit_ready HN job with a prepped cover, resolve the real apply email from
// the HN comment, compose the application (cover + links + resume PDF attached), send
// it AS you (identity from profile.json) via the Gmail API, and flip the row to applied.
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
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
const require = createRequire(import.meta.url);
const ROOT = dirname(fileURLToPath(import.meta.url));
const Database = require(join(ROOT, "web/node_modules/better-sqlite3"));

// Identity + resume path come from profile.json (single source of truth); env vars override.
let profile = {};
try { profile = JSON.parse(readFileSync(join(ROOT, "profile.json"), "utf8")); } catch { /* no profile yet */ }
const id = profile.identity || {};

const ENV_PATH = join(ROOT, "web/.env.local");
const DB_PATH = process.env.JOBS_DB || join(ROOT, "web/jobs.db");
const RESUME_PDF = process.env.RESUME_PDF || resolve(ROOT, id.resume_pdf || "resume.pdf");
const LOG = process.env.AUTO_EMAIL_LOG || "/tmp/auto-email-apply.log";
const FROM_NAME = process.env.FROM_NAME || id.name || "";
const FROM_EMAIL = process.env.FROM_EMAIL || id.email || "";
const RESUME_FILENAME = (FROM_NAME ? FROM_NAME.replace(/\s+/g, "-") + "-" : "") + "Resume.pdf";
const GAPI = "https://gmail.googleapis.com/gmail/v1/users/me";
const ALGOLIA = "https://hn.algolia.com/api/v1";

const SEND = process.argv.includes("--send") && process.env.JOBS_AUTOSEND_OFF !== "1";
const DIRECT = process.argv.includes("--direct");
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

// Every outreach leads with the same positioning line - senior full-stack, 12+ years - so the
// recruiter sees the headline before the cover text. (owner rule 2026-09-06)
const HEADLINE = id.headline || "Senior Full-Stack Developer";
const YEARS = id.years || "12+";
// The header line is the NAME + TITLE only - short, never a sentence. The years belong in the
// opening line of the message instead, where they read as a person talking. (owner rule 2026-09-06)
const SUMMARY = `${FROM_NAME} - ${HEADLINE}`;
const INTRO = `With ${YEARS} years building and shipping production web applications end to end, I wanted to put my name in for this one.`;
// Do not repeat the years if the tailored cover already works them in.
const needsIntro = (cover) => !/\b12\+?\s*years|\b\d{2}\+\s*years/i.test(String(cover || ""));

// url = the real href, label = what the reader sees. Both are needed: the plain-text part prints
// the bare URL, the HTML part wraps it in a real <a> so GitHub/Projects are CLICKABLE. Sending
// text/plain only was why the links arrived as dead text. (owner bug 2026-09-06)
function buildLinks() {
  const site = String(id.site || "").replace(/\/$/, "");
  return [
    id.site && { label: "Portfolio", url: id.site },
    id.projects ? { label: "Projects", url: id.projects } : (site && { label: "Projects", url: site + "/projects" }),
    site && { label: "Resume", url: site + "/resume" },
    id.github && { label: "GitHub", url: id.github },
    id.linkedin && { label: "LinkedIn", url: id.linkedin },
  ].filter(Boolean);
}

function coverText(coverMd) {
  let b = dedash(coverMd || "").trim();
  const i = b.search(/with great excitement|best regard|sincerely/i); // drop any existing sign-off
  if (i >= 0) b = b.slice(0, i).trim();
  return b;
}

const WALKTHROUGH = "Happy to walk through any of these projects if one catches your eye - just let me know and we can find a time.";

// Split the cover into its salutation ("Dear X,") and the rest, so the intro line can sit right
// after the greeting instead of above it.
function splitCover(coverMd) {
  const t = coverText(coverMd);
  const m = t.match(/^\s*(dear[^\n]{0,80}?,)\s*\n?/i);
  return m ? { hello: m[1].trim(), rest: t.slice(m[0].length).trim() } : { hello: "", rest: t };
}

function buildBody(coverMd, title) {
  const links = buildLinks();
  const { hello, rest } = splitCover(coverMd);
  return [
    SUMMARY,
    "",
    ...(hello ? [hello, ""] : []),
    ...(needsIntro(coverMd) ? [INTRO, ""] : []),
    rest,
    "",
    ...(links.length ? ["A few links if useful:", ...links.map((l) => `${l.label} - ${l.url}`), ""] : []),
    WALKTHROUGH,
    "",
    "With great excitement,",
    FROM_NAME,
  ].join("\n");
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function buildHtmlBody(coverMd, title) {
  const links = buildLinks();
  const { hello, rest } = splitCover(coverMd);
  const paras = rest.split(/\n\s*\n/).filter((x) => x.trim());
  return [
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:15px;line-height:1.6;color:#1a2129;max-width:640px;">',
    `<p style="margin:0 0 16px;font-weight:bold;">${esc(SUMMARY)}</p>`,
    hello ? `<p style="margin:0 0 14px;">${esc(hello)}</p>` : "",
    needsIntro(coverMd) ? `<p style="margin:0 0 14px;">${esc(INTRO)}</p>` : "",
    ...paras.map((x) => `<p style="margin:0 0 14px;">${esc(x).replace(/\n/g, "<br/>")}</p>`),
    links.length
      ? '<p style="margin:18px 0 6px;">A few links if useful:</p><ul style="margin:0 0 16px;padding-left:20px;">' +
        links.map((l) => `<li style="margin:0 0 5px;"><a href="${esc(l.url)}" style="color:#2563eb;">${esc(l.label)}</a></li>`).join("") +
        "</ul>"
      : "",
    `<p style="margin:0 0 16px;">${esc(WALKTHROUGH)}</p>`,
    '<p style="margin:0;">With great excitement,<br/>' + esc(FROM_NAME) + "</p>",
    "</div>",
  ].filter(Boolean).join("\n");
}

function buildRaw({ to, subject, body, html, pdfB64 }) {
  const nl = "\r\n";
  const seed = Buffer.from(subject).toString("hex").slice(0, 16) + to.length;
  const outer = "mix_" + seed;   // multipart/mixed: [alternative, pdf]
  const inner = "alt_" + seed;   // multipart/alternative: [plain, html]
  const b64 = (t) => Buffer.from(t, "utf8").toString("base64").match(/.{1,76}/g).join(nl);
  const headers = [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${to}`,
    `Bcc: ${FROM_EMAIL}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${outer}"`,
  ].join(nl);
  const parts = [
    `--${outer}`,
    `Content-Type: multipart/alternative; boundary="${inner}"`,
    "",
    `--${inner}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(body),
    "",
    `--${inner}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(html),
    "",
    `--${inner}--`,
    "",
    `--${outer}`,
    `Content-Type: application/pdf; name="${RESUME_FILENAME}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${RESUME_FILENAME}"`,
    "",
    pdfB64.match(/.{1,76}/g).join(nl),
    "",
    `--${outer}--`,
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
  // Two lanes. HN: resolve the apply email out of the HN comment at send time (the original path).
  // DIRECT: any kit_ready job whose found_email was already resolved by the Hunter finder. The
  // direct lane is OPT-IN via --direct so wiring it up cannot silently arm the cron - the scheduled
  // run keeps doing HN only until the owner turns it on. (owner rule 2026-09-06)
  const rows = db
    .prepare(
      "SELECT id, company, title, url, cover_md, jd, notes, found_email FROM applications " +
        "WHERE status='kit_ready' AND cover_md IS NOT NULL AND (" +
        "  url LIKE '%news.ycombinator.com%'" +
        (DIRECT ? " OR (found_email IS NOT NULL AND found_email <> '')" : "") +
        ") ORDER BY score DESC"
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

    // recipient: a Hunter-resolved found_email wins outright (direct lane); otherwise fall back to
    // the HN path - DB text first, then self-heal from the live comment (and cache it).
    let text = `${row.jd || ""} ${row.notes || ""}`;
    let { email, why } = resolveRecipient(text, row.company);
    if (!email && DIRECT && row.found_email && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(row.found_email.trim())) {
      email = row.found_email.trim();
      why = "found_email (Hunter)";
    }
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

    const subject = `Application: ${row.title}${FROM_NAME ? ` - ${FROM_NAME}` : ""}`;
    const body = buildBody(row.cover_md, row.title);
    const html = buildHtmlBody(row.cover_md, row.title);
    const line = `${SEND ? "SEND" : "WOULD"} -> ${email}  (${why})  | ${row.company} - ${row.title}`;

    if (!SEND) {
      console.log(line);
      logLine(line);
      sent++; // counts toward the cap so dry-run mirrors a real run
      continue;
    }

    try {
      const raw = buildRaw({ to: email, subject, body, html, pdfB64 });
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
