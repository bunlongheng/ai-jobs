"use client";
import { createContext, useContext, useState } from "react";

// Click a recruiter card to spotlight it: that card lifts and slightly scales up, every OTHER
// card dims + blurs. Click it again (or click another card) to move the focus. One focus at a
// time, shared across all cards via context. When a card is focused, the "Say on the call" pitch
// opens (PhonePitch consumes this context). (owner request 2026-08-10)
const Ctx = createContext<{ focused: string | null; setFocused: (id: string | null) => void }>({ focused: null, setFocused: () => {} });

export function useFocus() { return useContext(Ctx); }

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [focused, setFocused] = useState<string | null>(null);
  return (
    <Ctx.Provider value={{ focused, setFocused }}>
      {children}
      {/* One dark scrim over the WHOLE site while a card is focused; the focused card is lifted above
          it (z-40) so only it stays lit. Click the scrim to release. No size/scale change to cards. */}
      {focused !== null ? (
        <div onClick={() => setFocused(null)} aria-hidden
          className="fixed inset-0 z-30 bg-black/60 transition-opacity duration-300" />
      ) : null}
    </Ctx.Provider>
  );
}

export function FocusCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { focused, setFocused } = useContext(Ctx);
  const active = focused === id;
  // Lift the focused card above the site-wide scrim; leave its size/shape untouched.
  return (
    <div onClick={() => setFocused(active ? null : id)} className={`cursor-pointer ${active ? "relative z-40" : ""}`}>
      {children}
    </div>
  );
}
