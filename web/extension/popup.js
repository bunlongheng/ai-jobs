const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function hostOf(u) { try { return new URL(u).host; } catch { return ""; } }
const coToken = (name) => {
  const t = (name || "").split(/[\s\/]/)[0].toLowerCase().replace(/[^a-z]/g, "");
  return t.length >= 3 ? t : ""; // 1-2 char tokens ("n/a") match everything - useless
};

let KITS = [];

async function init() {
  $("ver").textContent = "v" + chrome.runtime.getManifest().version;
  const st = $("status");
  const r = await send({ type: "kits" });
  if (!r?.ok) { st.textContent = "Server offline - run: python3 ~/Sites/jobs/jobfill/server.py"; return; }
  KITS = r.data;
  const tab = await activeTab();
  const tabHost = hostOf(tab?.url || ""), tabUrl = (tab?.url || "").toLowerCase();
  // Preselect the kit. IMPORTANT: shared ATS hosts (jobs.ashbyhq.com, boards.greenhouse.io,
  // jobs.lever.co) serve MANY companies under /<company>/, so a bare host match picks the
  // WRONG company's kit (whichever is first in the list). Match most-specific first:
  //   1. exact/prefix apply-URL match  2. company slug present in the tab URL path
  //   3. bare host, ONLY for company-owned career hosts (not a shared ATS).
  const SHARED_ATS = ["ashbyhq.com", "greenhouse.io", "lever.co", "myworkdayjobs.com", "icims.com", "workable.com", "smartrecruiters.com"];
  const norm = (u) => (u || "").toLowerCase().split("?")[0].replace(/\/application\/?$/, "").replace(/\/$/, "");
  const isShared = (h) => SHARED_ATS.some((d) => h.endsWith(d));
  const hit =
    KITS.find((k) => k.url && norm(k.url) && (norm(tabUrl) === norm(k.url) || norm(tabUrl).startsWith(norm(k.url) + "/"))) ||
    KITS.find((k) => coToken(k.company) && tabUrl.includes(coToken(k.company))) ||
    KITS.find((k) => k.url && tabHost && hostOf(k.url) === tabHost && !isShared(tabHost));
  const via = hit
    ? (norm(tabUrl) === norm(hit.url) || norm(tabUrl).startsWith(norm(hit.url) + "/") ? "url"
       : coToken(hit.company) && tabUrl.includes(coToken(hit.company)) ? "company" : "host")
    : null;
  // Auto-detected -> lock it in (read-only chip, no dropdown to fiddle with, just Fill).
  // No confident match -> fall back to a picker so you are never stuck.
  const box = $("kitbox");
  if (hit) {
    box.innerHTML =
      `<input type="hidden" id="kit" value="${hit.id}">` +
      `<div style="padding:6px 9px;border:1px solid #16a34a;background:#f0fdf4;border-radius:6px;font-weight:400;color:#166534;font-size:9px;">${hit.company || "?"} - ${hit.title || hit.id}</div>`;
    st.textContent = "";
  } else {
    box.innerHTML =
      `<select id="kit">${KITS.map((k) => `<option value="${k.id}">${k.score ?? "-"} | ${k.company || "?"} - ${(k.title || k.id).slice(0, 40)}</option>`).join("")}</select>` +
      `<div style="color:#b91c1c;font-size:11px;margin-top:2px;">No auto-match - pick the right kit.</div>`;
    st.textContent = "";
  }
}

let lastRun = null;

function kitMismatchWarning(kitId, tabUrl) {
  const kit = KITS.find((k) => k.id === kitId);
  const tok = coToken(kit?.company);
  return tok && !tabUrl.toLowerCase().includes(tok)
    ? ` !! CHECK KIT: "${kit.company}" not in this page URL !!` : "";
}

$("fill").onclick = async () => {
  const st = $("status");
  const kitId = $("kit").value;
  if (!kitId) { st.textContent = "No kit selected"; return; }
  const tab = await activeTab();
  const warn = kitMismatchWarning(kitId, tab?.url || "");
  if (warn) {
    const kit = KITS.find((k) => k.id === kitId);
    if (!window.confirm(`Selected kit is "${kit?.company}" but this page URL doesn't mention it.\n\nFill anyway with the ${kit?.company} kit?`)) {
      st.textContent = "Aborted - pick the right kit in the dropdown."; return;
    }
  }
  st.textContent = "Loading kit data..." + warn;
  const [prof, resume, cover, rules] = await Promise.all([
    send({ type: "profile" }), send({ type: "resume", id: kitId }),
    send({ type: "cover", id: kitId }), send({ type: "rules" }),
  ]);
  if (!prof?.ok || !resume?.ok) { st.textContent = "Server error: " + (prof?.error || resume?.error); return; }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] });
  } catch (e) {}

  let frames = [{ frameId: 0 }];
  try { frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) || frames; } catch (e) {}

  const data = { kitId, profile: prof.data, resumeB64: resume.data, cover: cover?.data || "", rules: rules?.data || [] };
  const merged = [];
  let framesSeen = 0, inputsSeen = 0, fi = 0;
  for (const f of frames) {
    fi++;
    st.textContent = `Filling frame ${fi}/${frames.length}... (big forms can take a bit)` + warn;
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: "jobfill:fill", data }, { frameId: f.frameId });
      if (!resp?.ok) continue;
      framesSeen++;
      inputsSeen += resp.meta?.inputs || 0;
      if (resp.report?.length) merged.push(...resp.report);
    } catch (e) {}
  }

  lastRun = { kitId, url: tab.url, frames: `${framesSeen}/${frames.length}`, inputsSeen, report: merged };
  const manual = merged.filter(([, v]) => String(v).startsWith("MANUAL"));
  if (!merged.length) {
    st.textContent = `No form found. Frames: ${framesSeen}/${frames.length}, inputs: ${inputsSeen}. Open the Apply form, then Fill.` + warn;
    return;
  }
  // summary: counts by field type
  const byType = {};
  merged.forEach((r) => { const t = r[2] || "?"; byType[t] = (byType[t] || 0) + 1; });
  const chip = (val, label, bg, fg) => `<span style="display:inline-block;margin:0 4px 4px 0;padding:2px 8px;border-radius:6px;background:${bg};color:${fg};font-size:11px;font-weight:700;white-space:nowrap">${val} ${label}</span>`;
  const typeChips = Object.entries(byType).map(([t, n]) =>
    `<span style="display:inline-block;margin:0 4px 4px 0;padding:2px 7px;border-radius:6px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:600;white-space:nowrap">${n} ${t}</span>`).join("");
  st.innerHTML =
    `<div>` +
      chip(merged.length - manual.length, "filled", "#dcfce7", "#166534") +
      chip(manual.length, "need you", manual.length ? "#fee2e2" : "#f1f5f9", manual.length ? "#b91c1c" : "#9ca3af") +
      chip(merged.length, "fields", "#e0f2fe", "#075985") +
    `</div>` +
    `<div style="margin-top:1px">${typeChips}</div>` +
    `<div style="color:#6b7280;font-size:11px;margin-top:3px">Review, captcha, Submit.${warn}</div>`;
  $("copy").style.display = "block"; // report button only appears after a fill run
  $("report").innerHTML = merged.map((row) => {
    const [k, v, t, opts] = row;
    const bad = String(v).startsWith("MANUAL");
    // Only show the other options for RED fields (helps you pick). On a field that
    // filled fine it is just noise, so hide it. (owner request 2026-08-04)
    const optLine = bad && opts?.length
      ? `<div style="color:#9ca3af;font-size:11px;padding-left:44px">${opts.join(" | ").slice(0, 120)}</div>` : "";
    return `<div class="row"><span class="badge">${t || "?"}</span>` +
      `<span class="${bad ? "manual" : "ok"}">${v}</span> - ${k}${optLine}</div>`;
  }).join("");
};

$("copy").onclick = async () => {
  const tab = await activeTab();
  const ver = chrome.runtime.getManifest().version;
  let payload;
  if (lastRun) {
    const reds = lastRun.report
      .filter(([, v]) => String(v).startsWith("MANUAL"))
      .map(([label, value, type, options]) => ({ label, issue: value, type: type || "?", options: options || [] }));
    const byType = {};
    lastRun.report.forEach((r) => { const t = r[2] || "?"; byType[t] = (byType[t] || 0) + 1; });
    payload = {
      version: ver, kitId: lastRun.kitId, url: lastRun.url, frames: lastRun.frames,
      field_types: byType, filled_ok: lastRun.report.length - reds.length,
      errors: reds.length ? reds : "NONE - all green",
    };
  } else {
    payload = { version: ver, kitId: $("kit").value, url: tab?.url, note: "no fill run yet in this popup session" };
  }
  await navigator.clipboard.writeText(JSON.stringify(payload, null, 1));
  $("status").textContent = "Typed errors-only report copied - paste it to Claude.";
};

init();
