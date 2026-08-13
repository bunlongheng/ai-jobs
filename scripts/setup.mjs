// setup.mjs - first-run bootstrap for a fresh clone. Copies the committed *.example
// templates to their real (gitignored) counterparts if they do not exist yet, so a new
// user fills in their own data instead of inheriting anyone else's. Idempotent: it never
// overwrites a file you already have. Run: `npm run setup` (from the repo root).
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// [example template, real target] - real targets are all gitignored.
const FILES = [
  ["web/.env.example", "web/.env.local"],
  ["profile.example.json", "profile.json"],
  ["web/data/recruiters.example.json", "web/data/recruiters.json"],
  ["web/public/me.example.png", "web/public/me.png"], // neutral avatar; swap for your own photo
];

let copied = 0;
for (const [src, dst] of FILES) {
  const from = join(ROOT, src);
  const to = join(ROOT, dst);
  if (!existsSync(from)) { console.log(`skip  ${dst} (missing template ${src})`); continue; }
  if (existsSync(to)) { console.log(`keep  ${dst} (already exists)`); continue; }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied++;
  console.log(`create ${dst}  <- ${src}`);
}

console.log(`\n${copied} file(s) created.`);
console.log("Next:");
console.log("  1. Edit web/.env.local     - your Google OAuth client, AUTH_SECRET, ADMIN_EMAIL");
console.log("  2. Edit profile.json       - your identity, targets, and apply answers");
console.log("  3. Edit web/data/recruiters.json - your own recruiter list (optional)");
console.log("  4. cd web && npm install && npm run dev   - jobs.db is created on first run");
