// gmail_auth.mjs - ONE-TIME: mint a Gmail refresh token for the headless cron.
// Run once: `node gmail_auth.mjs`, open the printed URL, approve, done. It writes
// GMAIL_REFRESH_TOKEN into web/.env.local, granting BOTH gmail.readonly (rejection_sweep.mjs
// reads rejection emails) and gmail.send (auto_email_apply.mjs sends HN applications as you).
// Uses the loopback OAuth flow (redirect http://localhost:4785). Reuses the app's existing
// GOOGLE_CLIENT_ID/SECRET, so that client must have http://localhost:4785 as an authorized
// redirect URI and the Gmail API enabled + gmail.readonly AND gmail.send on its consent screen.
// NOTE: adding gmail.send means the existing readonly-only token must be re-minted (run this again).

import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(ROOT, "web/.env.local");
const PORT = 4785;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";

function readEnv() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return { raw, out };
}

function saveToken(raw, refresh) {
  let next = raw.replace(/\n?GMAIL_REFRESH_TOKEN=.*/g, "");
  if (!next.endsWith("\n")) next += "\n";
  next += "\n# Gmail read-only token for the headless rejection sweep (minted by gmail_auth.mjs)\n";
  next += `GMAIL_REFRESH_TOKEN=${refresh}\n`;
  writeFileSync(ENV_PATH, next);
}

async function main() {
  const { raw, out } = readEnv();
  if (!out.GOOGLE_CLIENT_ID || !out.GOOGLE_CLIENT_SECRET) {
    console.error("Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET in web/.env.local");
    process.exit(1);
  }
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: out.GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
    });

  console.log("\n1) Open this URL and approve (sign in as your ADMIN_EMAIL account):\n\n" + authUrl + "\n");
  console.log("Waiting for the redirect on " + REDIRECT + " ...\n");

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, REDIRECT);
    const code = url.searchParams.get("code");
    if (!code) { res.end("no code"); return; }
    try {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: out.GOOGLE_CLIENT_ID,
          client_secret: out.GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT,
          grant_type: "authorization_code",
        }),
      });
      const tok = await r.json();
      if (!tok.refresh_token) throw new Error("no refresh_token returned: " + JSON.stringify(tok).slice(0, 200));
      saveToken(raw, tok.refresh_token);
      res.end("Gmail token saved. You can close this tab.");
      console.log("SUCCESS: GMAIL_REFRESH_TOKEN written to web/.env.local. The cron sweep is now live.");
      server.close();
      process.exit(0);
    } catch (e) {
      res.end("error: " + e.message);
      console.error("FAILED:", e.message);
      server.close();
      process.exit(1);
    }
  });
  server.listen(PORT);
}

main();
