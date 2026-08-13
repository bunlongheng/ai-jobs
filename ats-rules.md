# ATS / AI-scan optimization rules (canonical)

Every tailored resume and cover letter in this repo MUST follow these. Sourced from
2026 ATS/AI-screening research. The goal: survive the automated gate that ~75% of
resumes fail before a human ever looks.

## The 2026 screening pipeline (what we optimize against)
1. **Parse** - extract plain text + structure from the PDF/DOCX. Broken layout = auto-reject.
2. **Knockout filter** - work authorization, minimum years, location. Answer these cleanly.
3. **Keyword + skills match** - parsed text scored vs the JD's must-have skills/titles.
4. **AI/LLM summarize & rank** - an LLM reads the text, writes a fit summary, assigns a score
   (Oracle 0-5, Workday A-D). Uses **semantic embeddings** - synonyms match, stuffing is detected.
5. **Human** - only sees the top-ranked shortlist.

## Resume rules
- **Single-column layout.** No tables, no multi-column, no text boxes, no graphics/icons.
- **Text-selectable PDF** (never image-only / Canva-graphic export). Verify with `pdftotext`.
- **Standard section headings, in this order:** Contact (top, no header/footer) -> Summary ->
  **Skills** -> **Work Experience** -> **Education & Certifications**.
- **Skills section is first-class** (2026 skills-based screening). Group by category, list the
  exact skills the target JD names. Put it ABOVE experience.
- **Standard fonts only:** Arial, Calibri, Helvetica, Georgia, Garamond, Times New Roman, Tahoma, Verdana.
- **Quantify >=70% of bullets.** Format: `Action verb + what + measurable result` (%, $, x, time, scale).
  Evidence over mention: "Built X in Python that cut reporting 40%" beats "Python" in a list.
- **Acronym + full term** both present: "SAML 2.0", "Single Sign-On (SSO)", "Applicant Tracking System (ATS)".
- **Match the JD's exact language** (titles + skills), aim 80-90% overlap - NEVER copy verbatim (flagged as dishonest).
- Complete phrases, consistent title formatting, consistent date format.

## Cover letter rules
- **250-400 words, 4 short paragraphs:** hook -> value -> proof -> close.
- **Name the exact job title (as posted) in the first sentence.**
- Contact block at top (name, phone, email, LinkedIn) - simple, no fancy header.
- Single column, standard font, 10-12pt, 1-inch margins, PDF.
- Keywords **with evidence**: "5 years of Python and SQL data pipelines", not a tool dump.
- Sound human, not robotic - hybrid AI+human phrasing gets ~2.3x more callbacks.

## Hard "never" list (2026 actively penalizes these)
- Keyword stuffing, white/hidden text, invisible keywords.
- Copying the JD verbatim.
- Image-only PDFs, tables/columns/graphics that scramble parsing.
- Fabricated metrics. We NEVER invent numbers - reframe to real achievements or flag for the user
  to supply a true figure.

## Honesty rule (overrides all)
Optimize structure, keywords, and framing of REAL experience only. If a quantified result is not
true and known, do not invent it - mark it `[ADD METRIC]` for the candidate to fill, or reframe the bullet
as a real (unquantified) achievement.
