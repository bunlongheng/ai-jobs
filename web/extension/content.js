// JobFill content script v5 - runs in EVERY frame (top page + ATS iframes).
// v5: escalating menu-open (mouse -> ArrowDown -> indicator), async-API polling
// for autocomplete fields (school), post-pick verification, and self-diagnostics:
// any combobox it fails to fill dumps its HTML to the server (ext-events.jsonl)
// so the selectors can be fixed from evidence instead of guesses.
// Conservative: unverified fields are CLEARED and flagged MANUAL. Never submits.
(() => {
  if (window.__jobfill_v22) return;
  window.__jobfill_v22 = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Easy Apply beacon: on LinkedIn/Indeed job pages (logged in), report whether the
  // Easy/Quick Apply button exists - ALWAYS report (found true or false) so the scan
  // can tell "checked, not easy" apart from "not yet checked".
  if (/linkedin\.com\/jobs\/view|indeed\.com\/viewjob/.test(location.href)) {
    setTimeout(() => {
      try {
        const txt = [...document.querySelectorAll("button, a")].map((b) => (b.textContent || "").trim().toLowerCase());
        const found = txt.some((t) => t === "easy apply" || t.startsWith("easily apply"));
        chrome.runtime.sendMessage({ type: "event", data: { id: "_meta", outcome: "easy_apply_detected", url: location.href, found } });
      } catch (_) {}
    }, 3500);

    // Native Easy/Quick Apply skips JobFill's Fill step, so watchForSubmit() never
    // arms and the board never flips. Poll for the platform's OWN post-submit
    // confirmation and report it by URL - server matches the app + flips to applied,
    // zero clicks (owner request 2026-07-23). The success text is absent on load,
    // so this can only fire after a real submit.
    let sent = false;
    const applyWatch = setInterval(() => {
      if (sent) return;
      try {
        const t = (document.body.innerText || "").toLowerCase();
        if (/your application was sent to|application sent\b|your application has been submitted|application submitted/.test(t)) {
          sent = true;
          chrome.runtime.sendMessage({ type: "event", data: { id: "_meta", outcome: "submitted", url: location.href } });
          clearInterval(applyWatch);
        }
      } catch (_) {}
    }, 2000);
    setTimeout(() => clearInterval(applyWatch), 30 * 60 * 1000); // give up after 30 min on the tab
  }
  const norm = (s) => (s || "").replace(/\s+/g, " ").replace(/[*:]+$/, "").trim().toLowerCase();
  let seen = new WeakSet(); // reset per fill run so re-Fill retries unanswered fields

  function deepQuery(sel, root = document) {
    const out = [...root.querySelectorAll(sel)];
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) out.push(...deepQuery(sel, el.shadowRoot));
    return out;
  }

  function labelFor(el) {
    if (el.id) {
      const l = (el.getRootNode() || document).querySelector?.(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return l.textContent;
    }
    const wrap = el.closest("label");
    if (wrap) return wrap.textContent;
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const t = lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent || "").join(" ");
      if (t.trim()) return t;
    }
    if (el.placeholder) return el.placeholder;
    const cont = el.closest("div,fieldset,li");
    const lab = cont?.querySelector("label, legend, .label, [class*='label']");
    return lab ? lab.textContent : el.name || "";
  }

  function questionLabel(el) {
    const own = labelFor(el);
    if (own && !/^(select|search|choose|start typing|type here|type to)/.test(norm(own))) return own;
    let node = el;
    for (let depth = 0; depth < 5 && node; depth++) {
      let sib = node.previousElementSibling, hops = 0;
      while (sib && hops < 3) {
        const t = (sib.textContent || "").trim();
        if (t && t.length > 2 && t.length < 220) return t;
        sib = sib.previousElementSibling; hops++;
      }
      node = node.parentElement;
    }
    return own;
  }

  // Resolve the box to highlight - STRICTLY a real form CONTROL, never a paragraph, label,
  // or the big application container (that painted the whole form green with an ugly left
  // bar). react-select renders the real input as a 2px sliver, so highlight its
  // .select__control box; otherwise highlight the control element itself. (owner 2026-08-06)
  function hlTarget(el) {
    return el.closest("[class*='select__control']") || el;
  }
  // Inject the highlight animation once: a modern focus GLOW that pulses twice, then settles
  // to a crisp 2px inset border + faint tint. Inset box-shadow paints all 4 sides and never
  // clips. Only ever applied to form controls. (owner request 2026-08-06 - looks professional)
  function ensureHlStyle() {
    if (document.getElementById("__jobfill_hl")) return;
    const s = document.createElement("style");
    s.id = "__jobfill_hl";
    s.textContent =
      "@keyframes jfGlowOk{0%{box-shadow:inset 0 0 0 2px #16a34a,0 0 0 0 rgba(22,163,74,.55)}70%{box-shadow:inset 0 0 0 2px #16a34a,0 0 0 9px rgba(22,163,74,0)}100%{box-shadow:inset 0 0 0 2px #16a34a,0 0 0 0 rgba(22,163,74,0)}}" +
      "@keyframes jfGlowNo{0%{box-shadow:inset 0 0 0 2px #dc2626,0 0 0 0 rgba(220,38,38,.55)}70%{box-shadow:inset 0 0 0 2px #dc2626,0 0 0 9px rgba(220,38,38,0)}100%{box-shadow:inset 0 0 0 2px #dc2626,0 0 0 0 rgba(220,38,38,0)}}" +
      ".jf-ok{border-radius:7px!important;background-color:rgba(22,163,74,.05)!important;box-shadow:inset 0 0 0 2px #16a34a!important;animation:jfGlowOk 1s ease-out 2}" +
      ".jf-no{border-radius:7px!important;background-color:rgba(220,38,38,.05)!important;box-shadow:inset 0 0 0 2px #dc2626!important;animation:jfGlowNo 1s ease-out 2}";
    (document.head || document.documentElement).appendChild(s);
  }
  function paintFill(el, ok) {
    ensureHlStyle();
    const t = hlTarget(el);
    t.classList.remove("jf-ok", "jf-no");
    void t.offsetWidth; // restart the animation if the field is re-filled
    t.classList.add(ok ? "jf-ok" : "jf-no");
    return t;
  }
  function markFilled(el) {
    try { spotlight(paintFill(el, true)); } catch (_) {}
  }

  function setNative(el, val) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, val);
    ["input", "change"].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
    markFilled(el);
  }

  function visible(el) {
    if (el.disabled || el.type === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // A field is a real RED only if it's REQUIRED. An unmatched OPTIONAL field (name
  // pronunciation, other links, "upload anything") never blocks submit, so it must not
  // count as a gap - it inflated the red counts across every prescan. (owner 2026-08-05)
  function isRequired(el) {
    if (el.required || el.getAttribute("aria-required") === "true") return true;
    if (/\*/.test(labelFor(el) || "")) return true;      // ATS mark required with an asterisk
    return /\*/.test(questionLabel(el) || "");
  }
  const manual = (el, msg) => (isRequired(el) ? msg : "skipped (optional)");

  // ---- visual overlay: see exactly where the filler is working ----
  // ---- SPOTLIGHT: dim the whole page, keep a bright circle on the field being
  // filled - the closer to the current input, the brighter (owner request). ----
  let spotEl = null;
  function spotlight(target) {
    try {
      if (!spotEl) {
        spotEl = document.createElement("div");
        spotEl.id = "jobfill-spotlight";
        Object.assign(spotEl.style, {
          position: "fixed", inset: "0", zIndex: "2147483646", pointerEvents: "none",
          transition: "background 0.35s ease, opacity 0.5s ease", opacity: "1",
        });
        document.documentElement.appendChild(spotEl);
      }
      const r = target.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      spotEl.style.background =
        `radial-gradient(circle 260px at ${x}px ${y}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.78) 100%)`;
    } catch (_) {}
  }
  function endSpotlight() {
    try {
      if (spotEl) { spotEl.style.opacity = "0"; setTimeout(() => { spotEl?.remove(); spotEl = null; }, 600); }
    } catch (_) {}
  }

  function flash(el, ok) {
    // PERSISTENT full-box highlight: green = JobFill filled it, red = needs you. Inset
    // box-shadow shows all 4 sides and never clips (unlike the old outline). Stays until
    // submit so the user can eyeball exactly what was touched. (owner 2026-08-06)
    try {
      const t = paintFill(el, ok);
      t.scrollIntoView({ block: "center", behavior: "smooth" });
      spotlight(t);
    } catch (e) {}
  }
  function banner(text, done) {
    try {
      let b = document.getElementById("__jobfill_banner");
      if (!b) {
        b = document.createElement("div");
        b.id = "__jobfill_banner";
        b.style.cssText = "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
          "background:#111827;color:#fff;padding:8px 18px;border-radius:9999px;" +
          "font:600 13px -apple-system,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3)";
        document.documentElement.appendChild(b);
      }
      b.textContent = text;
      if (done) setTimeout(() => b.remove(), 7000);
    } catch (e) {}
  }

  const mouse = (el, types = ["mousedown", "mouseup", "click"]) =>
    types.forEach((t) => el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })));

  const key = (el, k) => ["keydown", "keyup"].forEach((t) =>
    el.dispatchEvent(new KeyboardEvent(t, { key: k, code: k, bubbles: true, cancelable: true })));

  const isCombobox = (el) =>
    el.getAttribute("role") === "combobox" ||
    el.getAttribute("aria-autocomplete") === "list" ||
    !!el.closest("[class*='select__'],[class*='combobox'],[role=combobox]");

  // IMPORTANT: react-select's input matches [role=combobox] itself, so we must
  // NOT let closest() return the invisible input - the clickable box is
  // .select__control (an ancestor). parentElement.closest() skips self.
  const comboControl = (el) =>
    el.closest("[class*='select__control']") ||
    el.parentElement?.closest("[role=combobox],[class*='combobox']") ||
    el.parentElement || el;

  function displayedValue(el) {
    const ctl = comboControl(el);
    const t = (ctl.textContent || "").replace(/\s+/g, " ").trim();
    return /^(select|search|choose|no options?)\b|^$/i.test(t) ? "" : t;
  }

  // serverRules come from the Jobs app /api/jobfill/rules (rules.json) and take precedence -
  // fixing an answer there applies on the next click, no extension reload.
  function compileServerRules(list) {
    return (list || []).map((r) => {
      try {
        return { re: new RegExp(r.match, "i"), kind: r.kind || "choice", opts: r.opts, v: r.v,
                 seed: r.seed, contains: !!r.contains, async: !!r.async, freeText: r.freeText };
      } catch (e) { return null; }
    }).filter(Boolean);
  }

  function buildRules(p, cover) {
    const a = p.apply_answers || {}, id = p.identity || {};
    const full = a.full_name || id.name || "";
    const first = full.split(" ")[0] || "", last = full.split(" ").slice(1).join(" ") || "";
    const txt = (re, v) => ({ re, kind: "text", v });
    const sel = (re, opts) => ({ re, kind: "choice", opts });
    const loc = a.location || id.location || "";
    return [
      sel(/have you (ever )?been employed by|previously (been )?(employed|worked)|former employee/, ["No"]),
      sel(/opt[- ]?in|whatsapp|sms|text message/, ["No"]),
      sel(/sponsor|work permit|visa|immigration/, ["No"]),
      sel(/authorized to work|work authorization|legally (allowed|authorized)|eligible to work/, ["Yes"]),
      sel(/remote location|work (from|in) a remote|option to work remote|intend to work remotely/, ["Yes, I intend to work remotely.", "Yes, I intend to work remotely", "Yes"]),
      sel(/willing to relocate|relocat/, ["No"]),
      sel(/eu or equivalent timezone|based in.*(eu|europe)|european.*timezone|located in (the )?eu/, ["No"]),
      sel(/anticipate working|countr(y|ies) you (anticipate|expect|plan)/, ["US", "United States"]),
      sel(/country where you (currently )?reside|country of residence|^country$|country.*located/, ["US", "United States", "United States of America", "USA", "+1"]),
      { re: /most recent school|school you attended|university|college|alma mater/, kind: "choice", opts: ["University of Massachusetts-Lowell", "University of Massachusetts Lowell", "University of Massachusetts", "UMass"], seed: "University of Massachusetts", contains: true, async: true, freeText: "University of Massachusetts Lowell" },
      sel(/degree/, ["Bachelor's Degree", "Bachelors", "Bachelor of Science", "BS"]),
      sel(/discipline|major|field of study/, ["Computer Science"]),
      sel(/how did you hear|hear about (this|us)/, ["LinkedIn", "Job board", "Other"]),
      sel(/hispanic|latino/, ["No"]),
      // EEO: answer ONLY from the profile; with no profile value, decline -
      // never assert an assumed identity (matches the apply_bot philosophy).
      sel(/gender identity|^gender$|what gender/, a.eeo?.gender ? [a.eeo.gender] : ["I don't wish to answer", "Decline to self-identify", "Prefer not to say"]),
      sel(/transgender/, ["No"]),
      sel(/sexual orientation/, a.eeo?.orientation ? [a.eeo.orientation, "I don't wish to answer"] : ["I don't wish to answer", "Decline to self-identify", "Prefer not to say"]),
      sel(/disability/, ["I do not want to answer", "I don't want to answer", "I don't wish to answer", "I do not wish to answer", "Decline to self-identify"]),
      sel(/veteran|military/, ["I am not a protected veteran", "No military service", "I decline to self-identify", "I do not want to answer"]),
      sel(/race|ethnicit/, a.eeo?.race ? [a.eeo.race, "I don't wish to answer", "I do not want to answer", "Decline to self-identify"] : ["I don't wish to answer", "I do not want to answer", "Decline to self-identify"]),
      sel(/agree|consent|acknowledge|privacy (policy|notice)|terms/, ["I agree", "I Agree", "Yes"]),
      txt(/preferred (first )?name/, first),
      txt(/first name/, first),
      txt(/last name|family name|surname/, last),
      txt(/full name|your name|^name$/, full),
      txt(/e-?mail/, a.email || id.email || ""),
      txt(/phone|mobile/, a.phone || id.phone || ""),
      { re: /^(location|location \(city\)|city|current location|your location)$|where do you (currently )?(live|reside)|what city and state/, kind: "location", v: loc, async: true },
      txt(/linkedin/, a.linkedin || id.linkedin || ""),
      txt(/github/, a.github || ""),
      txt(/portfolio|personal (web)?site|website/, a.portfolio || id.site || ""),
      txt(/who is your (current|previous|most recent)[^?]*employer|current (or (previous|most recent) )?(company|employer)|most recent company|^employer$/, a.current_company || ""),
      txt(/(current|previous|most recent)[^?]*(job )?title/, a.current_title || ""),
      txt(/(desired|expected) (base )?(salary|compensation)|salary expectation/, a.desired_base_salary_usd || ""),
      txt(/notice period/, a.notice_period || ""),
      txt(/(earliest )?start date|available to start/, a.earliest_start || ""),
      txt(/years of (relevant )?experience/, a.years_experience || ""),
      txt(/cover letter/, cover || ""),
    ];
  }

  function matchRule(rules, label) {
    const l = norm(label);
    if (!l) return null;
    for (const r of rules) if (r.re.test(l)) return r;
    return null;
  }

  const OPT_SEL = "[role=option],[class*='select__option'],li[id*='option'],[id*='react-select'][id*='option']";

  // Scoped first: read options from THIS field's own container so an open menu
  // from a neighboring field can't leak in. Fall back to document (portals).
  function listOptions(ctl) {
    if (ctl) {
      for (const scope of [ctl.parentElement, ctl.closest("[class*='select-']") || ctl.closest("[class*='select__container']")]) {
        if (!scope) continue;
        const scoped = deepQuery(OPT_SEL, scope).filter((o) => visible(o) && (o.textContent || "").trim().length < 90);
        if (scoped.length) return scoped;
      }
    }
    return deepQuery(OPT_SEL).filter((o) => visible(o) && (o.textContent || "").trim().length < 90);
  }

  // simulate real typing: incremental value + input event per character
  async function typeInto(el, text) {
    for (let i = 1; i <= text.length; i++) {
      key(el, text[i - 1]);
      setNative(el, text.slice(0, i));
      if (i % 4 === 0) await sleep(30);
    }
  }

  function findOption(wants, { contains = false } = {}, ctl) {
    const opts = listOptions(ctl);
    const texts = opts.map((o) => norm(o.textContent));
    for (const w of wants) {
      const i = texts.findIndex((t) => t === norm(w));
      if (i >= 0) return opts[i];
    }
    for (const w of wants) {
      if (!contains && String(w).length < 8) continue;
      const i = texts.findIndex((t) => t.includes(norm(String(w).split(",")[0])));
      if (i >= 0) return opts[i];
    }
    return null;
  }

  // close any stale open menu so its options don't leak into the next field's probe
  function closeAllMenus() {
    const a = document.activeElement;
    if (a) a.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.body.click();
  }

  // close and WAIT until no menu remains visible (leaky portals stay open otherwise)
  async function settleMenus() {
    for (let i = 0; i < 6; i++) {
      closeAllMenus();
      await sleep(140);
      if (!deepQuery(OPT_SEL).some((o) => visible(o))) return;
    }
  }

  // escalate: mouse on control -> ArrowDown -> click the dropdown indicator
  async function openMenu(el, ctl) {
    mouse(ctl); await sleep(300);
    if (listOptions(ctl).length) return true;
    key(el, "ArrowDown"); await sleep(300);
    if (listOptions(ctl).length) return true;
    const ind = ctl.querySelector("[class*='indicator'],[class*='arrow'],svg");
    if (ind) { mouse(ind); await sleep(300); }
    return listOptions(ctl).length > 0;
  }

  // open -> read -> (type + POLL for async APIs) -> click match -> VERIFY
  // Returns {picked, options}: options = what the menu actually offered, so
  // failures report EVIDENCE (the real option texts) instead of a blind MANUAL.
  async function fillCombobox(el, wants, { contains = false, seed = null, isAsync = false } = {}) {
    await settleMenus();
    const ctl = comboControl(el);
    el.focus();
    await openMenu(el, ctl);
    let opt = findOption(wants, { contains }, ctl);
    if (!opt) {
      const typed = String(seed || wants[0]).slice(0, 40);
      await typeInto(el, typed); // realistic per-char typing for picky filters
      const rounds = isAsync ? 12 : 4;
      for (let i = 0; i < rounds && !opt; i++) { await sleep(500); opt = findOption(wants, { contains }, ctl); }
    }
    const options = listOptions(ctl).map((o) => o.textContent.trim()).slice(0, 30);
    if (opt) {
      const picked = opt.textContent.trim();
      mouse(opt);
      await sleep(250);
      if (displayedValue(el) || el.value) return { picked, options }; // verified
    }
    // portal-rendered lists we cannot see: accept the top suggestion via keyboard,
    // but ONLY keep it if the committed value verifiably matches a wanted token.
    if (!opt) {
      key(el, "ArrowDown"); await sleep(250); key(el, "Enter"); await sleep(400);
      const got = displayedValue(el) || el.value || "";
      const okTok = wants.some((w) => got.toLowerCase().includes(String(w).toLowerCase().split(",")[0]));
      if (got && okTok) return { picked: got, options };
    }
    setNative(el, "");
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    el.blur();
    return { picked: null, options };
  }

  function b64ToFile(b64, name) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: "application/pdf" });
  }

  // Infer standard EEO / demographic / phone-country answers from a dropdown's OPTION
  // SET, for react-select controls (Rippling, etc.) that mangle the field label to a
  // placeholder like "search"/"select..." so label rules can't match. Returns the exact
  // option text to pick, or null. Owner's stable answers. (owner request 2026-08-05)
  function inferByOptions(opts) {
    if (!opts || !opts.length) return null;
    const low = opts.map((o) => (o || "").toLowerCase().trim());
    const has = (s) => low.some((o) => o.includes(s));
    const pick = (pred) => opts[low.findIndex(pred)] || null;
    // Pronouns
    if (has("he/him") || has("she/her") || has("they/them"))
      return pick((o) => o === "he/him/his") || pick((o) => o.startsWith("he/him"));
    // Race / ethnicity (unmistakable multi-race option set) -> Asian
    if (has("black or african american") || has("native hawaiian") || has("alaskan native") || has("two or more races"))
      return pick((o) => o === "asian") || pick((o) => /\basian\b/.test(o) && !o.includes("caucasian"));
    // Phone country code -> +1 US - United States
    if (has("+1 us") || (low.some((o) => /^\+\d/.test(o)) && has("united states")))
      return pick((o) => o.includes("+1") && o.includes("united states")) || pick((o) => o.startsWith("+1 us"));
    // US state / province of residence (unmistakable state option set) -> New Hampshire.
    // Robust to react-select label mangling where the "which state do you reside" label
    // is lost. (owner NH resident, 2026-08-05)
    if (has("alabama") && has("alaska") && (has("wyoming") || has("new hampshire")))
      return pick((o) => o.toLowerCase() === "new hampshire") || pick((o) => /new hampshire/.test(o));
    // Gender -> Male
    if (has("male") && has("female"))
      return pick((o) => o === "male");
    // Hispanic / Latino / veteran / disability yes-no-decline -> conservative "No"
    // only when it is clearly that kind of yes/no/decline set (avoid generic yes/no).
    if (has("no") && (has("decline") || has("prefer not") || has("do not wish")) && low.length <= 4)
      return pick((o) => o === "no");
    return null;
  }

  async function fill(data) {
    seen = new WeakSet();
    banner("JobFill: filling this form...");
    const { profile, resumeB64, cover, kitId, overwrite = [] } = data;
    // cover is now { file:{b64,name}, text } (older shape: a plain string). The PDF file
    // goes to the upload slot; text is only for paste-into-textarea cover fields.
    const coverText = cover && typeof cover === "object" ? (cover.text || "") : (cover || "");
    const coverFile = cover && typeof cover === "object" ? cover.file : null;
    const wantsOverwrite = (label) => overwrite.some((o) => norm(label).includes(norm(o)));
    const rules = [...compileServerRules(data.rules), ...buildRules(profile, coverText)];
    const report = [];
    const debug = [];

    // attach files: resume.pdf -> Resume/CV input, cover-letter.txt -> Cover Letter input.
    // /cover/ is tested FIRST so "Resume/CV" never swallows the cover slot.
    const attach = (fi, file, label) => {
      if (fi.files?.length) { report.push([label, "already attached: " + fi.files[0].name, "file"]); return; }
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        fi.files = dt.files;
        fi.dispatchEvent(new Event("change", { bubbles: true }));
        report.push([label, "uploaded " + file.name, "file"]);
      } catch (e) { report.push([label, "MANUAL - upload failed: " + e, "file"]); }
    };
    // professional filenames - recruiters see these
    const pname = (profile.identity && profile.identity.name) || "Resume";
    const fileInputs = deepQuery("input[type=file]");
    let resumeDone = false;
    for (const fi of fileInputs) {
      const sec = fi.closest("div,section,fieldset");
      // Classify by the NEAREST question label (questionLabel walks to the closest
      // preceding text) - NOT the whole section blob, which on Ashby/Greenhouse holds
      // BOTH "Resume/CV" and "Cover Letter" and cross-wires them. The resume must NEVER
      // land in a cover slot. (owner bug 2026-08-05)
      const near = norm(questionLabel(fi) + " " + (labelFor(fi) || ""));
      const isCover = /cover|motivation|letter/.test(near);
      const isResume = !isCover && /resume|cv\b|curriculum|\bcv$/.test(near);
      // Greenhouse/Ashby persist uploads as a chip in the DOM, NOT in input.files -
      // read the chip so existing attachments are inventoried (and mismatches caught).
      const chip = ((sec?.textContent || "").match(/([\w\-. ()&']{3,60}\.(pdf|docx?|txt|rtf))/i) || [])[1];

      if (isCover) {
        // Cover slot gets the per-job TAILORED cover letter, NEVER the resume. (owner
        // 2026-08-05: uploading the resume as a cover reads as careless.)
        if (chip && !/cover/i.test(chip))
          report.push(["cover letter", "MANUAL - WRONG FILE attached: " + chip.trim() + " (remove it, then Fill again)", "file"]);
        else if (chip)
          report.push(["cover letter", "already attached: " + chip.trim(), "file"]);
        else if (coverFile && coverFile.b64)
          attach(fi, b64ToFile(coverFile.b64, pname + " - Cover Letter.pdf"), "cover letter");
        else if (coverText)
          attach(fi, new File([coverText], pname + " - Cover Letter.txt", { type: "text/plain" }), "cover letter");
        else
          report.push(["cover letter", "MANUAL - attach a cover letter yourself (no cover doc in this kit)", "file"]);
        continue;
      }

      // Resume slot: an explicit resume label, OR the page's SOLE file input that is not
      // a cover slot. Never the old "one input in THIS frame" fallback - a cover-only
      // frame has one input and must not receive the resume. (owner bug 2026-08-05)
      if (!resumeDone && (isResume || (fileInputs.length === 1 && !isCover))) {
        if (chip) report.push(["resume", "already attached: " + chip.trim(), "file"]);
        else attach(fi, b64ToFile(resumeB64, pname + " - Senior Full-Stack Engineer.pdf"), "resume");
        resumeDone = true;
        continue;
      }

      // Unlabeled upload we can't confidently classify: do NOT guess - leave it for the human.
      report.push([norm(questionLabel(fi)).slice(0, 40) || "attachment", "MANUAL - unlabeled upload, attach by hand", "file"]);
    }

    for (const el of deepQuery("input[type=text],input[type=email],input[type=tel],input[type=url],input:not([type]),textarea")) {
      if (!visible(el) || seen.has(el)) continue;
      seen.add(el); seen.add(comboControl(el));
      const label = questionLabel(el);
      const short = norm(label).slice(0, 60);
      const r = matchRule(rules, label);
      if (r && r.kind === "skip") { const skipLab = norm(typeof qLabel !== "undefined" ? qLabel : (typeof label !== "undefined" ? label : "")).slice(0, 60); report.push([skipLab, "skipped (page chrome)", "skip"]); continue; }

      if (isCombobox(el)) {
        const already = displayedValue(el);
        if (already) { if (short) report.push([short, "already: " + already.slice(0, 40), "dropdown"]); continue; }
        if (!r) {
          // no rule -> PROBE the menu, read options. First try to INFER a standard
          // demographic/country answer from the option set (react-select controls
          // mangle the label so label rules miss). Else report options as evidence.
          if (short) {
            await settleMenus();
            const pctl = comboControl(el);
            await openMenu(el, pctl);
            const opts = listOptions(pctl).map((o) => o.textContent.trim()).slice(0, 20);
            closeAllMenus();
            const inferred = inferByOptions(opts);
            if (inferred) {
              const res = await fillCombobox(el, [inferred], { contains: false });
              flash(el, !!res.picked);
              if (res.picked) { report.push([short, res.picked, "dropdown", opts]); continue; }
            }
            report.push([short, manual(el, "MANUAL - pick one"), "dropdown", opts]);
            debug.push({ label: short, options: opts, html: pctl.outerHTML.slice(0, 600) });
          }
          continue;
        }
        const wants = r.kind === "choice" ? r.opts : [r.v];
        const contains = r.contains || r.kind === "location";
        if (!wants[0]) { report.push([short, "MANUAL", "dropdown"]); continue; }
        const res = await fillCombobox(el, wants, { contains, seed: r.seed, isAsync: r.async });
        flash(el, !!res.picked);
        if (res.picked) report.push([short, res.picked, "dropdown", res.options]);
        else {
          report.push([short, "MANUAL - no rule matched these options", "dropdown", res.options]);
          debug.push({ label: short, options: res.options, html: comboControl(el).outerHTML.slice(0, 500) });
        }
      } else {
        const ftype = el.tagName === "TEXTAREA" ? "textarea" : "text";
        if (el.value) {
          if (r && (r.kind === "text") && r.v && wantsOverwrite(label)) {
            setNative(el, String(r.v)); // explicit targeted overwrite from a command
            flash(el, true);
            report.push([short, "OVERWROTE: " + String(r.v).slice(0, 50), ftype]);
            continue;
          }
          if (short) report.push([short, "already: " + String(el.value).slice(0, 50), ftype]);
          continue;
        }
        if (r && r.kind === "skip") {
          // deliberate blank (optional field with no answer on file, e.g. twitter)
          report.push([short, "skipped (optional)", ftype]);
          continue;
        }
        if (r && (r.kind === "text" || r.kind === "location") && r.v) {
          setNative(el, String(r.v));
          el.dispatchEvent(new Event("blur", { bubbles: true }));
          flash(el, true);
          report.push([short, String(r.v).slice(0, 60), ftype]);
        } else if (r && r.kind === "choice") {
          // plain-input autocomplete (e.g. Greenhouse school field):
          // type a seed, poll for the async option list, click the match
          const res = await fillCombobox(el, r.opts, { contains: r.contains, seed: r.seed, isAsync: true });
          flash(el, !!(res.picked));
          if (res.picked) report.push([short, res.picked, "autocomplete", res.options]);
          else if (!res.options.length && r.freeText) {
            // no dropdown ever appeared -> plain free-text field; type the answer.
            // NO synthetic blur: Greenhouse typeahead-style fields wipe unconfirmed
            // text on blur, so we set it and leave focus alone.
            el.focus();
            key(el, r.freeText.slice(-1));
            setNative(el, r.freeText);
            report.push([short, r.freeText, "text"]);
          } else {
            report.push([short, manual(el, "MANUAL - no rule matched these options"), "autocomplete", res.options]);
            debug.push({ label: short, options: res.options, html: (el.closest("div")?.outerHTML || "").slice(0, 500) });
          }
        } else if (short) report.push([short, manual(el, "MANUAL"), ftype]);
      }
    }

    for (const el of deepQuery("select")) {
      if (!visible(el) || seen.has(el)) continue;
      seen.add(el);
      const label = questionLabel(el);
      const short = norm(label).slice(0, 60);
      const r = matchRule(rules, label);
      if (r && r.kind === "skip") { const skipLab = norm(typeof qLabel !== "undefined" ? qLabel : (typeof label !== "undefined" ? label : "")).slice(0, 60); report.push([skipLab, "skipped (page chrome)", "skip"]); continue; }
      const current = el.options[el.selectedIndex]?.text?.trim() || "";
      const allOpts = [...el.options].map((o) => o.text.trim()).filter((t) => t && !/^select/i.test(t)).slice(0, 20);
      if (r && r.kind === "choice") {
        if (current && r.opts.some((w) => current.toLowerCase().includes(String(w).toLowerCase()))) {
          report.push([short, "already: " + current.slice(0, 40), "select", allOpts]); continue;
        }
        const options = [...el.options].map((o) => o.text.trim());
        let idx = -1;
        for (const w of r.opts) { const i = options.findIndex((t) => t.toLowerCase() === String(w).toLowerCase()); if (i >= 0) { idx = i; break; } }
        if (idx < 0) for (const w of r.opts) { if (String(w).length < 8) continue; const i = options.findIndex((t) => t.toLowerCase().includes(String(w).toLowerCase())); if (i >= 0) { idx = i; break; } }
        if (idx >= 0) {
          el.selectedIndex = idx;
          ["input", "change"].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
          flash(el, true);
          report.push([short, el.options[idx].text, "select", allOpts]);
        } else { flash(el, false); report.push([short, "MANUAL - no rule matched these options", "select", allOpts]); }
      } else if (short && !current) report.push([short, manual(el, "MANUAL - pick one"), "select", allOpts]);
    }

    // group radios by name, else by CONTAINER (Ashby renders nameless radios -
    // random keys fragmented them into skipped singletons; never again)
    const radios = new Map();
    for (const el of deepQuery("input[type=radio]")) {
      const k = el.name
        ? "n:" + el.name
        : (el.closest("fieldset,[role=radiogroup],[class*='field'],[class*='Field']") || el);
      if (!radios.has(k)) radios.set(k, []);
      radios.get(k).push(el);
    }
    for (const [, group] of radios) {
      if (group.some((g) => g.checked)) continue;
      const qEl = group[0].closest("fieldset");
      const qLabel = qEl?.querySelector("legend")?.textContent || questionLabel(group[0].closest("div") || group[0]);
      const r = matchRule(rules, qLabel);
      if (r && r.kind === "skip") { const skipLab = norm(typeof qLabel !== "undefined" ? qLabel : (typeof label !== "undefined" ? label : "")).slice(0, 60); report.push([skipLab, "skipped (page chrome)", "skip"]); continue; }
      if (!(r && r.kind === "choice")) {
        // NEVER skip silently - unmatched radio groups surface with their options
        const labels = group.map((x) => (x.closest("label")?.textContent || labelFor(x) || "").trim()).filter(Boolean).slice(0, 10);
        if (norm(qLabel)) report.push([norm(qLabel).slice(0, 60), "MANUAL - pick one", "radio", labels]);
        continue;
      }
      const rLabels = group.map((radio) => (radio.closest("label")?.textContent || labelFor(radio) || "").trim()).filter(Boolean).slice(0, 12);
      let done = false;
      for (const want of r.opts) {
        for (const radio of group) {
          const t = norm(radio.closest("label")?.textContent || labelFor(radio));
          const w = String(want).toLowerCase();
          // exact first; contains only for long, specific option sentences
          if (t === w || (w.length >= 8 && t.includes(w))) {
            radio.click(); flash(radio, true); report.push([norm(qLabel).slice(0, 60), String(want), "radio", rLabels]); done = true; break;
          }
        }
        if (done) break;
      }
      if (!done) { flash(group[0], false); report.push([norm(qLabel).slice(0, 60), "MANUAL - pick one", "radio", rLabels]); }
    }

    const boxGroups = new Map();
    for (const el of deepQuery("input[type=checkbox]")) {
      if (!visible(el)) continue; // keep checked ones so "already done" is visible
      const k = el.closest("fieldset") || el.closest("[role=group]") || el.name || "solo";
      if (!boxGroups.has(k)) boxGroups.set(k, []);
      boxGroups.get(k).push(el);
    }
    for (const [k, group] of boxGroups) {
      const qLabel = k instanceof Element
        ? (k.querySelector("legend")?.textContent || questionLabel(group[0]))
        : questionLabel(group[0]);
      const r = matchRule(rules, qLabel);
      if (r && r.kind === "skip") { const skipLab = norm(typeof qLabel !== "undefined" ? qLabel : (typeof label !== "undefined" ? label : "")).slice(0, 60); report.push([skipLab, "skipped (page chrome)", "skip"]); continue; }
      if (!(r && r.kind === "choice")) continue;
      const short = norm(qLabel).slice(0, 60);
      const boxLabel = (box) => norm(box.closest("label")?.textContent || labelFor(box));
      const bLabels = group.map((b) => boxLabel(b)).filter(Boolean).slice(0, 15);
      if (group.length === 1) {
        if (group[0].checked) { report.push([short, "already checked", "checkbox"]); continue; }
        if (r.opts.some((w) => /agree|yes/i.test(String(w))) && /agree|consent|acknowledge/.test(norm(qLabel))) {
          group[0].click(); report.push([short, "checked", "checkbox"]);
        } else if (r.opts.includes("No")) report.push([short, "left unchecked (opt-out)", "checkbox"]);
        continue;
      }
      // multi-select: if the wanted box is already checked, that's a pass
      const alreadyOn = group.find((b) => b.checked && r.opts.some((w) => boxLabel(b) === String(w).toLowerCase()));
      if (alreadyOn) { report.push([short, "already checked: " + boxLabel(alreadyOn), "checkbox", bLabels]); continue; }
      let done = false;
      for (const want of r.opts) {
        for (const box of group) {
          if (box.checked) continue;
          if (boxLabel(box) === String(want).toLowerCase()) { box.click(); report.push([short, "checked: " + want, "checkbox", bLabels]); done = true; break; }
        }
        if (done) break;
      }
      if (!done) report.push([short, "MANUAL - pick one", "checkbox", bLabels]);
    }

    // ---- button-group choices (Ashby/custom "Yes / No" segmented buttons that are
    // NOT radios/checkboxes/selects). Group short-text clickable buttons under a
    // question, match the rule answer, click it. ----
    const btnGroups = new Map();
    for (const el of deepQuery("button,[role=button],[role=radio],[class*='toggle'],[class*='segment'] > *")) {
      const txt = norm(el.textContent);
      if (!txt || txt.length > 24) continue;                 // only short-label choice buttons
      if (/submit|apply|save|continue|next|back|upload|choose file|add\b|remove|browse/.test(txt)) continue;
      if (el.querySelector("input,textarea,select")) continue; // skip wrappers of real fields
      const container = el.closest("fieldset,[role=radiogroup],[class*='field'],[class*='Field'],[class*='question'],[class*='Question']") || el.parentElement;
      if (!container) continue;
      if (!btnGroups.has(container)) btnGroups.set(container, []);
      btnGroups.get(container).push(el);
    }
    for (const [container, btns] of btnGroups) {
      if (btns.length < 2 || btns.length > 6) continue;       // a real choice group is 2-6 options
      if (btns.some((b) => seen.has(b))) continue;
      btns.forEach((b) => seen.add(b));
      const qLabel = container.querySelector("legend,label,[class*='label'],[class*='title']")?.textContent
        || questionLabel(btns[0]);
      const r = matchRule(rules, qLabel);
      if (r && r.kind === "skip") { const skipLab = norm(typeof qLabel !== "undefined" ? qLabel : (typeof label !== "undefined" ? label : "")).slice(0, 60); report.push([skipLab, "skipped (page chrome)", "skip"]); continue; }
      const short = norm(qLabel).slice(0, 60);
      const opts = btns.map((b) => norm(b.textContent)).filter(Boolean);
      // already selected? (aria-checked / aria-pressed / a selected class)
      if (btns.some((b) => b.getAttribute("aria-checked") === "true" || b.getAttribute("aria-pressed") === "true"
          || /selected|active|checked/.test(b.className))) {
        report.push([short, "already selected", "button", opts]); continue;
      }
      if (!(r && r.kind === "choice")) {
        if (short) { report.push([short, "MANUAL - pick one", "button", opts]); debug.push({ label: short, options: opts, html: container.outerHTML.slice(0, 400) }); }
        continue;
      }
      let done = false;
      for (const want of r.opts) {
        const w = String(want).toLowerCase();
        const hit = btns.find((b) => norm(b.textContent) === w) || (w.length >= 5 && btns.find((b) => norm(b.textContent).includes(w)));
        if (hit) { mouse(hit); hit.click(); flash(hit, true); report.push([short, String(want), "button", opts]); done = true; break; }
      }
      if (!done) { flash(btns[0], false); report.push([short, "MANUAL - pick one", "button", opts]); debug.push({ label: short, options: opts, html: container.outerHTML.slice(0, 400) }); }
    }

    // ---- required-completeness sweep (2026-08-04): flag any REQUIRED field still
    // empty so JobFill catches it NOW, before the ATS submit-time "needs corrections"
    // (submit-error should be the last resort, not the first detector). Conservative:
    // only concrete input/textarea/select fields, deduped against what we reported.
    const reportedLabels = new Set(report.map((x) => norm(x[0])));
    const REQ_SEL = "input[required],textarea[required],select[required]," +
      "input[aria-required='true'],textarea[aria-required='true'],select[aria-required='true']";
    for (const el of deepQuery(REQ_SEL)) {
      if (!visible(el) || el.disabled || el.type === "hidden" || el.type === "file") continue;
      if (el.type === "radio" || el.type === "checkbox") continue; // radio/button group loops handle these
      // react-select/combobox keeps its value in React state, so the backing input's
      // .value is ALWAYS "" even after a pick - reading it here re-flagged every filled
      // dropdown as "required, still empty" (Gusto: 7 false rows). Trust the fill loops:
      // if we already handled this control, or a value is visibly shown, it's done.
      // (owner bug 2026-08-05)
      if (isCombobox(el)) {
        if (seen.has(el) || seen.has(comboControl(el)) || displayedValue(el)) continue;
      }
      const tag = (el.tagName || "").toLowerCase();
      const empty = tag === "select" ? !el.value : !String(el.value || "").trim();
      if (!empty) continue;
      const lab = norm(questionLabel(el) || labelFor(el));
      if (!lab || reportedLabels.has(lab)) continue;
      reportedLabels.add(lab);
      flash(el, false);
      report.push([lab.slice(0, 60), "MANUAL - required, still empty", tag === "select" ? "dropdown" : "text"]);
    }

    if (report.length) {
      const reds = report.filter((x) => String(x[1]).startsWith("MANUAL")).length;
      // fill run over: lift the spotlight so the green/red borders are reviewable
      endSpotlight();
      banner(`JobFill done: ${report.length - reds} filled, ${reds} need you (red outlines)`, true);
      chrome.runtime.sendMessage({ type: "event", data: { id: kitId, outcome: "filled", url: location.href, fields: report, debug } });
      watchForSubmit(kitId);
    }
    return report;
  }

  let watching = false;
  function watchForSubmit(kitId) {
    if (watching) return;
    watching = true;
    const timer = setInterval(() => {
      const t = (document.body.innerText || "").slice(0, 4000).toLowerCase();
      if (/\/confirmation|thank[- ]?you/.test(location.href.toLowerCase()) ||
          /application (was )?(received|submitted)|thank you for (applying|your application)/.test(t)) {
        chrome.runtime.sendMessage({ type: "event", data: { id: kitId, outcome: "submitted", url: location.href } });
        clearInterval(timer);
      }
    }, 1500);
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === "jobfill:audit") {
      // READ-ONLY enumeration for preflight - nothing typed, clicked, or opened
      const fields = [];
      for (const el of deepQuery("input,textarea,select")) {
        if (!visible(el) || el.type === "hidden" || el.type === "password") continue;
        const label = norm(questionLabel(el)).slice(0, 90);
        if (!label) continue;
        const options = el.tagName === "SELECT"
          ? [...el.options].map((o) => o.text.trim()).filter((t) => t && !/^select/i.test(t)).slice(0, 25)
          : [];
        fields.push({ label, type: (el.type || el.tagName).toLowerCase(),
          required: el.required || el.getAttribute("aria-required") === "true", options });
      }
      sendResponse({ ok: true, fields, url: location.href });
      return;
    }
    if (msg.type === "jobfill:fill") {
      fill(msg.data).then((report) => sendResponse({
        ok: true, report,
        meta: { frame: location.href.slice(0, 100), inputs: deepQuery("input,textarea,select").length },
      })).catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    if (msg.type === "jobfill:capture") {
      // READ-ONLY: harvest the question -> answer pairs YOU actually filled, so Claude
      // can learn them for similar questions next time. Only non-empty fields; checkbox
      // groups fold into one label. Nothing is typed/clicked. (owner request 2026-08-05)
      const byLabel = new Map();
      for (const el of deepQuery("input,textarea,select")) {
        if (!visible(el) || el.type === "hidden" || el.type === "password") continue;
        const t = (el.type || el.tagName).toLowerCase();
        let value = "";
        if (t === "radio" || t === "checkbox") {
          if (!el.checked) continue;
          value = norm(labelFor(el)) || (el.value || "").trim();
        } else if (el.tagName === "SELECT") {
          value = (el.options[el.selectedIndex]?.text || "").trim();
          if (/^\s*(select|choose|--|please)/i.test(value)) value = "";
        } else {
          value = (el.value || "").trim();
        }
        if (!value) continue;
        const label = norm(questionLabel(el)).slice(0, 200);
        if (!label) continue;
        const prev = byLabel.get(label);
        // checkbox groups: same question, multiple ticked -> join the picked options
        if (prev && (t === "checkbox" || t === "radio")) prev.value += ", " + value;
        else if (!prev) byLabel.set(label, { label, value: value.slice(0, 6000), type: t });
      }
      sendResponse({ ok: true, answers: [...byLabel.values()], url: location.href, title: document.title });
      return;
    }
    if (msg.type === "jobfill:ping") sendResponse({ ok: true });
  });
})();
