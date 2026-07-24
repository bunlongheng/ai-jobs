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
  const sel = $("kit");
  sel.innerHTML = KITS.map((k) =>
    `<option value="${k.id}">${k.score ?? "-"} | ${k.company || "?"} - ${(k.title || k.id).slice(0, 40)}</option>`).join("");
  // preselect: URL host match, else company-name token in the tab URL
  const hit = KITS.find((k) => k.url && tabHost && hostOf(k.url) === tabHost) ||
              KITS.find((k) => coToken(k.company) && tabUrl.includes(coToken(k.company)));
  if (hit) sel.value = hit.id;
  st.textContent = `${KITS.length} kits loaded${hit ? " - matched: " + (hit.company || hit.id) : " - SELECT KIT MANUALLY"}`;
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
  const typeLine = Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(", ");
  st.innerHTML = `<b>${merged.length} fields</b> (${typeLine})<br>` +
    `<span style="color:#059669">${merged.length - manual.length} filled</span> / ` +
    `<span style="color:#dc2626">${manual.length} need you</span>. Review, captcha, Submit.${warn}`;
  $("report").innerHTML = merged.map((row) => {
    const [k, v, t, opts] = row;
    const bad = String(v).startsWith("MANUAL");
    const optLine = opts?.length
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

$("submitted").onclick = async () => {
  const kitId = $("kit").value;
  const tab = await activeTab();
  const r = await send({ type: "event", data: { id: kitId, outcome: "submitted", url: tab?.url || "", manual: true } });
  $("status").textContent = r?.ok ? "Tracker updated: applied" : "Failed: " + r?.error;
};

init();
