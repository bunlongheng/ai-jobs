"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import TurndownService from "turndown";
import { confirmDialog } from "../ConfirmModal";

marked.setOptions({ gfm: true, breaks: false });
function render(md: string): string {
  const body = (md || "").replace(/^<!--[\s\S]*?-->\s*/m, "");
  return DOMPurify.sanitize(marked.parse(body) as string);
}

const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", strongDelimiter: "**", emDelimiter: "_", hr: "" });
td.escape = (s) => s; // resume content is plain prose - keep the markdown clean, don't backslash-escape
function html2md(html: string): string {
  return td.turndown(html)
    .replace(/\[([^\]]+)\]\((?:mailto:|https?:\/\/)[^)]*\)/g, "$1") // unwrap auto-linked emails + bare URLs back to plain text
    .replace(/^(\s*)[-*]\s{2,}/gm, "$1- ")                          // normalize bullet spacing
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}
const PAGE_BREAK = '<div class="page-break"></div>';

type Kind = "resume" | "cover";
type V = { id: string; kind: Kind; name: string; is_master: number; has_pdf: number; updated_at: string };
type Full = V & { content: string };

// The editable document: contentEditable page-sheets. innerHTML is set ONCE per version (keyed by
// id on the parent), so React never re-writes it mid-edit and the cursor stays put. On input we
// read the DOM, turn it back into markdown, and hand it up to auto-save.
function DocEditor({ markdown, onEdit }: { markdown: string; onEdit: (md: string) => void }) {
  const chunks = useMemo(() => markdown.split(PAGE_BREAK), [markdown]);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const collect = () => {
    const md = refs.current.filter(Boolean).map((el) => html2md(el!.innerHTML)).join(`\n\n${PAGE_BREAK}\n\n`);
    onEdit(md);
  };
  return (
    <div className="doc-stack">
      {chunks.map((chunk, i) => (
        <div className="doc-page" key={i}>
          <div
            ref={(el) => { refs.current[i] = el; }}
            className="resume-doc"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onInput={collect}
            dangerouslySetInnerHTML={{ __html: render(chunk) }}
          />
          <span className="doc-pageno">Page {i + 1} of {chunks.length}</span>
        </div>
      ))}
    </div>
  );
}

export default function ResumeStudio({ versions: initV, selected, defaults }: {
  versions: V[]; selected: Full | null; defaults: { resume: string; cover: string };
}) {
  const [versions, setVersions] = useState<V[]>(initV);
  const [kind, setKind] = useState<Kind>(selected?.kind || "resume");
  const [cur, setCur] = useState<Full | null>(selected);
  const [name, setName] = useState(selected?.name || "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving">("saved");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curRef = useRef(cur); curRef.current = cur;
  const kindRef = useRef(kind); kindRef.current = kind;
  const nameRef = useRef(name); nameRef.current = name;
  const mdRef = useRef(selected?.content || ""); // latest markdown from the editor

  const shown = versions.filter((v) => v.kind === kind);

  async function refresh() {
    const j = await (await fetch("/api/resume")).json();
    if (j.versions) setVersions(j.versions);
  }
  function cancelPending() { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }

  async function load(id: string) {
    cancelPending();
    const j = await (await fetch(`/api/resume/${id}`)).json();
    if (j.version) { setCur(j.version); setKind(j.version.kind); setName(j.version.name); mdRef.current = j.version.content || ""; setStatus("saved"); }
  }

  // ---- auto-save: edit, pause ~700ms, it saves itself ----
  function onEdit(md: string) { mdRef.current = md; scheduleSave(); }
  function scheduleSave() { setStatus("saving"); cancelPending(); timer.current = setTimeout(doSave, 700); }
  async function doSave() {
    const c = curRef.current;
    if (!c) return;
    await fetch("/api/resume", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: c.id, kind: kindRef.current, name: nameRef.current.trim() || c.name, content: mdRef.current }),
    }).catch(() => null);
    refresh();
    setStatus("saved");
  }

  function switchKind(k: Kind) {
    if (k === kind) return;
    cancelPending();
    setKind(k);
    const first = versions.find((v) => v.kind === k);
    if (first) load(first.id); else { setCur(null); mdRef.current = ""; setName(""); }
  }
  async function newVersion() {
    const nm = prompt(`New ${kind === "cover" ? "cover letter" : "resume"} version name (e.g. ${kind === "cover" ? "Startup / warm" : "PHP / Laravel"})`);
    if (!nm) return;
    setBusy(true);
    try {
      const j = await (await fetch("/api/resume", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, name: nm, content: defaults[kind] }),
      })).json();
      await refresh();
      if (j.version) await load(j.version.id);
    } finally { setBusy(false); }
  }
  async function makeMaster() {
    if (!cur) return;
    setBusy(true);
    try {
      await fetch(`/api/resume/${cur.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ master: true }) });
      await refresh(); await load(cur.id);
    } finally { setBusy(false); }
  }
  async function del() {
    if (!cur) return;
    const ok = await confirmDialog({ title: `Delete "${cur.name}"?`, body: "This resume version will be permanently removed. This can't be undone.", confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    cancelPending();
    setBusy(true);
    try {
      await fetch(`/api/resume/${cur.id}`, { method: "DELETE" });
      const rest = versions.filter((v) => v.id !== cur.id);
      setVersions(rest);
      const nextSame = rest.find((v) => v.kind === kind);
      if (nextSame) await load(nextSame.id); else { setCur(null); mdRef.current = ""; setName(""); }
    } finally { setBusy(false); }
  }

  const btn = "text-[12px] rounded-lg px-3 py-1.5 font-medium disabled:opacity-40";

  return (
    <>
      <header className="shrink-0 border-b border-gray-200 bg-white px-3 py-2 flex items-center gap-2 flex-wrap">
        <Link href="/jobs" className="text-[12px] text-blue-700 no-underline shrink-0">&larr; board</Link>
        <span className="w-px h-5 bg-gray-200 mx-0.5 hidden sm:block" />

        <div className="inline-flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => switchKind("resume")} className={`text-[12px] px-2.5 py-1 rounded-md font-medium ${kind === "resume" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>Resumes</button>
          <button onClick={() => switchKind("cover")} className={`text-[12px] px-2.5 py-1 rounded-md font-medium ${kind === "cover" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>Covers</button>
        </div>

        <select
          value={cur?.id || ""}
          onChange={(e) => e.target.value && load(e.target.value)}
          className="text-[12.5px] border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-blue-300 max-w-[190px]"
        >
          {shown.length === 0 ? <option value="">No versions</option> : null}
          {shown.map((v) => <option key={v.id} value={v.id}>{v.name}{v.is_master ? "  (master)" : ""}</option>)}
        </select>
        <button onClick={newVersion} disabled={busy} className="text-[12px] text-blue-700 hover:underline disabled:opacity-40 shrink-0">+ New</button>

        {cur ? (
          <>
            <span className="w-px h-5 bg-gray-200 mx-0.5 hidden sm:block" />
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); scheduleSave(); }}
              className="text-[13px] font-medium text-gray-800 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-2 py-1 outline-none min-w-[110px] max-w-[220px] flex-1"
              placeholder="Version name"
            />
            {cur.is_master ? <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5 shrink-0">MASTER</span> : null}
            <span className="text-[11px] text-gray-400 shrink-0 inline-flex items-center gap-1">
              {status === "saving"
                ? <><span className="w-2.5 h-2.5 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />Saving…</>
                : <>All changes saved</>}
            </span>

            <div className="flex items-center gap-1.5 ml-auto">
              <a href={`/api/resume/${cur.id}/pdf?dl=1`} className={`${btn} bg-gray-800 text-white no-underline hover:bg-black`}>Download PDF</a>
              {!cur.is_master ? <button onClick={makeMaster} disabled={busy} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}>Set master</button> : null}
              <button onClick={del} disabled={busy} className={`${btn} border border-gray-300 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200`}>Delete</button>
            </div>
          </>
        ) : null}
      </header>

      {!cur ? (
        <div className="flex-1 grid place-items-center text-[13px] text-gray-500">
          Pick a version up top, or create one with <strong className="mx-1">+ New</strong>.
        </div>
      ) : (
        <div className="doc-canvas flex-1 min-h-0">
          {/* key=cur.id remounts the editor on version switch so innerHTML resets cleanly */}
          <DocEditor key={cur.id} markdown={cur.content} onEdit={onEdit} />
        </div>
      )}

      <style>{`
        .doc-canvas { background:#eceef1; overflow:auto; padding:28px 24px; }
        .doc-stack { display:flex; flex-direction:column; align-items:center; gap:26px; }
        .doc-page {
          position:relative; background:#fff; width:816px; max-width:100%; padding:64px 60px;
          min-height:1056px; border-radius:2px;
          box-shadow:0 1px 3px rgba(60,64,67,.15), 0 6px 22px rgba(60,64,67,.10);
        }
        .doc-pageno { position:absolute; bottom:16px; right:24px; font-size:10.5px; color:#9aa0a6; }
        .resume-doc { color:#202124; font-size:13px; line-height:1.45; outline:none; min-height:100%;
          font-family:Georgia,"Times New Roman",serif; }
        .resume-doc h1{ font-size:23px; font-weight:700; margin:0 0 3px; letter-spacing:.2px; }
        .resume-doc h1 + p{ color:#5f6368; font-size:11.5px; margin:0 0 14px; }
        .resume-doc h2{ font-size:12.5px; font-weight:700; text-transform:uppercase; letter-spacing:.6px;
          border-bottom:2px solid #202124; padding-bottom:3px; margin:20px 0 9px; }
        .resume-doc h3{ font-size:12px; font-weight:700; margin:13px 0 3px; white-space:nowrap; letter-spacing:-.1px; }
        .resume-doc ul{ list-style:disc; margin:0 0 11px; padding-left:22px; }
        .resume-doc li{ margin:0 0 5px; }
        .resume-doc p{ margin:0 0 9px; }
        .resume-doc a{ color:#202124; }
        .resume-doc strong{ font-weight:700; }
        @media (max-width:640px){
          .doc-canvas{ padding:12px 8px; }
          .doc-page{ padding:32px 26px; min-height:auto; }
          .resume-doc{ font-size:12.5px; }
          .resume-doc h1{ font-size:20px; }
          .resume-doc h3{ white-space:normal; font-size:11.5px; }
          .doc-pageno{ display:none; }
        }
      `}</style>
    </>
  );
}
