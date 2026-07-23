import { NextResponse } from "next/server";
import path from "path";
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
