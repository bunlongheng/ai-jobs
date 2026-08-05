import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { db } from "./db";

// Kit materials are ingested into SQLite at migrate time (resume_md / cover_md /
// screening_md columns), so the app is self-contained - no cross-repo filesystem
// read at request time. Markdown is rendered then SANITIZED before it reaches the
// page, so dangerouslySetInnerHTML has no XSS surface.
marked.setOptions({ gfm: true, breaks: false });

function md(text: string | null): string {
  if (!text) return "";
  return DOMPurify.sanitize(marked.parse(text) as string);
}

export type Kit = {
  resumeHtml: string;
  coverHtml: string;
  screeningHtml: string;
  resumeText: string;
  coverText: string;
  screeningText: string;
  hasResumePdf: boolean;
  usedMaster: boolean;
};

export function getKit(id: string): Kit {
  const row = db()
    .prepare("SELECT resume_md, cover_md, screening_md, has_resume_pdf FROM applications WHERE id = ?")
    .get(id) as { resume_md: string | null; cover_md: string | null; screening_md: string | null; has_resume_pdf: number } | undefined;
  const resumeHtml = md(row?.resume_md ?? null);
  return {
    resumeHtml,
    coverHtml: md(row?.cover_md ?? null),
    screeningHtml: md(row?.screening_md ?? null),
    resumeText: row?.resume_md ?? "",
    coverText: row?.cover_md ?? "",
    screeningText: row?.screening_md ?? "",
    hasResumePdf: !!row?.has_resume_pdf,
    usedMaster: !resumeHtml && !row?.has_resume_pdf,
  };
}

export function getResumePdf(id: string): Buffer | null {
  const row = db().prepare("SELECT resume_pdf FROM applications WHERE id = ?").get(id) as { resume_pdf: Buffer | null } | undefined;
  return row?.resume_pdf ?? null;
}
