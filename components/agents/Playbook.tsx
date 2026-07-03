"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Eye, Pencil, Check } from "lucide-react";

// View/edit a single instruction .md file (a job's playbook or a guide). Loads lazily by path and
// saves straight to disk via /api/instructions/file. Shared by the Agents page's Guides list
// (inline, capped height) and the per-agent Instructions drawer (`fill` — stretches to the bottom).
export default function Playbook({ path, fill = false }: { path: string; fill?: boolean }) {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetch(`/api/instructions/file?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setContent(d.content ?? "");
        setSaved(d.content ?? "");
        setStatus("idle");
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [path]);

  async function save() {
    setStatus("saving");
    const r = await fetch("/api/instructions/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    });
    if (r.ok) {
      setSaved(content);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } else setStatus("error");
  }

  const dirty = content !== saved;

  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col" : "border-t border-zinc-800/80"}>
      <div className={`flex shrink-0 items-center gap-2 px-4 py-2 ${fill ? "border-b border-zinc-800/80" : ""}`}>
        <span className="truncate font-mono text-[12px] text-zinc-600">{path}</span>
        {dirty && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">unsaved</span>}
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-zinc-900 p-0.5 ring-1 ring-inset ring-zinc-800">
          {([["preview", Eye], ["edit", Pencil]] as const).map(([m, I]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] capitalize transition ${
                mode === m ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <I size={12} /> {m}
            </button>
          ))}
        </div>
        <button
          onClick={save}
          disabled={!dirty || status === "saving"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1 text-[12px] font-medium text-emerald-950 transition enabled:hover:bg-emerald-400 disabled:opacity-40"
        >
          {status === "saving" ? (
            <><Loader2 size={12} className="animate-spin" /> Saving</>
          ) : status === "saved" ? (
            <><Check size={12} /> Saved</>
          ) : (
            "Save"
          )}
        </button>
      </div>
      {status === "loading" ? (
        <div className={`flex items-center gap-2 px-4 py-6 text-[13px] text-zinc-500 ${fill ? "flex-1" : ""}`}>
          <Loader2 size={13} className="animate-spin" /> loading…
        </div>
      ) : mode === "edit" ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className={`w-full bg-zinc-950 px-4 py-3 font-mono text-[13px] leading-relaxed text-zinc-200 outline-none ${fill ? "min-h-0 flex-1 resize-none" : "h-80 resize-y"}`}
        />
      ) : (
        <article className={`prose-instructions overflow-auto px-4 py-3 ${fill ? "min-h-0 flex-1" : "max-h-[28rem]"}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>
      )}
    </div>
  );
}
