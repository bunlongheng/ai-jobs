"use client";
import { useEffect, useState } from "react";

// Per-row live pre-scan spinner. A SINGLE module-level poller reads /scan-status.json
// (written by scan_watch.mjs while the headless lanes run) every 2.5s and fans the set
// of currently-scanning job ids out to every mounted row. A row renders a small blue
// spinner ONLY while its own id is in-flight - nothing up top, no parent-UI clutter.
// (owner request 2026-08-05)
let active = new Set<string>();
let kind = ""; // "prescan" | "ready" | "" (nothing running)
const subs = new Set<(s: Set<string>) => void>();
const kindSubs = new Set<(k: string) => void>();
let started = false;

async function poll() {
  let next = new Set<string>();
  let live = "";
  try {
    const r = await fetch(`/scan-status.json?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j.running && Date.now() - j.updatedAt < 20000) {
        live = j.kind || "prescan";
        next = new Set<string>((j.active || []).map((a: { id: string }) => a.id));
      }
    }
  } catch { /* no scan running - empty set hides every spinner */ }
  active = next;
  kind = live;
  subs.forEach((f) => f(active));
  kindSubs.forEach((f) => f(kind));
}
function ensure() {
  if (started) return;
  started = true;
  poll();
  setInterval(poll, 2500);
}

// Shared "which headless scan is running right now?" signal, fed by the same single poller.
// Each panel-header icon spins only when ITS OWN scan kind is live - pre-scan (form fill) spins
// the Not-ready icon, ready-scan (cleanliness) spins the Ready icon. (owner split 2026-08-07)
export function useScanKind(): string {
  const [k, setK] = useState("");
  useEffect(() => {
    ensure();
    const f = (v: string) => setK(v);
    kindSubs.add(f);
    f(kind);
    return () => { kindSubs.delete(f); };
  }, []);
  return k;
}

export default function ScanSpinner({ id }: { id: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    ensure();
    const f = (s: Set<string>) => setOn(s.has(id));
    subs.add(f);
    f(active);
    return () => { subs.delete(f); };
  }, [id]);
  if (!on) return null;
  return (
    <svg className="animate-spin shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-label="Pre-scanning this form now" style={{ marginRight: 2 }}>
      <title>Pre-scanning this form right now</title>
      <circle cx="12" cy="12" r="9" stroke="#bfdbfe" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
