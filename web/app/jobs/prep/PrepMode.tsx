"use client";
import { useEffect, useState } from "react";
import type { PrepCard } from "./page";

export default function PrepMode({ cards }: { cards: PrepCard[] }) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [shown, setShown] = useState(false);
  const [list, setList] = useState(false);

  const card = cards[order[pos]];
  const go = (d: number) => { setPos((p) => (p + d + order.length) % order.length); setShown(false); };
  const shuffle = () => {
    const o = [...order];
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    setOrder(o); setPos(0); setShown(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setShown((s) => !s); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "s" || e.key === "S") shuffle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const btn = "px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-gray-200 bg-white hover:bg-gray-50 text-gray-700";

  if (list) {
    return (
      <div>
        <div className="flex justify-end mb-3"><button className={btn} onClick={() => setList(false)}>Cards</button></div>
        <div className="grid gap-3">
          {cards.map((c, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
              <div className="text-[11px] text-gray-400 mb-1">Q{i + 1}</div>
              <div className="text-[14px] font-semibold text-gray-800 mb-2">{c.q}</div>
              <div className="text-[13px] text-[#1f2328] leading-relaxed">{c.a}</div>
              {c.tip && <div className="text-[12px] text-amber-700 mt-2">{c.tip}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] text-gray-500 font-mono">{pos + 1} / {order.length}</div>
        <div className="flex gap-2">
          <button className={btn} onClick={shuffle} title="S">Shuffle</button>
          <button className={btn} onClick={() => setList(true)}>List</button>
        </div>
      </div>
      <div className="h-1 bg-gray-200 rounded-full mb-5 overflow-hidden">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${((pos + 1) / order.length) * 100}%` }} />
      </div>

      <button
        onClick={() => setShown((s) => !s)}
        className="w-full text-left bg-white border border-gray-200 rounded-2xl shadow-sm px-6 py-8 min-h-[260px] cursor-pointer"
      >
        <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">Question {order[pos] + 1}</div>
        <div className="text-[22px] font-semibold text-gray-900 leading-snug mb-5">{card.q}</div>
        {shown ? (
          <>
            <div className="text-[16px] text-[#1f2328] leading-relaxed">{card.a}</div>
            {card.tip && <div className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-5">{card.tip}</div>}
          </>
        ) : (
          <div className="text-[13px] text-gray-400">Say it out loud, then tap to reveal.</div>
        )}
      </button>

      <div className="flex items-center justify-between mt-4">
        <button className={btn} onClick={() => go(-1)} title="Left arrow">&larr; Prev</button>
        <button className="px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-blue-600 text-white hover:bg-blue-700" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide answer" : "Show answer"}
        </button>
        <button className={btn} onClick={() => go(1)} title="Right arrow">Next &rarr;</button>
      </div>
    </div>
  );
}
