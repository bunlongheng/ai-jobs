import fs from "fs";
import path from "path";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { db } from "./db";

// Document builder data layer - resume AND cover-letter versions, each markdown (source of truth).
// PDFs are rendered out-of-band by make_resume_pdf.mjs and stored as a BLOB. Nothing here is
// user-specific: defaults come from the running install's profile.json, and a fresh clone starts
// empty. (owner request 2026-08-18: resume + cover builder, public-friendly)
marked.setOptions({ gfm: true, breaks: false });

export type Kind = "resume" | "cover";
export const KINDS: Kind[] = ["resume", "cover"];
export const asKind = (k: unknown): Kind => (k === "cover" ? "cover" : "resume");

export type ResumeVersion = {
  id: string; kind: Kind; name: string; content: string;
  is_master: number; has_pdf: number; updated_at: string;
};

export function resumeHtml(content: string | null): string {
  if (!content) return "";
  const body = content.replace(/^<!--[\s\S]*?-->\s*/m, "");
  return DOMPurify.sanitize(marked.parse(body) as string);
}

const slug = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "version";

// ---- profile-driven defaults (public-friendly: no hardcoded person) ----
const ROOT = path.resolve(process.cwd(), "..");
function identity(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "profile.json"), "utf8")).identity || {}; } catch { return {}; }
}
const strip = (u?: string) => String(u || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

/** A starter template for a brand-new version, filled from THIS install's profile.json. */
export function defaultContent(kind: Kind): string {
  const i = identity();
  const name = i.name || "Your Name";
  const line = [i.location, i.email, i.phone, strip(i.site), strip(i.linkedin), strip(i.github)].filter(Boolean).join(" · ");
  if (kind === "cover") {
    return `# Cover Letter\n\n${name}${line ? `\n${line}` : ""}\n\nDear Hiring Team,\n\n[Opening - who you are and why this role.]\n\n[Proof - one or two wins that match the job.]\n\n[Close - enthusiasm and a call to talk.]\n\nWith great excitement,\n\n${name}\n`;
  }
  return `# ${name}\n\n${line}\n\n**Senior / Staff Software Engineer**\n\n## Skills\n\n- \n\n## Experience\n\n### Company - Title (Year - Year)\n- \n\n## Education\n\n- \n`;
}

// ---- seed: only if empty, and only from files the install actually has ----
export function seedIfEmpty(): void {
  const d = db();
  const count = (d.prepare("SELECT COUNT(*) n FROM resume_versions").get() as { n: number }).n;
  if (count > 0) return;
  const tryFile = (rel: string) => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return null; } };
  const base = tryFile("resume-master.md");
  if (base) upsertVersion({ kind: "resume", name: "Base", content: base, is_master: true });
  const cover = tryFile("cover-master.md");
  if (cover) upsertVersion({ kind: "cover", name: "Base", content: cover, is_master: true });
}

export function listVersions(kind?: Kind): Omit<ResumeVersion, "content">[] {
  seedIfEmpty();
  const rows = kind
    ? db().prepare("SELECT id, kind, name, is_master, has_pdf, updated_at FROM resume_versions WHERE kind = ? ORDER BY is_master DESC, name ASC").all(kind)
    : db().prepare("SELECT id, kind, name, is_master, has_pdf, updated_at FROM resume_versions ORDER BY kind ASC, is_master DESC, name ASC").all();
  return rows as Omit<ResumeVersion, "content">[];
}

export function getVersion(id: string): ResumeVersion | undefined {
  return db().prepare(
    "SELECT id, kind, name, content, is_master, has_pdf, updated_at FROM resume_versions WHERE id = ?"
  ).get(id) as ResumeVersion | undefined;
}

/** Create or update a version. Writing content clears the stored PDF (re-rendered on next /pdf). */
export function upsertVersion(v: { id?: string; kind?: Kind; name: string; content: string; is_master?: boolean }): ResumeVersion {
  const d = db();
  const kind = asKind(v.kind);
  let id = v.id || `${kind}-${slug(v.name)}`;
  if (!v.id) {
    let n = 2; const base = id;
    while (d.prepare("SELECT 1 FROM resume_versions WHERE id = ?").get(id)) id = `${base}-${n++}`;
  }
  d.prepare(
    `INSERT INTO resume_versions (id, kind, name, content, is_master, pdf, has_pdf, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 0, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, content=excluded.content,
       pdf=NULL, has_pdf=0, updated_at=datetime('now')`
  ).run(id, kind, v.name, v.content, v.is_master ? 1 : 0);
  if (v.is_master) setMaster(id);
  return getVersion(id)!;
}

/** Master is per-kind: setting one clears only the master of the SAME kind. */
export function setMaster(id: string): void {
  const d = db();
  const row = d.prepare("SELECT kind FROM resume_versions WHERE id = ?").get(id) as { kind: string } | undefined;
  if (!row) return;
  d.prepare("UPDATE resume_versions SET is_master = 0 WHERE kind = ? AND is_master = 1").run(row.kind);
  d.prepare("UPDATE resume_versions SET is_master = 1 WHERE id = ?").run(id);
}

export function deleteVersion(id: string): void {
  db().prepare("DELETE FROM resume_versions WHERE id = ?").run(id);
}

export function getPdf(id: string): Buffer | null {
  const row = db().prepare("SELECT pdf FROM resume_versions WHERE id = ?").get(id) as { pdf: Buffer | null } | undefined;
  return row?.pdf ?? null;
}
