// JobFill background worker - the ONLY place that talks to the Jobs app API (localhost:3017/api/jobfill).
// (Content scripts can't cross-origin fetch in MV3; they message us instead.)
const BASE = "http://127.0.0.1:3017/api/jobfill";

async function getJSON(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

async function getResumeB64(id) {
  const r = await fetch(`${BASE}/kit/${encodeURIComponent(id)}/resume`);
  if (!r.ok) throw new Error(`resume -> HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function getCover(id) {
  const r = await fetch(`${BASE}/kit/${encodeURIComponent(id)}/cover`);
  return r.ok ? r.text() : "";
}

// ---- Claude command channel: poll the local server for queued commands ----
function hostOf(u) { try { return new URL(u).host; } catch { return ""; } }

// SAFETY: agent commands only touch job pages, never personal tabs (Gmail once).
function pageGuard(tab) {
  const u = (tab?.url || "").toLowerCase();
  const jobish = /greenhouse|ashby|lever\.co|workday|jobvite|smartrecruiters|icims|indeed\.com|myworkday|phenom|unitedhealthgroup|jobs\.|\/job\b|\/jobs|careers|\/apply|job-boards|dropbox\.jobs/.test(u);
  const personal = /mail\.google|calendar\.google|docs\.google|drive\.google|github\.com|localhost|chrome:/.test(u);
  if (!tab) return "no active tab";
  if (!jobish || personal) return "active tab is not a job page: " + u.slice(0, 60);
  return null;
}

let lastOpenedTabId = null; // set by the open command; audit/read prefer it

async function settledTab() {
  // prefer the tab WE opened (Chrome may not be the focused app mid-automation),
  // and wait for it to finish loading before judging or enumerating it.
  for (let i = 0; i < 25; i++) {
    let tab = null;
    if (lastOpenedTabId) tab = await chrome.tabs.get(lastOpenedTabId).catch(() => null);
    if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) [tab] = await chrome.tabs.query({ active: true });
    if (tab && tab.status === "complete" && (tab.url || "")) return tab;
    await new Promise((r) => setTimeout(r, 800));
  }
  const [tab] = await chrome.tabs.query({ active: true });
  return tab;
}

async function findJobTab() {
  // Locate an OPEN application tab even when the user has switched away (they may
  // be on Xmind/Slack). Prefer the tab we opened, else any job-ish tab.
  const all = await chrome.tabs.query({}).catch(() => []);
  if (lastOpenedTabId) {
    const t = all.find((x) => x.id === lastOpenedTabId && !pageGuard(x));
    if (t) return t;
  }
  const apply = all.find((x) => /\/apply|greenhouse|lever\.co|ashby|myworkday|jobs\.|\.jobs\//.test((x.url || "").toLowerCase()) && !pageGuard(x));
  return apply || all.find((x) => !pageGuard(x)) || null;
}

async function activeJobTab() {
  let tab = await settledTab();
  if (!tab || pageGuard(tab)) tab = await findJobTab();  // fall back to any open job tab
  const err = pageGuard(tab);
  return err ? { err } : { tab };
}

async function doClick(text, tabId) {
  // Click a single control by its visible text (job pages only). Used to open
  // wizard sub-forms ("Add") and step through pages ("Save & Continue"). Never
  // clicks a final Submit unless the text explicitly asks for it.
  let tab = tabId ? await waitComplete(tabId) : null;
  if (!tab || pageGuard(tab)) { const r = await activeJobTab(); if (r.err) return { ok: false, error: r.err }; tab = r.tab; }
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    args: [String(text || "")],
    func: (want) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
      const w = norm(want);
      const els = [...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')];
      const hit = els.find((e) => norm(e.innerText || e.value) === w)
               || els.find((e) => norm(e.innerText || e.value).includes(w) && w.length >= 3);
      if (!hit) return { clicked: false };
      hit.scrollIntoView({ block: "center" });
      hit.click();
      return { clicked: true, label: norm(hit.innerText || hit.value).slice(0, 40) };
    },
  }).then((r) => r.filter((x) => x?.result?.clicked)).catch(() => []);
  return res ? { ok: true, clicked: res.result } : { ok: true, clicked: false };
}

async function doSetFields(pairs, tabId) {
  // Fill specific fields by label substring with explicit values (wizard modals
  // the rule-based fill can't classify). Read-only-safe: only fills EMPTY fields,
  // never clicks anything. pairs = [{label, value}].
  let tab = tabId ? await waitComplete(tabId) : null;
  if (!tab || pageGuard(tab)) { const r = await activeJobTab(); if (r.err) return { ok: false, error: r.err }; tab = r.tab; }
  const results = [];
  for (const f of tab ? [{ frameId: 0 }].concat(
      (await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => [])) || []) : []) {
    try {
      const [r] = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [f.frameId] },
        args: [pairs],
        func: (pairs) => {
          const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
          const setNative = (el, val) => {
            const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, "value").set.call(el, val);
            ["input", "change", "blur"].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
          };
          const labelOf = (el) => {
            if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return l.textContent; }
            const w = el.closest("label"); if (w) return w.textContent;
            return el.getAttribute("aria-label") || el.placeholder || el.name || "";
          };
          const out = [];
          for (const { label, value } of pairs) {
            const want = norm(label);
            const el = [...document.querySelectorAll("input,textarea,select")]
              .filter((e) => e.offsetParent && e.type !== "hidden" && !e.value)
              .find((e) => norm(labelOf(e)).includes(want));
            if (!el) continue;
            if (el.tagName === "SELECT") {
              const o = [...el.options].find((o) => norm(o.text).includes(norm(value)));
              if (o) { el.value = o.value; el.dispatchEvent(new Event("change", { bubbles: true })); out.push(label); }
            } else { setNative(el, String(value)); out.push(label); }
          }
          return out;
        },
      });
      if (r?.result?.length) results.push(...r.result);
    } catch (e) {}
  }
  return { ok: true, filled: results };
}

async function doRead() {
  const { tab, err } = await activeJobTab();
  if (err) return { ok: false, error: err };
  const [r] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ title: document.title, url: location.href,
      text: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 6000) }),
  });
  return { ok: true, ...r.result };
}

async function enumerateFields(tabId) {
  try { await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] }); } catch (e) {}
  let frames = [{ frameId: 0 }];
  try { frames = (await chrome.webNavigation.getAllFrames({ tabId })) || frames; } catch (e) {}
  const fields = [];
  for (const f of frames) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { type: "jobfill:audit" }, { frameId: f.frameId });
      if (r?.fields) fields.push(...r.fields);
    } catch (e) {}
  }
  return fields;
}

async function waitComplete(tabId) {
  for (let i = 0; i < 15; i++) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (t && t.status === "complete") return t;
    await new Promise((r) => setTimeout(r, 800));
  }
  return chrome.tabs.get(tabId).catch(() => null);
}

async function doAudit(kitId, explicitTabId) {
  // Prefer an explicit tabId (from the open command's result) - survives the MV3
  // service-worker restart that wipes lastOpenedTabId between commands.
  let tab = null;
  if (explicitTabId) {
    tab = await waitComplete(explicitTabId);
    if (tab && pageGuard(tab)) tab = null;
  }
  if (!tab) {
    const r = await activeJobTab();
    if (r.err) return { ok: false, error: r.err };
    tab = r.tab;
  }
  await new Promise((r) => setTimeout(r, 2500)); // JS-rendered forms settle after load
  let tabId = tab.id;
  // nudge lazy/virtualized forms to mount by scrolling the page once
  try { await chrome.scripting.executeScript({ target: { tabId, allFrames: true },
    func: () => { window.scrollTo(0, document.body.scrollHeight); window.scrollTo(0, 0); } }); } catch (e) {}
  let fields = [];
  for (let i = 0; i < 3 && fields.length < 4; i++) {  // retry: SPA fields can mount late
    if (i) await new Promise((r) => setTimeout(r, 2000));
    fields = await enumerateFields(tabId);
  }
  // Listing pages hide the form behind an Apply button - click ONLY an
  // apply-labeled control (never Submit) to reveal it, then re-enumerate.
  if (fields.length < 4) {
    const clicked = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const c = [...document.querySelectorAll("a,button")].find((e) =>
          /^(apply( now| today| for this (job|role|position))?)$/i.test((e.innerText || "").replace(/\s+/g, " ").trim()));
        if (c) { c.click(); return true; }
        return false;
      },
    }).then((r) => r?.[0]?.result).catch(() => false);
    if (clicked) {
      await new Promise((r) => setTimeout(r, 1500));
      // the click may navigate this tab OR open a new one - follow whichever is live
      const [maybeNew] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
      if (maybeNew && maybeNew.id !== tabId && !pageGuard(maybeNew)) { tabId = maybeNew.id; lastOpenedTabId = tabId; }
      await waitComplete(tabId);
      await new Promise((r) => setTimeout(r, 2500));
      fields = await enumerateFields(tabId);
    }
  }
  const finalTab = await chrome.tabs.get(tabId).catch(() => tab);
  return { ok: true, kitId: kitId || null, url: finalTab?.url, title: finalTab?.title, fields };
}

async function doFill(kitId, overwrite, tabId) {
  // Resolve the target tab: explicit tabId -> located job tab -> active tab.
  let tab = tabId ? await waitComplete(tabId) : null;
  if (!tab || pageGuard(tab)) { const r = await activeJobTab(); if (r.err) return { ok: false, error: r.err }; tab = r.tab; }
  if (!kitId) {
    const kits = await getJSON("/kits");
    const th = hostOf(tab.url || "");
    kitId = kits.find((k) => k.url && hostOf(k.url) === th)?.id;
  }
  if (!kitId) return { ok: false, error: "no kit matched to this tab" };
  const [profile, resumeB64, cover, rules] = await Promise.all([
    getJSON("/profile"), getResumeB64(kitId), getCover(kitId), getJSON("/rules"),
  ]);
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] }); } catch (e) {}
  let frames = [{ frameId: 0 }];
  try { frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) || frames; } catch (e) {}
  const data = { kitId, profile, resumeB64, cover, rules, overwrite: overwrite || [] };
  let fields = 0;
  for (const f of frames) {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: "jobfill:fill", data }, { frameId: f.frameId });
      if (r?.report) fields += r.report.length;
    } catch (e) {}
  }
  return { ok: true, kitId, fields };
}

async function pollCommands() {
  try {
    const cmds = await getJSON("/commands/poll");
    for (const c of cmds || []) {
      let result = {};
      if (c.action === "fill") result = await doFill(c.kitId, c.overwrite, c.tabId);
      else if (c.action === "ping") result = { ok: true, pong: true };
      else if (c.action === "open") {
        const u = String(c.url || "");
        result = /^https?:\/\//.test(u)
          ? await chrome.tabs.create({ url: u, active: true }).then((t) => { lastOpenedTabId = t.id; return { ok: true, tabId: t.id }; })
          : { ok: false, error: "bad url" };
      }
      else if (c.action === "read") result = await doRead();
      else if (c.action === "audit") result = await doAudit(c.kitId, c.tabId);
      else if (c.action === "click") result = await doClick(c.text, c.tabId);
      else if (c.action === "setfields") result = await doSetFields(c.pairs || [], c.tabId);
      else if (c.action === "reload") {
        // ack first (we die immediately after), then self-update from disk
        await fetch(BASE + "/event", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: "_channel", outcome: "command_result", command: c, result: { ok: true, reloading: true } }) });
        chrome.runtime.reload();
        return;
      }
      else result = { ok: false, error: "unknown action " + c.action };
      await fetch(BASE + "/event", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.kitId || "_channel", outcome: "command_result", command: c, result }),
      });
    }
  } catch (e) { /* server down - quiet */ }
}
setInterval(pollCommands, 5000);
chrome.alarms.create("jobfill-poll", { periodInMinutes: 0.5 }); // revives the sleeping worker
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "jobfill-poll") pollCommands(); });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "profile") sendResponse({ ok: true, data: await getJSON("/profile") });
      else if (msg.type === "rules") sendResponse({ ok: true, data: await getJSON("/rules") });
      else if (msg.type === "kits") sendResponse({ ok: true, data: await getJSON("/kits") });
      else if (msg.type === "resume") sendResponse({ ok: true, data: await getResumeB64(msg.id) });
      else if (msg.type === "cover") sendResponse({ ok: true, data: await getCover(msg.id) });
      else if (msg.type === "event") {
        const r = await fetch(BASE + "/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg.data),
        });
        sendResponse({ ok: r.ok, data: await r.json() });
      } else sendResponse({ ok: false, error: "unknown message" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // async response
});
