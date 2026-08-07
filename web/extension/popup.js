const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));
const BOARD_URL = "http://localhost:3017/jobs";

// Inline SVG icons (real icons, never emoji) reused across the rendered UI.
const IC = {
  check: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
  minus: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
  alert: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 15.6h.01"/></svg>',
  list: '<svg class="icon" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  briefcase: '<svg class="icon" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  chevR: '<svg class="icon chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  down: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v13M6 12l6 6 6-6"/></svg>',
  lines: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  clip: '<svg class="icon" viewBox="0 0 24 24"><path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3 3 0 0 1 4 4l-8.5 8.5a1 1 0 0 1-1.4-1.4L15 8"/></svg>',
};
const tGlyph = (t) => ({ text: '<span class="glyph">T</span>', textarea: IC.lines, dropdown: IC.down, choice: IC.check, file: IC.clip, skip: IC.minus }[t] || '<span class="glyph">?</span>');
const typeBadge = (t) => `<span class="tbadge">${tGlyph(t)}${t || "?"}</span>`;
const rowStatus = (bad, val) => bad
  ? `<span class="row-st st-manual">${IC.alert}</span>`
  : String(val).startsWith("skipped") ? `<span class="row-st st-skip">${IC.minus}</span>` : `<span class="row-st st-ok">${IC.check}</span>`;
const statCard = (cls, icon, n, label) => `<div class="stat ${cls}">${icon || ""}<div><b>${n}</b><span>${label}</span></div></div>`;
const openBoard = () => chrome.tabs.create({ url: BOARD_URL });

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
      `<div class="kit-chip">${IC.briefcase}<span class="kit-name">${hit.company || "?"} - ${hit.title || hit.id}</span>${IC.chevR}</div>`;
    st.textContent = "";
  } else {
    box.innerHTML =
      `<select id="kit">${KITS.map((k) => `<option value="${k.id}">${k.score ?? "-"} | ${k.company || "?"} - ${(k.title || k.id).slice(0, 40)}</option>`).join("")}</select>` +
      `<div class="kit-warn">No auto-match - pick the right kit.</div>`;
    st.textContent = "";
  }
  // header + footer icon buttons; gear -> settings page, others -> board; reload -> reload ext
  ["btn-help", "foot-link"].forEach((id) => { const el = $(id); if (el) el.onclick = (e) => { e.preventDefault(); openBoard(); }; });
  const sg = $("btn-settings"); if (sg) sg.onclick = () => chrome.tabs.create({ url: BOARD_URL.replace(/\/jobs$/, "/jobs/settings") });
  const rl = $("btn-reload"); if (rl) rl.onclick = () => chrome.runtime.reload();

  // Version freshness: compare the LOADED runtime version to the latest on-disk manifest.
  // Match -> subtle version pill. Stale -> red "(!)" + "reload" hint so you KNOW to reload.
  try {
    const loaded = chrome.runtime.getManifest().version;
    const latest = (await send({ type: "version" }))?.data?.version;
    const ver = $("ver");
    if (latest && latest !== loaded) {
      ver.textContent = `v${loaded} (!)`;
      ver.classList.add("stale");
      ver.title = `Outdated - latest is v${latest}. Click to reload.`;
      ver.style.cursor = "pointer";
      ver.onclick = () => chrome.runtime.reload();
      if (rl) rl.classList.add("stale");
    } else {
      ver.title = "Up to date";
    }
  } catch { /* server offline - leave the plain version */ }
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
  $("stats").innerHTML =
    statCard("green", IC.check, merged.length - manual.length, "filled") +
    statCard(manual.length ? "red" : "", manual.length ? IC.alert : IC.minus, manual.length, "need you") +
    statCard("blue", IC.list, merged.length, "fields") +
    Object.entries(byType).map(([t, n]) => statCard("mini", "", n, t)).join("");
  st.innerHTML = `<div class="review">${IC.check}Review, captcha, Submit.${warn}</div>`;
  $("copy").style.display = "flex"; // report button only appears after a fill run
  $("report").innerHTML = merged.map((row) => {
    const [k, v, t, opts] = row;
    const bad = String(v).startsWith("MANUAL");
    const optLine = bad && opts?.length
      ? `<div class="opts">${opts.join(" | ").slice(0, 120)}</div>` : "";
    return `<div class="row">${typeBadge(t)}` +
      `<span class="row-txt"><span class="val ${bad ? "manual" : "ok"}">${v}</span> <span class="lbl">- ${k}</span>${optLine}</span>` +
      `${rowStatus(bad, v)}</div>`;
  }).join("");
};

// Capture Q&A: harvest every question -> answer you filled on the page, copy it as clean
// text (paste straight to Claude) AND persist to jobfill/captured-answers.jsonl so Claude
// learns your answers for similar questions next time. (owner request 2026-08-05)
$("capture").onclick = async () => {
  const st = $("status");
  const tab = await activeTab();
  st.textContent = "Reading your answers...";
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] });
  } catch (e) {}
  let frames = [{ frameId: 0 }];
  try { frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) || frames; } catch (e) {}
  const answers = [];
  const seen = new Set();
  for (const f of frames) {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: "jobfill:capture" }, { frameId: f.frameId });
      for (const a of r?.answers || []) {
        const k = a.label.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        answers.push(a);
      }
    } catch (e) {}
  }
  if (!answers.length) { st.textContent = "No filled answers found on this page."; return; }

  const kitId = $("kit")?.value || "_capture";
  const kit = KITS.find((k) => k.id === kitId);
  const header = `# Captured Q&A${kit ? ` - ${kit.company || ""} ${kit.title || ""}`.trimEnd() : ""}\n${tab.url}\n`;
  const text = header + "\n" + answers.map((a) => `Q: ${a.label}\nA: ${a.value}`).join("\n\n") + "\n";
  await navigator.clipboard.writeText(text);

  // persist for Claude to learn from (best-effort; clipboard copy already succeeded)
  const saved = await send({ type: "event", data: { id: kitId, outcome: "captured_answers", url: tab.url, answers } });
  st.textContent = `Captured ${answers.length} Q&A - copied for Claude${saved?.ok ? " + saved to learn file" : ""}. Paste it to Claude.`;
  $("report").innerHTML = answers.map((a) =>
    `<div class="row">${typeBadge(a.type)}<span class="row-txt"><span class="val ok">${(a.value || "").slice(0, 80)}</span> <span class="lbl">- ${a.label}</span></span>${rowStatus(false, a.value)}</div>`).join("");
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
