// Tech-stack detection for the board's "Tech" column. We scan each job's available text
// (title + JD + tailored resume + notes) for a curated set of technologies and keep the
// top few. Icons reuse the same favicon cache as company logos (key "tech:<slug>").
// (owner request 2026-08-05)
export type Tech = { slug: string; label: string; domain: string; re: RegExp };

// Order matters: earlier entries win ties (languages/frameworks before infra/db), so the
// most identity-defining stack shows first. Regexes are conservative to avoid false hits.
export const TECH: Tech[] = [
  { slug: "react", label: "React", domain: "react.dev", re: /\breact(\.js|js)?\b/i },
  { slug: "nextjs", label: "Next.js", domain: "nextjs.org", re: /\bnext\.?js\b/i },
  { slug: "typescript", label: "TypeScript", domain: "typescriptlang.org", re: /\btypescript\b/i },
  { slug: "node", label: "Node.js", domain: "nodejs.org", re: /\bnode(\.js|js)?\b/i },
  { slug: "vue", label: "Vue", domain: "vuejs.org", re: /\bvue(\.js|js)?\b/i },
  { slug: "angular", label: "Angular", domain: "angular.dev", re: /\bangular\b/i },
  { slug: "svelte", label: "Svelte", domain: "svelte.dev", re: /\bsvelte(kit)?\b/i },
  { slug: "python", label: "Python", domain: "python.org", re: /\bpython\b/i },
  { slug: "django", label: "Django", domain: "djangoproject.com", re: /\bdjango\b/i },
  { slug: "flask", label: "Flask", domain: "flask.palletsprojects.com", re: /\bflask\b/i },
  { slug: "fastapi", label: "FastAPI", domain: "fastapi.tiangolo.com", re: /\bfastapi\b/i },
  { slug: "go", label: "Go", domain: "go.dev", re: /\bGolang\b|\bgolang\b|\bGo\b/ },
  { slug: "rust", label: "Rust", domain: "rust-lang.org", re: /\brust\b/i },
  { slug: "ruby", label: "Ruby", domain: "ruby-lang.org", re: /\bruby\b/i },
  { slug: "rails", label: "Rails", domain: "rubyonrails.org", re: /\b(ruby on )?rails\b/i },
  { slug: "java", label: "Java", domain: "java.com", re: /\bjava\b/i },
  { slug: "spring", label: "Spring", domain: "spring.io", re: /\bspring(\s?boot)?\b/i },
  { slug: "kotlin", label: "Kotlin", domain: "kotlinlang.org", re: /\bkotlin\b/i },
  { slug: "dotnet", label: ".NET", domain: "dotnet.microsoft.com", re: /\b(\.net|c#|csharp|dotnet|asp\.net)\b/i },
  { slug: "php", label: "PHP", domain: "php.net", re: /\bphp\b/i },
  { slug: "laravel", label: "Laravel", domain: "laravel.com", re: /\blaravel\b/i },
  { slug: "elixir", label: "Elixir", domain: "elixir-lang.org", re: /\belixir\b|\bphoenix\b/i },
  { slug: "scala", label: "Scala", domain: "scala-lang.org", re: /\bscala\b/i },
  { slug: "swift", label: "Swift", domain: "swift.org", re: /\bswift\b/i },
  { slug: "graphql", label: "GraphQL", domain: "graphql.org", re: /\bgraphql\b/i },
  { slug: "tailwindcss", label: "Tailwind", domain: "tailwindcss.com", re: /\btailwind\b/i },
  { slug: "postgresql", label: "Postgres", domain: "postgresql.org", re: /\b(postgres(ql)?|psql)\b/i },
  { slug: "mysql", label: "MySQL", domain: "mysql.com", re: /\bmysql\b/i },
  { slug: "mongodb", label: "MongoDB", domain: "mongodb.com", re: /\bmongo(db)?\b/i },
  { slug: "redis", label: "Redis", domain: "redis.io", re: /\bredis\b/i },
  { slug: "snowflake", label: "Snowflake", domain: "snowflake.com", re: /\bsnowflake\b/i },
  { slug: "kafka", label: "Kafka", domain: "kafka.apache.org", re: /\bkafka\b/i },
  { slug: "spark", label: "Spark", domain: "spark.apache.org", re: /\b(apache )?spark\b/i },
  { slug: "aws", label: "AWS", domain: "aws.amazon.com", re: /\b(aws|amazon web services|ec2|s3|lambda|dynamodb)\b/i },
  { slug: "googlecloud", label: "GCP", domain: "cloud.google.com", re: /\b(gcp|google cloud|bigquery)\b/i },
  { slug: "microsoftazure", label: "Azure", domain: "azure.microsoft.com", re: /\bazure\b/i },
  { slug: "docker", label: "Docker", domain: "docker.com", re: /\bdocker\b/i },
  { slug: "kubernetes", label: "Kubernetes", domain: "kubernetes.io", re: /\b(kubernetes|k8s)\b/i },
  { slug: "terraform", label: "Terraform", domain: "terraform.io", re: /\bterraform\b/i },
];

// De-dupe by slug (the list intentionally repeats a couple for alias coverage).
const BY_SLUG = new Map(TECH.map((t) => [t.slug, t]));
export function techMeta(slug: string): Tech | undefined { return BY_SLUG.get(slug); }

// Return up to `n` tech slugs found in the text, distinctive techs first (Go, Python,
// Rust...) so the ubiquitous React/Next/TS trio never crowds out a telling stack.
const UBIQUITOUS = new Set(["react", "nextjs", "typescript", "javascript", "node"]);
export function extractTech(text: string | null | undefined, n = 3): string[] {
  if (!text) return [];
  const all: string[] = [];
  const seen = new Set<string>();
  for (const t of TECH) {
    if (seen.has(t.slug)) continue;
    if (t.re.test(text)) { all.push(t.slug); seen.add(t.slug); }
  }
  all.sort((a, b) => (UBIQUITOUS.has(a) ? 1 : 0) - (UBIQUITOUS.has(b) ? 1 : 0));
  return all.slice(0, n);
}
