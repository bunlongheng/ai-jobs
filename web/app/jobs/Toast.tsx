"use client";
import { useEffect, useState } from "react";

// Cute top-center pill toast, styled after the Stickies app. Any client island fires it
// via toast(msg, color); this component (mounted once on the board) renders it and
// auto-dismisses. (owner request 2026-08-05)
export function toast(msg: string, color = "#16a34a") {
  window.dispatchEvent(new CustomEvent("jobs-toast", { detail: { msg, color } }));
}

type T = { id: number; msg: string; color: string };

export default function Toast() {
  const [t, setT] = useState<T | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      setT({ id: Date.now() + Math.random(), msg: d.msg || "Done", color: d.color || "#16a34a" });
      clearTimeout(timer);
      timer = setTimeout(() => setT(null), 2400);
    };
    window.addEventListener("jobs-toast", handler as EventListener);
    return () => { window.removeEventListener("jobs-toast", handler as EventListener); clearTimeout(timer); };
  }, []);
  if (!t) return null;
  return (
    <div className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 pointer-events-none">
      <div
        key={t.id}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white"
        style={{ background: t.color, border: `1px solid ${t.color}`, boxShadow: `0 8px 26px ${t.color}66`, animation: "jobsToastIn 0.28s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.14)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </span>
        <span className="font-bold tracking-tight text-[12px] leading-snug max-w-[240px] break-words text-center">{t.msg}</span>
      </div>
      <style>{`@keyframes jobsToastIn{from{opacity:0;transform:translateY(-14px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  );
}
