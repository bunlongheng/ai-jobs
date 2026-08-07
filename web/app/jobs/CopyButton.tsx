"use client";
import { useState } from "react";
import { toast } from "./Toast";

// Copy-to-clipboard button. Works in secure contexts (HTTPS/localhost) via the async
// Clipboard API, and falls back to execCommand for plain-HTTP LAN (e.g. the iPad at
// http://10.0.0.218:3017, where navigator.clipboard is undefined). (owner request 2026-08-05)
function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallback(text));
  } else {
    fallback(text);
  }
}
function fallback(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand("copy"); } catch { /* ignore */ }
  document.body.removeChild(ta);
}

// Subtle icon-only copy button: silver/gray at rest, darkens on hover, briefly turns into a
// check on copy. No pill, no text - stays out of the way. (owner request 2026-08-06)
export default function CopyButton({ text, tone = "onDark" }: { text: string; label?: string; tone?: "onDark" | "onLight" }) {
  const [done, setDone] = useState(false);
  const cls = tone === "onDark" ? "text-white/50 hover:text-white/90" : "text-gray-300 hover:text-gray-500";
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyText(text); toast("Copied to clipboard", "#16a34a"); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className={`shrink-0 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 ${done ? "text-green-500 opacity-100" : cls}`}
      title="Copy to clipboard"
      aria-label="Copy to clipboard"
    >
      {done ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
      )}
    </button>
  );
}
