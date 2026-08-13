"use client";
import { useState } from "react";

// The firm's phone number plus a "broken phone" toggle. When the number is dead/disconnected
// (it happens), click the crossed-phone button: the number goes red + struck-through so you know
// not to dial it again. Persists to recruiter_status.bad_phone. (owner request 2026-08-10)
const PHONE_OFF = "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z";

export default function RecruiterPhone({ firm, phone, tel, initialBroken }: { firm: string; phone: string; tel: string; initialBroken: boolean }) {
  const [broken, setBroken] = useState(initialBroken);
  function toggle() {
    const next = !broken;
    setBroken(next); // optimistic
    fetch("/api/jobfill/recruiter-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firm, badPhone: next }) }).catch(() => {});
  }
  return (
    <div className="inline-flex items-center gap-1.5">
      <a href={tel} style={{ fontWeight: 100 }} className={`text-[26px] tracking-tight no-underline inline-flex items-center ${broken ? "text-red-400 line-through decoration-red-400" : "text-[#1f2328]"}`}>
        {phone}
      </a>
      <button onClick={toggle} type="button" aria-pressed={broken}
        title={broken ? "Phone works? Unmark broken" : "Mark this phone broken / disconnected"}
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${broken ? "bg-red-500 border-red-500 text-white" : "border-gray-300 text-gray-400 bg-white hover:bg-gray-50"}`}>
        {/* phone with a slash through it */}
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={PHONE_OFF} />
          <line x1="3" y1="3" x2="21" y2="21" />
        </svg>
      </button>
    </div>
  );
}
