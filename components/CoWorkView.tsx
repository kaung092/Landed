"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Loader2, Pencil, ChevronRight, Eye, Check, FileText, X, RotateCcw } from "lucide-react";
import { ago, fmtTs } from "@/lib/format";
import { useCoWorkQueue } from "@/components/CoWorkQueueProvider";
import { jobIcon, jobVerb, jobSubject, loadTone, loadHint, hasWip, wipBlink, KILL_CONFIRM } from "@/components/jobMeta";
import { CopyPrompt } from "@/components/CopyCoworkPrompt";
import { JobStatusChip, jobWorkStatus } from "@/components/JobStatus";

type JobView = { id: string; type: string; createdBy: string; createdAt: string; status: string; summary?: string | null };
type JobTypeMeta = { type: string; title: string; description: string; playbook: string };
type InstrFile = { path: string; name: string; group: string };
type Ctx = { targets: number; tracked: number; syncedThrough: string | null };

const guideTitle = (f: InstrFile) =>
  f.name === "README.md" ? "How CoWork works" : f.name.replace(/\.md$/, "").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// Group queued jobs by type so the queue reads as batchable passes (all fits, all tailors, …).
function groupByType<T extends { type: string }>(items: T[]): Record<string, T[]> {
  const g: Record<string, T[]> = {};
  for (const it of items) (g[it.type] ??= []).push(it);
  return g;
}

export default function CoWorkView() {
  const { jobs: queued, count: queuedCount, remove, requeue } = useCoWorkQueue();
  const [types, setTypes] = useState<JobTypeMeta[]>([]);
  const [playbooks, setPlaybooks] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [files, setFiles] = useState<InstrFile[]>([]);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState<string | null>(null);

  async function load() {
    const [d, i] = await Promise.all([
      fetch("/api/jobs").then((r) => r.json()),
      fetch("/api/instructions").then((r) => r.json()),
    ]);
    setTypes(d.types ?? []);
    setPlaybooks(d.playbooks ?? []);
    setJobs(d.jobs ?? []);
    setCtx(d.context ?? null);
    setFiles(i.files ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const lastIngested = (type: string) => jobs.find((j) => j.type === type && j.status === "ingested");
  const lastActive = jobs[0]?.createdAt ?? null;
  const toggle = (key: string) => setOpen((cur) => (cur === key ? null : key));

  // Guides = every instruction file that isn't a job's own playbook (README, watchlist-add, …).
  // Driven by the actual folder so the page stays in sync with what's on disk. README first.
  const jobPlaybooks = new Set(playbooks);
  const guides = files
    .filter((f) => !jobPlaybooks.has(f.path))
    .sort((a, b) => (a.name === "README.md" ? -1 : b.name === "README.md" ? 1 : a.name.localeCompare(b.name)));

  // Queue, split into per-type tabs (default to the first, recover if the active type drains).
  const queueGroups = Object.entries(groupByType(queued));
  const activeQueueTab = queueTab && queueGroups.some(([t]) => t === queueTab) ? queueTab : queueGroups[0]?.[0] ?? null;
  const queueItems = queueGroups.find(([t]) => t === activeQueueTab)?.[1] ?? [];

  return (
    <div className="relative flex h-full flex-col text-zinc-100">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-zinc-950/60 text-sm text-zinc-400 backdrop-blur-sm">
          <Loader2 size={16} className="animate-spin" /> loading…
        </div>
      )}

      <header className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-3.5">
        <div>
          <h1 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Bot size={16} className="text-violet-300" /> CoWork
          </h1>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Runs your job playbooks on its schedule, reading + writing over MCP.
            {lastActive && <> Last active {ago(lastActive)}.</>}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* The live queue — work handed off to CoWork, grouped by type so it can batch a pass.
              Tell CoWork "clear my queue" and it runs these in order, writing results back. */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">
              Queue
              <span className="rounded-full bg-zinc-800 px-1.5 text-[11px] font-bold tabular-nums text-zinc-400">{queuedCount}</span>
            </h2>
            {queuedCount === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-6 text-center text-[13px] text-zinc-600">
                Queue is empty. Hand off work from the funnel or the floating queue, then tell CoWork “clear my queue.”
              </div>
            ) : (
              <div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {queueGroups.map(([type, list]) => {
                    const Icon = jobIcon(type);
                    const on = activeQueueTab === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setQueueTab(type)}
                        title={hasWip(list) ? `${loadHint(list.length)} · working now` : loadHint(list.length)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${wipBlink(list)} ${on ? "bg-violet-500 text-violet-50" : "bg-zinc-900/40 text-zinc-400 ring-1 ring-inset ring-zinc-800 hover:text-zinc-200"}`}
                      >
                        <Icon size={13} /> {jobVerb(type)}
                        <span className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${loadTone(list.length)}`}>{list.length}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30">
                  {queueItems.map((j) => {
                    const wip = j.status === "wip";
                    return (
                      <div key={j.id} className="group flex items-center gap-3 border-b border-zinc-800/60 px-4 py-2.5 last:border-0 hover:bg-zinc-900/50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-zinc-200">
                            {jobSubject(j) ?? j.task ?? "all postings"}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-zinc-600">
                            <span className="truncate">
                              {wip ? `claimed ${ago(j.claimedAt ?? j.createdAt)} by ${j.claimedBy ?? "CoWork"}` : `queued ${ago(j.createdAt)} by ${j.createdBy}`}
                            </span>
                            {(() => { const ws = jobWorkStatus(j); return ws ? <JobStatusChip status={ws} /> : null; })()}
                          </p>
                        </div>
                        {/* A `wip` job normally auto-requeues when its 60-min lease lapses — but if you
                            KNOW its CoWork thread died, force it back now (confirm-guarded). Queued
                            jobs get the remove (X). */}
                        {wip ? (
                          <button onClick={() => { if (confirm(KILL_CONFIRM)) requeue(j.id); }} title="Thread died? Force this stuck job back to the queue" className="shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-300"><RotateCcw size={15} /></button>
                        ) : (
                          <button onClick={() => remove(j.id)} title="Remove from queue" className="shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-300"><X size={15} /></button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Same hand-off as the floating queue: paste this into Claude CoWork to drain the
                    active type's queue (one type at a time). */}
                {activeQueueTab && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
                    <span>To run the <span className="font-medium text-zinc-300">{jobVerb(activeQueueTab)}</span> queue, paste into Claude CoWork:</span>
                    <CopyPrompt type={activeQueueTab} />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Each job TYPE + its playbook, editable inline. */}
          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">Playbooks</h2>
            <div className="space-y-2">
              {types.map((t) => {
                const Icon = jobIcon(t.type);
                const last = lastIngested(t.type);
                const line =
                  t.type === "inbox-sync"
                    ? ctx?.syncedThrough ? `synced through ${fmtTs(ctx.syncedThrough)}${last ? ` · ${last.summary}` : ""}` : "not synced yet"
                    : last ? `last run ${ago(last.createdAt)} · ${last.summary}` : "not run yet";
                const isOpen = open === t.type;
                return (
                  <div key={t.type} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30">
                    <button
                      onClick={() => toggle(t.type)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-900/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300"><Icon size={15} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="truncate text-[13px] text-zinc-500">{t.description}</p>
                        <p className="mt-0.5 truncate text-[12px] text-zinc-600">{line}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-zinc-500">
                        <Pencil size={11} /> playbook
                        <ChevronRight size={14} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </span>
                    </button>
                    {isOpen && <Playbook path={t.playbook} />}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Guides = the rest of the instruction folder (README + non-job playbooks). */}
          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">Guides</h2>
            <div className="space-y-2">
              {guides.map((f) => {
                const isOpen = open === f.path;
                return (
                  <div key={f.path} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30">
                    <button
                      onClick={() => toggle(f.path)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-900/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300"><FileText size={15} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{guideTitle(f)}</p>
                        <p className="truncate font-mono text-[12px] text-zinc-600">{f.path}</p>
                      </div>
                      <ChevronRight size={14} className={`shrink-0 text-zinc-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                    {isOpen && <Playbook path={f.path} />}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// Inline view/edit for a single instruction .md file. Loads lazily when its card opens,
// saves straight to disk via the same /api/instructions/file route the old page used.
function Playbook({ path }: { path: string }) {
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
    <div className="border-t border-zinc-800/80">
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="font-mono text-[12px] text-zinc-600">{path}</span>
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
        <div className="flex items-center gap-2 px-4 py-6 text-[13px] text-zinc-500">
          <Loader2 size={13} className="animate-spin" /> loading…
        </div>
      ) : mode === "edit" ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="h-80 w-full resize-y bg-zinc-950 px-4 py-3 font-mono text-[13px] leading-relaxed text-zinc-200 outline-none"
        />
      ) : (
        <article className="prose-instructions max-h-96 overflow-auto px-4 py-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>
      )}
    </div>
  );
}
