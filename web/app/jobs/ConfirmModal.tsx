"use client";
import { useEffect, useState } from "react";

// One uniform confirm dialog for the whole board - replaces the ugly native
// window.confirm() browser box. Any client island calls `await confirmDialog({...})`
// and gets a boolean back, exactly like toast() but with a resolve. Mounted once in
// the jobs layout so it's identical on the board and the detail page. (owner request 2026-08-05)
type Opts = { title: string; body?: string; confirmLabel?: string; cancelLabel?: string; tone?: "danger" | "primary" };
type Pending = Opts & { id: number; resolve: (ok: boolean) => void };

export function confirmDialog(opts: Opts): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent("jobs-confirm", { detail: { opts, resolve } }));
  });
}

export default function ConfirmModal() {
  const [p, setP] = useState<Pending | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { opts, resolve } = (e as CustomEvent).detail || {};
      setP({ id: Date.now() + Math.random(), resolve, ...opts });
    };
    window.addEventListener("jobs-confirm", handler as EventListener);
    return () => window.removeEventListener("jobs-confirm", handler as EventListener);
  }, []);

  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  function close(ok: boolean) {
    if (!p) return;
    p.resolve(ok);
    setP(null);
  }

  if (!p) return null;
  const danger = (p.tone ?? "danger") === "danger";
  const accent = danger ? "#ef4444" : "#2563eb";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif", background: "rgba(15,23,42,0.34)", backdropFilter: "blur(3px)", animation: "jobsModalBg 0.18s ease-out" }}
      onClick={() => close(false)}
    >
      <div
        key={p.id}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-2xl bg-white p-6 text-center"
        style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.28)", animation: "jobsModalIn 0.24s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <span
          className="mx-auto mb-4 flex items-center justify-center rounded-full"
          style={{ width: 52, height: 52, background: `${accent}1a` }}
        >
          {danger ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><circle cx="12" cy="16.5" r="0.6" fill={accent} /></svg>
          )}
        </span>
        <h2 className="text-[19px] font-bold text-gray-900 leading-snug">{p.title}</h2>
        {p.body ? <p className="mt-2 text-[14px] leading-relaxed text-gray-500">{p.body}</p> : null}
        <div className="mt-6 flex gap-2.5">
          <button
            onClick={() => close(false)}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[14px] font-bold text-gray-600 transition-colors hover:bg-gray-50"
          >
            {p.cancelLabel || "Cancel"}
          </button>
          <button
            autoFocus
            onClick={() => close(true)}
            className="flex-1 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: accent, boxShadow: `0 8px 22px ${accent}55` }}
          >
            {p.confirmLabel || "Delete"}
          </button>
        </div>
      </div>
      <style>{`@keyframes jobsModalBg{from{opacity:0}to{opacity:1}}@keyframes jobsModalIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  );
}
