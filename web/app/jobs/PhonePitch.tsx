"use client";
import { useState } from "react";

// A quiet floating reminder note (bottom-right) with what to say on the call, and Bunlong's photo
// overlapping the top-right corner. No panel header - just the note. Minimizes to a phone button.
// (owner request 2026-08-10)
const PITCH = "Hi, my name's Bunlong Heng. I'm a senior full-stack engineer up in New Hampshire, looking for my next role - open to remote or hybrid around Boston, about 12 years in TypeScript, React, and Node. I wanted to see if you place software engineers, and whether you've got anything that might be a fit. Would it be alright to send you my resume?";
const PHONE = "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z";

export default function PhonePitch() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Show phone opener"
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-indigo-600 text-white shadow-lg flex items-center justify-center hover:bg-indigo-700">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={PHONE} /></svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:w-[320px]">
      <div className="relative bg-white border border-gray-200 rounded-2xl shadow-xl px-4 pt-4 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/me.png" alt="Bunlong" width={52} height={52} className="absolute -top-5 -right-4 w-[52px] h-[52px] rounded-full border-[3px] border-white shadow-md object-cover" />
        <button onClick={() => setOpen(false)} title="Hide" className="absolute top-2 left-2 text-gray-300 hover:text-gray-500 text-lg leading-none">&minus;</button>
        <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 mb-1.5 pl-4">Say on the call</div>
        <div className="text-[13.5px] leading-relaxed text-[#1f2328]">{PITCH}</div>
      </div>
    </div>
  );
}
