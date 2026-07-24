"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 5s auto-refresh + pull-down-to-refresh (works in Add-to-Home-Screen mode
 *  where Safari's native pull is disabled). */
export default function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, ms);
    let startY = 0, pulling = false;
    const down = (e: TouchEvent) => { if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; } };
    const move = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 70) { pulling = false; document.body.style.opacity = "0.5"; window.location.reload(); }
    };
    const up = () => { pulling = false; };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up, { passive: true });
    return () => { clearInterval(t); window.removeEventListener("touchstart", down); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); };
  }, [router, ms]);
  return null;
}
