// One-time (re-runnable) populate of applications.tech + tech-icon favicon cache.
// Reads title + jd + resume_md + notes per job, detects up to 3 techs, stores a JSON
// array in applications.tech. Also warms the logos cache for each tech's favicon.
// Run: node web/scripts/extract_tech.mjs   (NO python - owner rule)
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB = join(__dirname, "..", "jobs.db");
const db = new Database(DB);

// Mirror of web/lib/tech.ts (kept tiny + inline so this script has no TS import step).
const TECH = [
  ["react", "React", "react.dev", /\breact(\.js|js)?\b/i],
  ["nextjs", "Next.js", "nextjs.org", /\bnext\.?js\b/i],
  ["typescript", "TypeScript", "typescriptlang.org", /\btypescript\b/i],
  ["node", "Node.js", "nodejs.org", /\bnode(\.js|js)?\b/i],
  ["vue", "Vue", "vuejs.org", /\bvue(\.js|js)?\b/i],
  ["angular", "Angular", "angular.dev", /\bangular\b/i],
  ["svelte", "Svelte", "svelte.dev", /\bsvelte(kit)?\b/i],
  ["python", "Python", "python.org", /\bpython\b/i],
  ["django", "Django", "djangoproject.com", /\bdjango\b/i],
  ["flask", "Flask", "flask.palletsprojects.com", /\bflask\b/i],
  ["fastapi", "FastAPI", "fastapi.tiangolo.com", /\bfastapi\b/i],
  ["go", "Go", "go.dev", /\bGolang\b|\bgolang\b|\bGo\b/],
  ["rust", "Rust", "rust-lang.org", /\brust\b/i],
  ["ruby", "Ruby", "ruby-lang.org", /\bruby\b/i],
  ["rails", "Rails", "rubyonrails.org", /\b(ruby on )?rails\b/i],
  ["java", "Java", "java.com", /\bjava\b/i],
  ["spring", "Spring", "spring.io", /\bspring(\s?boot)?\b/i],
  ["kotlin", "Kotlin", "kotlinlang.org", /\bkotlin\b/i],
  ["dotnet", ".NET", "dotnet.microsoft.com", /\b(\.net|c#|csharp|dotnet|asp\.net)\b/i],
  ["php", "PHP", "php.net", /\bphp\b/i],
  ["laravel", "Laravel", "laravel.com", /\blaravel\b/i],
  ["elixir", "Elixir", "elixir-lang.org", /\belixir\b|\bphoenix\b/i],
  ["scala", "Scala", "scala-lang.org", /\bscala\b/i],
  ["swift", "Swift", "swift.org", /\bswift\b/i],
  ["graphql", "GraphQL", "graphql.org", /\bgraphql\b/i],
  ["tailwindcss", "Tailwind", "tailwindcss.com", /\btailwind\b/i],
  ["postgresql", "Postgres", "postgresql.org", /\b(postgres(ql)?|psql)\b/i],
  ["mysql", "MySQL", "mysql.com", /\bmysql\b/i],
  ["mongodb", "MongoDB", "mongodb.com", /\bmongo(db)?\b/i],
  ["redis", "Redis", "redis.io", /\bredis\b/i],
  ["snowflake", "Snowflake", "snowflake.com", /\bsnowflake\b/i],
  ["kafka", "Kafka", "kafka.apache.org", /\bkafka\b/i],
  ["spark", "Spark", "spark.apache.org", /\b(apache )?spark\b/i],
  ["aws", "AWS", "aws.amazon.com", /\b(aws|amazon web services|ec2|s3|lambda|dynamodb)\b/i],
  ["googlecloud", "GCP", "cloud.google.com", /\b(gcp|google cloud|bigquery)\b/i],
  ["microsoftazure", "Azure", "azure.microsoft.com", /\bazure\b/i],
  ["docker", "Docker", "docker.com", /\bdocker\b/i],
  ["kubernetes", "Kubernetes", "kubernetes.io", /\b(kubernetes|k8s)\b/i],
  ["terraform", "Terraform", "terraform.io", /\bterraform\b/i],
];

// Distinctive techs first (Go, Python, Rust, Kafka...) so the ubiquitous React/Next/TS
// trio never crowds a telling stack out of the top slots. (owner request 2026-08-05)
const UBI = new Set(["react", "nextjs", "typescript", "javascript", "node"]);
function extractTech(text, n = 3) {
  if (!text) return [];
  const all = [];
  for (const [slug, , , re] of TECH) if (re.test(text)) all.push(slug);
  all.sort((a, b) => (UBI.has(a) ? 1 : 0) - (UBI.has(b) ? 1 : 0)); // stable: distinctive first
  return all.slice(0, n);
}

// 1. schema: add tech column if missing
const cols = db.prepare("PRAGMA table_info(applications)").all().map((c) => c.name);
if (!cols.includes("tech")) {
  db.exec("ALTER TABLE applications ADD COLUMN tech TEXT");
  console.log("added applications.tech column");
}

// Every job MUST show a stack (owner rule 2026-08-05). When the job text names no explicit
// tech, infer ONE representative from the role itself - the role IS job signal, and it
// gives variety instead of stamping React on everything. NOT read from resume_md (owner's
// own stack would make every row identical).
function inferRole(text) {
  const t = (text || "").toLowerCase();
  if (/machine learning|\bml\b|\bai\b|genai|deep learning|\bnlp\b|data scien|\bllm/.test(t)) return "python";
  if (/data engineer|data platform|analytics|\betl\b|warehouse|big ?data/.test(t)) return "python";
  if (/front.?end|\bui\b engineer|web (developer|engineer)/.test(t)) return "react";
  if (/platform|infrastructure|\bsre\b|reliab|devops|\bcloud\b|kubernetes|\bk8s\b/.test(t)) return "kubernetes";
  if (/\bios\b|swift/.test(t)) return "swift";
  if (/android|kotlin/.test(t)) return "kotlin";
  if (/back.?end|\bapi\b|micro.?service|distributed systems/.test(t)) return "go";
  return "typescript"; // generic full-stack / software engineer
}
const rows = db.prepare("SELECT id, title, company, jd, notes FROM applications WHERE status NOT IN ('deleted')").all();
const upd = db.prepare("UPDATE applications SET tech=? WHERE id=?");
let fromText = 0, inferred = 0;
const tx = db.transaction(() => {
  for (const r of rows) {
    const jobText = [r.title, r.jd, r.notes].filter(Boolean).join("\n");
    let slugs = extractTech(jobText, 3);
    if (slugs.length) fromText++;
    else { slugs = [inferRole([r.title, r.jd].filter(Boolean).join("\n"))]; inferred++; }
    upd.run(JSON.stringify(slugs), r.id);
  }
});
tx();
console.log(`tech: ${fromText} from job text, ${inferred} inferred from role - every job has one`);

// 3. warm tech-icon favicons into the logos cache (key "tech:<slug>")
const GENERIC_MD5 = "b8a0bf372c762e966cc99ede8682bc71";
const crypto = await import("crypto");
async function favicon(dom) {
  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${dom}&sz=64`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 120 || crypto.createHash("md5").update(buf).digest("hex") === GENERIC_MD5) return null;
    return "data:image/png;base64," + buf.toString("base64");
  } catch { return null; }
}
const have = new Set(db.prepare("SELECT company FROM logos WHERE company LIKE 'tech:%'").all().map((r) => r.company));
const upsert = db.prepare("INSERT INTO logos (company, data_uri, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(company) DO UPDATE SET data_uri=excluded.data_uri, updated_at=datetime('now')");
let iconOk = 0, iconTry = 0;
for (const [slug, , dom] of TECH) {
  const key = `tech:${slug}`;
  if (have.has(key)) continue;
  iconTry++;
  const uri = await favicon(dom);
  upsert.run(key, uri);
  if (uri) iconOk++;
}
console.log(`tech icons warmed: ${iconOk}/${iconTry} fetched (rest fall back to a label chip)`);
db.close();
