import { db } from "../lib/db";
import crypto from "crypto";

// Source (ATS / board) -> domain, cached into the logos table under key "src:<name>".
const SOURCES: Record<string, string> = {
  Ashby: "ashbyhq.com",
  Greenhouse: "greenhouse.io",
  Indeed: "indeed.com",
  LinkedIn: "linkedin.com",
  Lever: "lever.co",
};

const GENERIC_MD5 = "b8a0bf372c762e966cc99ede8682bc71";

async function favicon(dom: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${dom}&sz=64`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 120 || crypto.createHash("md5").update(buf).digest("hex") === GENERIC_MD5) return null;
    return "data:image/png;base64," + buf.toString("base64");
  } catch {
    return null;
  }
}

async function main() {
  const upsert = db().prepare(
    "INSERT INTO logos (company, data_uri, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(company) DO UPDATE SET data_uri=excluded.data_uri, updated_at=datetime('now')"
  );
  for (const [name, dom] of Object.entries(SOURCES)) {
    const uri = await favicon(dom);
    upsert.run(`src:${name}`, uri);
    console.log(`src:${name} <- ${dom}: ${uri ? "ok" : "no logo"}`);
  }
}

main();
