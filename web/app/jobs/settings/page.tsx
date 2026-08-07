import Link from "next/link";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

// Settings: a transparent view of every scheduled automation behind the job hunt - what runs,
// WHEN, by what mechanism (LaunchAgent), which script, and whether it's loaded. Read live from
// ~/Library/LaunchAgents so it always reflects reality. (owner request 2026-08-06)
const LA_DIR = path.join(os.homedir(), "Library/LaunchAgents");

// Consistent header icons (same look as the job detail page). White stroke, 15px.
function HIcon({ d }: { d: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white shrink-0" aria-hidden><path d={d} /></svg>;
}
// Human descriptions + gradient + icon per known job (plists don't self-describe).
const INFO: Record<string, { what: string; tokens: string; grad: string; icon: string }> = {
  "com.bheng.jobs": { what: "Jobs web app + JobFill API - always-on service on :3017", tokens: "none", grad: "from-slate-600 to-slate-800", icon: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01" },
  "com.bheng.linkedin-search": { what: "Scrapes new LinkedIn/Indeed matches onto the board", tokens: "none (keyword scrape + rule scoring)", grad: "from-blue-500 to-blue-700", icon: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" },
  "com.bheng.jobs-backup": { what: "Backs up jobs.db to a timestamped copy", tokens: "none", grad: "from-amber-500 to-orange-600", icon: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" },
  "com.bheng.jobs-prescan": { what: "Headless-prescans the Not-ready pile (Not ready → Ready), 2 lanes", tokens: "none (browser automation, no AI)", grad: "from-green-600 to-emerald-700", icon: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0" },
};

function pick(xml: string, key: string): string {
  const m = xml.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return m ? m[1] : "";
}
function schedule(xml: string): string {
  const times: string[] = [];
  const cal = xml.match(/<key>StartCalendarInterval<\/key>\s*<array>([\s\S]*?)<\/array>/) || xml.match(/<key>StartCalendarInterval<\/key>\s*(<dict>[\s\S]*?<\/dict>)/);
  if (cal) {
    for (const d of cal[1].match(/<dict>[\s\S]*?<\/dict>/g) || [cal[1]]) {
      const h = d.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/);
      const mn = d.match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/);
      if (h) times.push(`${String(h[1]).padStart(2, "0")}:${String(mn ? mn[1] : "00").padStart(2, "0")}`);
    }
  }
  if (times.length) return `Daily at ${times.join(" + ")}`;
  const iv = xml.match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/);
  if (iv) return `Every ${Math.round(Number(iv[1]) / 60)} min`;
  if (/<key>KeepAlive<\/key>\s*<(true|dict)/.test(xml) || /<key>RunAtLoad<\/key>\s*<true/.test(xml)) return "Always-on service";
  return "On demand";
}
function script(xml: string): string {
  const args = (xml.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1].match(/<string>([^<]*)<\/string>/g) || [])
    .map((s) => s.replace(/<\/?string>/g, ""));
  return args.find((a) => /\.(sh|mjs|js)$/.test(a)) || args.slice(1).join(" ") || args[0] || "-";
}

export default function Settings() {
  let loaded = new Set<string>();
  try { loaded = new Set(execSync("launchctl list", { encoding: "utf8" }).split("\n").map((l) => l.trim().split(/\s+/).pop() || "")); } catch { /* n/a */ }

  const labels = ["com.bheng.jobs", "com.bheng.linkedin-search", "com.bheng.jobs-backup", "com.bheng.jobs-prescan"];
  const rows = labels.map((label) => {
    const p = path.join(LA_DIR, `${label}.plist`);
    let xml = "";
    try { xml = fs.readFileSync(p, "utf8"); } catch { /* not installed */ }
    const scriptPath = xml ? script(xml) : "-";
    const log = xml ? pick(xml, "StandardOutPath") : "";
    let logAge = "";
    try { if (log) { const st = fs.statSync(log); logAge = new Date(st.mtime).toISOString().slice(0, 16).replace("T", " "); } } catch { /* no log */ }
    return {
      label, installed: !!xml, running: loaded.has(label),
      what: INFO[label]?.what || "-", tokens: INFO[label]?.tokens || "-",
      grad: INFO[label]?.grad || "from-gray-500 to-gray-700", icon: INFO[label]?.icon || "",
      when: xml ? schedule(xml) : "not installed", script: scriptPath,
      exists: scriptPath !== "-" && (() => { try { return fs.existsSync(scriptPath); } catch { return false; } })(),
      lastLog: logAge,
    };
  });

  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]">
      <div className="max-w-[920px] mx-auto px-5 py-7 pb-16">
        <Link href="/jobs" className="text-xs text-blue-700 no-underline">&larr; board</Link>
        <h1 className="text-[16px] font-medium text-gray-800 mt-2 mb-0.5">Settings - scheduled automations</h1>
        <p className="text-[12px] text-gray-500 mb-5">Everything the job hunt runs on its own, read live from macOS LaunchAgents. All background jobs cost 0 AI tokens (only writing brand-new kits uses AI, and that stays manual).</p>

        <div>
          {rows.map((r) => (
            <div key={r.label} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-3.5">
              <div className={`bg-gradient-to-r ${r.grad} px-4 py-2.5 flex items-center justify-between gap-2`}>
                <h2 className="text-sm text-white tracking-wide flex items-center gap-2">{r.icon ? <HIcon d={r.icon} /> : null}{r.what}</h2>
                <span className="text-[11px] font-semibold text-white bg-white/25 rounded-full px-2.5 py-0.5 shrink-0 whitespace-nowrap">{r.when}</span>
              </div>
              <table className="w-full text-[13px] border-collapse">
                <tbody>
                  <tr className="border-t border-gray-100"><td className="px-4 py-1.5 pr-3 text-gray-400 w-[22%]">Status</td><td className="px-4 py-1.5"><span className={`inline-flex items-center gap-1.5 ${r.running ? "text-green-600" : r.installed ? "text-amber-600" : "text-gray-400"}`}><span className={`inline-block w-2 h-2 rounded-full ${r.running ? "bg-green-500" : r.installed ? "bg-amber-400" : "bg-gray-300"}`} />{r.running ? "loaded & active" : r.installed ? "installed (not loaded)" : "not installed"}</span></td></tr>
                  <tr className="border-t border-gray-100"><td className="px-4 py-1.5 pr-3 text-gray-400">Label</td><td className="px-4 py-1.5 text-gray-700 font-mono">{r.label}</td></tr>
                  <tr className="border-t border-gray-100"><td className="px-4 py-1.5 pr-3 text-gray-400">Mechanism</td><td className="px-4 py-1.5 text-gray-700">macOS LaunchAgent</td></tr>
                  <tr className="border-t border-gray-100"><td className="px-4 py-1.5 pr-3 text-gray-400">Script</td><td className="px-4 py-1.5 text-gray-700 font-mono break-all">{r.script} {r.exists ? "" : <span className="text-red-500">(missing)</span>}</td></tr>
                  <tr className="border-t border-gray-100"><td className="px-4 py-1.5 pr-3 text-gray-400">Tokens</td><td className="px-4 py-1.5 text-gray-700">{r.tokens}</td></tr>
                  {r.lastLog ? <tr className="border-t border-gray-100"><td className="px-4 py-1.5 pr-3 text-gray-400">Last activity</td><td className="px-4 py-1.5 text-gray-700">{r.lastLog}</td></tr> : null}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
