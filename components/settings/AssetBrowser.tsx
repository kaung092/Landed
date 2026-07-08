"use client";

import { useCallback, useEffect, useState } from "react";
import { Folder, FileText, ChevronRight, FolderOpen, Loader2, ExternalLink } from "lucide-react";

type Entry = { name: string; type: "dir" | "file"; bytes: number; mtime: string; path: string };

const TEXT_EXT = /\.(md|txt|json|csv|mjs|js|ts|tsx|jsx|html|css|ya?ml|log|env)$/i;
const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// Read-only browser for the asset folder (ASSET_ROOT). Lazy — lists one directory level at a time,
// previews text/markdown inline, opens pdfs in a new tab, and reveals anything in the OS file browser.
export default function AssetBrowser() {
  const [roots, setRoots] = useState<{ assetRoot: string; instructionsRoot: string } | null>(null);
  const [dir, setDir] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);

  useEffect(() => {
    fetch("/api/config/paths").then((r) => r.json()).then(setRoots).catch(() => {});
  }, []);

  // Navigate to a directory (event-handler use — synchronous setState is fine here).
  const load = useCallback((path: string) => {
    setLoading(true);
    setPreview(null);
    fetch(`/api/assets/list?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => { setEntries(d.entries ?? []); setDir(path); })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  // Initial load of the asset root — setState only in the async callback (no sync setState in effect).
  useEffect(() => {
    fetch(`/api/assets/list?path=`)
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  const openFile = (e: Entry) => {
    if (TEXT_EXT.test(e.name)) {
      fetch(`/api/assets/file?path=${encodeURIComponent(e.path)}`)
        .then((r) => r.json())
        .then((d) => setPreview({ path: e.path, content: d.content ?? "" }))
        .catch(() => {});
    } else {
      window.open(`/api/assets/file?path=${encodeURIComponent(e.path)}`, "_blank");
    }
  };

  const reveal = (path: string) =>
    fetch("/api/assets/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => {});

  const crumbs = dir ? dir.split("/") : [];

  return (
    <div className="space-y-3">
      {roots && (
        <dl className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-[12px]">
          <div className="flex gap-2"><dt className="w-24 shrink-0 text-zinc-500">Asset root</dt><dd className="min-w-0 break-all font-mono text-zinc-300">{roots.assetRoot}</dd></div>
          <div className="mt-1 flex gap-2"><dt className="w-24 shrink-0 text-zinc-500">Instructions</dt><dd className="min-w-0 break-all font-mono text-zinc-300">{roots.instructionsRoot}</dd></div>
        </dl>
      )}

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-[13px]">
        <button onClick={() => load("")} className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200">
          <FolderOpen size={14} /> asset-root
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight size={13} className="text-zinc-600" />
            <button onClick={() => load(crumbs.slice(0, i + 1).join("/"))} className="text-zinc-400 hover:text-zinc-200">{c}</button>
          </span>
        ))}
      </div>

      {/* Entries */}
      <div className="overflow-hidden rounded-xl border border-zinc-800">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-[13px] text-zinc-500"><Loader2 size={14} className="animate-spin" /> loading…</div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-6 text-[13px] text-zinc-500">Empty folder.</div>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {entries.map((e) => (
              <li key={e.path} className="group flex items-center gap-3 px-4 py-2 hover:bg-zinc-900/40">
                <button
                  onClick={() => (e.type === "dir" ? load(e.path) : openFile(e))}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  {e.type === "dir" ? <Folder size={15} className="shrink-0 text-sky-400" /> : <FileText size={15} className="shrink-0 text-zinc-500" />}
                  <span className="truncate text-[13px] text-zinc-200">{e.name}</span>
                  {e.type === "file" && <span className="shrink-0 text-[11px] text-zinc-600">{fmtBytes(e.bytes)}</span>}
                </button>
                <button onClick={() => reveal(e.path)} title="Reveal in file browser" className="shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-zinc-300">
                  <ExternalLink size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/40 px-4 py-2">
            <span className="truncate font-mono text-[12px] text-zinc-400">{preview.path}</span>
            <button onClick={() => setPreview(null)} className="shrink-0 text-[12px] text-zinc-500 hover:text-zinc-300">close</button>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed text-zinc-300">{preview.content}</pre>
        </div>
      )}
    </div>
  );
}
