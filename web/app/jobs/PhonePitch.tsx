"use client";
import { useState } from "react";

// Floating, always-on phone opener - a speech bubble pinned bottom-right so it's readable while
// dialing any recruiter, instead of buried at the bottom of the page. Minimizes to a small phone
// button. Copy button grabs the pitch. (owner request 2026-08-10)
const PITCH = "Hi, my name's Bunlong Heng. I'm a senior full-stack engineer up in New Hampshire, looking for my next role - open to remote or hybrid around Boston, about 12 years in TypeScript, React, and Node. I wanted to see if you place software engineers, and whether you've got anything that might be a fit. Would it be alright to send you my resume?";

export default function PhonePitch() {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Show phone opener"
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-indigo-600 text-white shadow-lg flex items-center justify-center hover:bg-indigo-700">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:w-[330px]">
      <div className="relative bg-white border border-indigo-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
          <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
          </span>
          <span className="text-[13px] font-bold flex-1">Phone opener</span>
          <button onClick={async () => { try { await navigator.clipboard.writeText(PITCH); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }}
            className="text-[11px] font-bold bg-white/20 hover:bg-white/30 rounded px-2 py-0.5">{copied ? "Copied" : "Copy"}</button>
          <button onClick={() => setOpen(false)} title="Minimize" className="text-white/80 hover:text-white text-lg leading-none px-1">&minus;</button>
        </div>
        <div className="px-4 py-3 text-[13.5px] leading-relaxed text-[#1f2328]">{PITCH}</div>
      </div>
    </div>
  );
}
