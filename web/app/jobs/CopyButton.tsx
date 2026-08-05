"use client";
import { useState } from "react";

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

export default function CopyButton({ text, label = "Copy", tone = "onDark" }: { text: string; label?: string; tone?: "onDark" | "onLight" }) {
  const [done, setDone] = useState(false);
  const cls = tone === "onDark"
    ? "text-white/90 hover:text-white bg-white/20 hover:bg-white/30"
    : "text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100";
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className={`text-[11px] font-semibold rounded px-2 py-0.5 shrink-0 no-underline ${cls}`}
      title="Copy to clipboard"
    >
      {done ? "Copied!" : label}
    </button>
  );
}
