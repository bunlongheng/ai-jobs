import { NextResponse } from "next/server";
import path from "path";
import { appendFileSync } from "fs";
import { db } from "@/lib/db";
import { originBlocked } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

/** Extension posts fill/submit events here. jobs.db is the single source of truth:
 *  every event is recorded, and outcome "submitted" flips the application to
 *  applied + applied_at - the board (AutoRefresh) shows it within seconds. */
export async function POST(req: Request) {
  const blocked = originBlocked(req);
  if (blocked) return blocked;
  let ev: Record<string, unknown>;
  try { ev = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const jid = path.basename(String(ev.id || ""));
  if (!jid) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const stamp = new Date().toISOString().slice(0, 10);
  const d = db();

  // "Capture Q&A" from the extension: the question -> answer pairs you actually typed,
  // appended to jobfill/captured-answers.jsonl so Claude can learn them for similar
  // questions next time. READ-ONLY on the DB (one event row for provenance). (2026-08-05)
  if (ev.outcome === "captured_answers" && Array.isArray(ev.answers)) {
    const kit = d.prepare("SELECT company, title FROM applications WHERE id=?").get(jid) as { company?: string; title?: string } | undefined;
    const ts = new Date().toISOString();
    const lines = (ev.answers as Array<{ label?: string; value?: string; type?: string }>)
      .filter((a) => a && a.label && a.value)
      .map((a) => JSON.stringify({
        ts, kitId: jid, company: kit?.company ?? null, title: kit?.title ?? null,
        url: (ev.url as string) ?? null, label: String(a.label).slice(0, 300),
        value: String(a.value).slice(0, 6000), type: a.type ?? null,
      }));
    if (lines.length) {
      try { appendFileSync(path.join(process.cwd(), "..", "jobfill", "captured-answers.jsonl"), lines.join("\n") + "\n"); } catch {}
      d.prepare("INSERT INTO events (app_id, outcome, url, fields, stamp) VALUES (?, 'captured_answers', ?, ?, ?)")
        .run(jid, (ev.url as string) ?? null, JSON.stringify(ev.answers), stamp);
    }
    return NextResponse.json({ ok: true, captured: lines.length, file: "jobfill/captured-answers.jsonl" });
  }

  // Logged-in Chrome sees Easy Apply buttons that guests cannot. Stamp both the
  // result (easy_apply 1/0) and that we checked (easy_apply_checked=1), matched by URL.
  if (ev.outcome === "easy_apply_detected" && typeof ev.url === "string") {
    const clean = (ev.url as string).split("?")[0].replace(/\/$/, "");
    const found = ev.found ? 1 : 0;
    const row = d.prepare("SELECT id FROM applications WHERE url LIKE ? || '%' OR ? LIKE url || '%'").get(clean, clean) as { id: string } | undefined;
    if (row) d.prepare("UPDATE applications SET easy_apply=?, easy_apply_checked=1, updated_at=datetime('now') WHERE id=?").run(found, row.id);
    return NextResponse.json({ ok: true, flagged: row?.id ?? null, easy: found });
  }

  // Native LinkedIn/Indeed Easy Apply has no kit id - the content script reports the
  // submit with id "_meta" + the job URL. Match the application by URL and flip
  // ready -> applied, same as a tracked submit. (owner request 2026-07-23)
  if (ev.outcome === "submitted" && (jid === "_meta" || jid === "") && typeof ev.url === "string") {
    const clean = (ev.url as string).split("?")[0].replace(/\/$/, "");
    const row = d.prepare("SELECT id FROM applications WHERE url LIKE ? || '%' OR ? LIKE url || '%'").get(clean, clean) as { id: string } | undefined;
    let flipped = false;
    if (row) {
      const r = d.prepare("UPDATE applications SET status='applied', applied_at=?, updated_at=datetime('now') WHERE id=? AND status!='applied'").run(stamp, row.id);
      flipped = r.changes > 0;
      d.prepare("INSERT INTO events (app_id, outcome, url, stamp) VALUES (?, 'submitted', ?, ?)").run(row.id, ev.url as string, stamp);
    }
    return NextResponse.json({ ok: true, tracker_updated: flipped, matched: row?.id ?? null });
  }
  d.prepare("INSERT INTO events (app_id, outcome, url, fields, stamp, debug) VALUES (?, ?, ?, ?, ?, ?)")
    .run(jid, String(ev.outcome || ""), (ev.url as string) ?? null,
         ev.fields ? JSON.stringify(ev.fields) : null, stamp,
         ev.debug ? JSON.stringify(ev.debug) : null); // failure diagnostics (options + HTML) - what rule-fixes are written from

  // Plugin pre-run verdict: any field the extension could not answer arrives as
  // "MANUAL ..." - that is a RED. Green (pf_status=ready) ONLY at zero red.
  if (Array.isArray(ev.fields) && ev.fields.length && ev.outcome !== "submitted") {
    type F = [string, string, string?, string[]?] | { label?: string; value?: string };
    const vals = (ev.fields as F[]).map((f) => String(Array.isArray(f) ? f[1] ?? "" : f.value ?? ""));
    const labels = (ev.fields as F[]).map((f) => String(Array.isArray(f) ? f[0] ?? "" : f.label ?? ""));
    const scored = vals.filter((_, i) => !/recaptcha/i.test(labels[i]));
    const red = scored.filter((v) => v.trim().toUpperCase().startsWith("MANUAL")).length;
    const total = scored.length;
    d.prepare("UPDATE applications SET pf_status=?, pf_covered=?, pf_total=?, pf_date=?, pf_ats='plugin', updated_at=datetime('now') WHERE id=?")
      .run(red === 0 ? "ready" : "gaps", total - red, total, stamp, jid);
  }

  let flipped = false;
  if (ev.outcome === "submitted") {
    const r = d.prepare("UPDATE applications SET status='applied', applied_at=?, updated_at=datetime('now') WHERE id=? AND status!='applied'")
      .run(stamp, jid);
    flipped = r.changes > 0;
  }
  return NextResponse.json({ ok: true, tracker_updated: flipped });
}
