"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./Toast";

// Shown in the "Email to recruiter" panel when the posting left no address. One click asks Hunter.io
// for the best contact email at the company, caches it on the row, and refreshes so the To: field +
// Gmail compose fill in. Free-tier friendly (one search per click, cached after). (owner 2026-08-08)
export default function FindEmailButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/jobfill/find-email/${id}`, { method: "POST" }).then((x) => x.json());
      if (r.ok) {
        toast(`Found ${r.email}${r.confidence ? ` (${r.confidence}% match)` : ""}`, "#16a34a");
        router.refresh();
      } else if (r.error === "no-key") {
        toast("Add HUNTER_API_KEY to web/.env.local first", "#dc2626");
      } else {
        toast(`No email found - ${r.error || "nothing at this domain"}`, "#d97706");
      }
    } catch {
      toast("Could not reach the email finder", "#dc2626");
    } finally {
      setBusy(false);
    }
  }
  // Last resort - spends 1 of the 50 free Hunter searches/month, so it is styled as a quiet
  // outline (LinkedIn is the free first try) and names its cost. (owner rule 2026-08-08)
  return (
    <button onClick={go} disabled={busy}
      title="Last resort - uses 1 of your 50 free Hunter searches this month. Try LinkedIn first."
      className="shrink-0 text-[11px] font-bold text-indigo-600 bg-white border border-indigo-300 hover:bg-indigo-50 disabled:opacity-60 rounded px-2.5 py-1 inline-flex items-center gap-1">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={busy ? "animate-spin" : ""}>
        {busy ? <path d="M21 12a9 9 0 1 1-6.2-8.5" /> : <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>}
      </svg>
      {busy ? "Searching..." : "Hunter (1 search)"}
    </button>
  );
}
