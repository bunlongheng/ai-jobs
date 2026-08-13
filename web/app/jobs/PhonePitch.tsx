"use client";
import { useState } from "react";
import { useFocus } from "./CardFocus";

// A quiet floating reminder note with what to say on the call, and your photo overlapping the
// top-left corner. The script text comes from profile.json (pitch), passed in as a prop so no
// personal data is hardcoded. Collapses to your photo. (owner request 2026-08-10)
export default function PhonePitch({ pitch }: { pitch: string }) {
  // Collapsed by default to just a phone icon (top-left); tap to reveal what to say on the call.
  // Clicking a recruiter card (focus) auto-opens it so the script is up while you dial. Derived,
  // not an effect: expanded whenever a card is focused OR you opened it manually.
  const [open, setOpen] = useState(false);
  const { focused } = useFocus();
  const expanded = open || focused !== null;

  if (!expanded) {
    return (
      <button onClick={() => setOpen(true)} title="What to say on the call"
        className="fixed top-4 left-4 z-50 w-14 h-14 rounded-full border-[3px] border-white shadow-lg overflow-hidden hover:scale-105 transition-transform bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/me.png" alt="Profile" width={56} height={56} className="w-full h-full object-cover" />
      </button>
    );
  }

  return (
    <div className="fixed top-1/2 -translate-y-1/2 left-4 sm:left-[max(1rem,calc(50vw-49rem))] z-50 w-[calc(100vw-2rem)] sm:w-[320px]">
      <div className="relative bg-white border border-gray-200 rounded-2xl shadow-xl pl-6 pr-4 pt-6 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/me.png" alt="Profile" width={52} height={52} className="absolute -top-5 -left-4 w-[52px] h-[52px] rounded-full border-[3px] border-white shadow-md object-cover" />
        <button onClick={() => setOpen(false)} title="Hide" className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 text-lg leading-none">&minus;</button>
        <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 mb-1.5 pl-9">Say on the call</div>
        <div className="text-[13.5px] leading-relaxed text-[#1f2328]">{pitch}</div>
      </div>
    </div>
  );
}
