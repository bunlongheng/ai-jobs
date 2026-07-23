"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-pull the server component every few seconds so submits (JobFill events)
 *  appear on the board without a manual reload. Local SQLite read - negligible cost. */
export default function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
