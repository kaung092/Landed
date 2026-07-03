"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, ChevronRight, ExternalLink, X, Hourglass } from "lucide-react";
import { ago } from "@/lib/format";
import PopoverPanel, { anchorFrom } from "@/components/Popover";

// A CoWork chat ("thread") = one MCP server process. The app can't see inside Claude Desktop, so we
// reconstruct each chat from what it does over MCP: the jobs it claims (job.thread_id) and a
// per-call step trace. We group everything by PERSONA (job type): each persona "lane" shows its
// unclaimed backlog, the chat(s) running it, and a live step timeline. There's no separate queue
// view — pending work is folded in here, under the agent that handles it.

type ThreadJob = { id: string; type: string; status: string; summary?: string | null; createdAt: string; claimedAt?: string | null };
type ThreadStep = { ts: string; tool: string; jobId?: string | null; ok: boolean; durationMs?: number | null; summary?: string | null };
type Thread = {
  id: string;
  label: string | null;
  pid: number | null;
  startedAt: string;
  lastSeenAt: string;
  stepCount: number;
  live: boolean;
  working: boolean;
  jobs: ThreadJob[];
  steps: ThreadStep[];
};
type BacklogItem = { id: string; label: string };
type Backlog = Record<string, BacklogItem[]>;

// Open Claude Desktop. We have our own thread id, not Claude's internal chat id, so we can't yet
// deep-link to the *exact* chat (claude://cowork/<coworkSessionId>) — that needs CoWork to report
// its session id over MCP (a follow-up). For now this just focuses the app.
const OPEN_COWORK = "claude://";

// What CoWork "says" for each MCP tool — first person, so the timeline reads like CoWork chatting
// to you about what it's doing. The raw method name still rides along (dimmed): fun, but honest.
const TOOL_LABEL: Record<string, { emoji: string; text: string }> = {
  listWatchlist: { emoji: "👀", text: "Peeking at the watchlist…" },
  listCompanies: { emoji: "🏢", text: "Skimming every company on file." },
  scanWatchlist: { emoji: "🛰️", text: "Sweeping the whole watchlist for fresh roles." },
  scanCompany: { emoji: "🔭", text: "Scanning a company's job board." },
  listApplications: { emoji: "🗂️", text: "Checking what's already tracked." },
  getContext: { emoji: "🧭", text: "Getting my bearings." },
  listJobs: { emoji: "📥", text: "Sizing up the queue." },
  waitForWork: { emoji: "⏳", text: "Waiting for the next job…" },
  claimNext: { emoji: "✊", text: "Grabbing the next job to work on." },
  claimJob: { emoji: "✊", text: "Claiming a job." },
  getPlaybook: { emoji: "📖", text: "Brushing up on the playbook." },
  submitJobResult: { emoji: "✅", text: "Turned in my work!" },
  submitGlance: { emoji: "⚡", text: "Gave it a quick gut-check." },
  savePostingJd: { emoji: "💾", text: "Saved the job description for later." },
  updateApplication: { emoji: "✏️", text: "Tidied up an application." },
  createJob: { emoji: "➕", text: "Lined up another job." },
  upsertCompanies: { emoji: "🏢", text: "Saved some company details." },
  addToWatchlist: { emoji: "⭐", text: "Added a company to keep an eye on." },
  removeFromWatchlist: { emoji: "🚫", text: "Stopped watching a company." },
};
const toolLabel = (t: string) => TOOL_LABEL[t] ?? { emoji: "⚙️", text: `Called ${t}.` };

// Each job type is a personified agent — a robot in its own color. Colors are literal Tailwind
// classes (no dynamic construction, so they purge OK).
type Persona = { name: string; icon: string; ring: string };
const TYPE_PERSONA: Record<string, Persona> = {
  fit: { name: "Fit Assessor", icon: "text-emerald-300", ring: "bg-emerald-500/15 ring-emerald-500/30" },
  tailoring: { name: "Résumé Tailor", icon: "text-fuchsia-300", ring: "bg-fuchsia-500/15 ring-fuchsia-500/30" },
  "inbox-sync": { name: "Inbox Scout", icon: "text-sky-300", ring: "bg-sky-500/15 ring-sky-500/30" },
  "watchlist-scan": { name: "Board Scanner", icon: "text-amber-300", ring: "bg-amber-500/15 ring-amber-500/30" },
  "watchlist-add": { name: "Watchlist Curator", icon: "text-yellow-300", ring: "bg-yellow-500/15 ring-yellow-500/30" },
  leveling: { name: "Leveler", icon: "text-teal-300", ring: "bg-teal-500/15 ring-teal-500/30" },
  "prep-research": { name: "Prep Researcher", icon: "text-rose-300", ring: "bg-rose-500/15 ring-rose-500/30" },
  discovery: { name: "Scout", icon: "text-cyan-300", ring: "bg-cyan-500/15 ring-cyan-500/30" },
};
const DEFAULT_PERSONA: Persona = { name: "CoWork", icon: "text-violet-300", ring: "bg-violet-500/15 ring-violet-500/25" };
const personaFor = (type: string | null) => (type && TYPE_PERSONA[type]) || DEFAULT_PERSONA;

// A chat's dominant job type (one-type-per-chat → unambiguous), or null before it claims anything.
function dominantType(t: Thread): string | null {
  const counts: Record<string, number> = {};
  for (const j of t.jobs) counts[j.type] = (counts[j.type] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// A chat this deep is carrying a lot of context — nudge the user to start a fresh one for its type.
const LONG_CHAT_STEPS = 120;

// The one-time message that turns a fresh CoWork chat into a parked, app-driven worker for one type.
// Paste once per session; thereafter the Drain button (or new queued work) wakes it.
function kickoffPrompt(type: string, name: string): string {
  return [
    `You're my ${name}. Your only job type is "${type}".`,
    `Loop forever: call waitForWork({type:"${type}"}). When it returns ready:true, drain the queue —`,
    `claimNext({type:"${type}"}) → do the work per the job's playbook (getPlaybook) → submitJobResult —`,
    `and repeat until claimNext returns no job. Then call waitForWork again and keep waiting.`,
    `Stay silent between polls (don't narrate). Never stop the loop on your own.`,
  ].join(" ");
}

function CopyKickoff({ type, name }: { type: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(kickoffPrompt(type, name)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };
  return (
    <button onClick={copy} className={`rounded-lg px-2 py-1 text-[11px] font-medium ring-1 ring-inset transition ${copied ? "text-emerald-300 ring-emerald-500/40" : "text-violet-300 ring-violet-500/30 hover:ring-violet-500/50"}`}>
      {copied ? "Copied!" : "Copy kickoff prompt"}
    </button>
  );
}

// The persona's robot badge — a colored bot in a tinted circle.
function PersonaBot({ p, size = 12, box = 6 }: { p: Persona; size?: number; box?: number }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ring-1 ${p.ring}`} style={{ height: box * 4, width: box * 4 }}>
      <Bot size={size} className={p.icon} />
    </span>
  );
}

// live + working = green pulse; live + idle = steady amber; stale = grey.
function StatusDot({ live, working }: { live: boolean; working: boolean }) {
  const cls = working && live ? "bg-emerald-400" : live ? "bg-amber-400" : "bg-zinc-600";
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {working && live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${cls}`} />
    </span>
  );
}

// ── A lane: one persona, its backlog (inbox), and the chats running it ──
type Lane = { type: string | null; persona: Persona; queued: number; queuedJobs: BacklogItem[]; threads: Thread[] };

function buildLanes(threads: Thread[], backlog: Backlog): Lane[] {
  const byType = new Map<string, Thread[]>();
  const generic: Thread[] = [];
  for (const t of threads) {
    const top = dominantType(t);
    if (top) (byType.get(top) ?? byType.set(top, []).get(top)!).push(t);
    else generic.push(t);
  }
  const types = new Set<string>([...Object.keys(backlog), ...byType.keys()]);
  const lanes: Lane[] = [...types].map((type) => {
    const queuedJobs = backlog[type] ?? [];
    return { type, persona: personaFor(type), queued: queuedJobs.length, queuedJobs, threads: byType.get(type) ?? [] };
  });
  if (generic.length) lanes.push({ type: null, persona: DEFAULT_PERSONA, queued: 0, queuedJobs: [], threads: generic });
  // Most alive first: working > live > has backlog > recency.
  const score = (l: Lane) =>
    (l.threads.some((t) => t.working) ? 1000 : 0) + (l.threads.some((t) => t.live) ? 100 : 0) + (l.queued > 0 ? 10 : 0);
  return lanes.sort((a, b) => score(b) - score(a));
}

const laneCounts = (l: Lane) => ({
  queued: l.queued,
  working: l.threads.reduce((n, t) => n + t.jobs.filter((j) => j.status === "wip").length, 0),
  done: l.threads.reduce((n, t) => n + t.jobs.filter((j) => j.status === "ingested").length, 0),
});

function useThreads(pollMs: number, steps = 40) {
  const [data, setData] = useState<{ threads: Thread[]; backlog: Backlog }>({ threads: [], backlog: {} });
  const refresh = useCallback(() => {
    fetch(`/api/threads?steps=${steps}`)
      .then((r) => r.json())
      .then((d) => setData({ threads: d.threads ?? [], backlog: d.backlog ?? {} }))
      .catch(() => {});
  }, [steps]);
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, pollMs);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, [refresh, pollMs]);
  return { ...data, refresh };
}

// ── One iMessage-style bubble: robot avatar + grey bubble, with the time + MCP method underneath ──
function ChatLine({ s, p }: { s: ThreadStep; p: Persona }) {
  const f = toolLabel(s.tool);
  const detail = s.summary && !/^error:/i.test(s.summary) ? s.summary : null;
  const errText = s.summary?.replace(/^error:\s*/i, "");
  return (
    <li className="flex items-start gap-2 py-1">
      <PersonaBot p={p} />
      <div className="min-w-0 max-w-[88%]">
        <div className={`inline-block rounded-2xl rounded-bl-md px-3 py-1.5 text-[12px] leading-snug ${s.ok ? "bg-zinc-800 text-zinc-100" : "bg-rose-500/20 text-rose-100"}`}>
          {s.ok ? (
            <>{f.text} <span className="text-[11px]">{f.emoji}</span>{detail && <span className="text-zinc-400"> · {detail}</span>}</>
          ) : (
            <>Hit a snag 😬{errText ? <span className="text-rose-200/90"> — {errText}</span> : null}</>
          )}
        </div>
        <div className="mt-0.5 pl-1.5 text-[10px] tabular-nums text-zinc-500">
          {ago(s.ts)}<span className="ml-1.5 font-mono">{s.tool}</span>
        </div>
      </div>
    </li>
  );
}

// Collapse runs of consecutive `waitForWork` polls into one entry, so idle waiting shows as a single
// "Waiting…" bubble (with a count) instead of spamming the timeline with one message per poll.
type FoldedStep = ThreadStep & { count: number };
function foldSteps(steps: ThreadStep[]): FoldedStep[] {
  const out: FoldedStep[] = [];
  for (const s of steps) {
    const prev = out[out.length - 1];
    if (s.tool === "waitForWork" && prev?.tool === "waitForWork") {
      prev.count += 1;
      prev.ts = s.ts; // keep the latest poll's time
    } else {
      out.push({ ...s, count: 1 });
    }
  }
  return out;
}

// The single collapsed waiting bubble. `live` (trailing run on a live chat) = the hourglass spins.
function WaitingLine({ e, p, live }: { e: FoldedStep; p: Persona; live: boolean }) {
  return (
    <li className="flex items-start gap-2 py-1">
      <PersonaBot p={p} />
      <div className="min-w-0">
        <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-zinc-800 px-3 py-1.5 text-[12px] text-zinc-200">
          <Hourglass size={12} className={`text-zinc-400 ${live ? "animate-spin [animation-duration:2s]" : ""}`} />
          {live ? "Waiting for the next job…" : "Waited for work."}
        </div>
        <div className="mt-0.5 pl-1.5 text-[10px] tabular-nums text-zinc-500">
          {ago(e.ts)}<span className="ml-1.5 font-mono">waitForWork</span>
        </div>
      </div>
    </li>
  );
}

// ── One chat = one continuous box: a thin sub-header (liveness / dismiss) + the message stream +
// a "Drain my queue" suggestion chip at the bottom (like a quick-reply). No separate jobs section —
// claimed/working/done all read from the stream itself (✊ grabbed … ✅ turned in). ──
function ChatBlock({ t, p, type, onDelete, onWake }: { t: Thread; p: Persona; type: string | null; onDelete: (id: string) => void; onWake: (type: string) => void }) {
  const [logOpen, setLogOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const long = t.stepCount >= LONG_CHAT_STEPS;
  const steps = foldSteps([...t.steps].reverse()); // newest-first → oldest→newest, idle polls folded
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!logOpen && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [t.steps.length, logOpen]);
  const drain = () => { if (type) { onWake(type); setSent(true); setTimeout(() => setSent(false), 2500); } };

  return (
    <div className="group/chat rounded-xl bg-zinc-900/40 px-3 py-2">
      <div className="flex items-center gap-2 text-[11px]">
        <StatusDot live={t.live} working={t.working} />
        {(() => {
          const isCC = (t.label ?? "").toLowerCase().includes("claude code");
          return <span className={`rounded px-1.5 text-[10px] font-medium ${isCC ? "bg-sky-500/20 text-sky-200" : "bg-violet-500/20 text-violet-200"}`}>{t.label || "CoWork"}</span>;
        })()}
        <span className="text-zinc-300">{t.live ? `active ${ago(t.lastSeenAt)}` : `last seen ${ago(t.lastSeenAt)}`}</span>
        {!t.live && <span className="rounded bg-zinc-800 px-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-300">inactive</span>}
        {long && <span title="This chat has done a lot — its context is getting large. Start a fresh chat for this type to keep CoWork sharp." className="rounded bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-300">getting long</span>}
        {steps.length > 6 && (
          <button onClick={() => setLogOpen((o) => !o)} className="ml-auto text-[11px] font-medium text-violet-300 transition hover:text-violet-200">
            {logOpen ? "Show less" : `Show full log (${steps.length})`}
          </button>
        )}
        <button onClick={() => onDelete(t.id)} title="Hide this chat (returns if it acts again)" className={`text-zinc-600 opacity-0 transition group-hover/chat:opacity-100 hover:text-rose-300 ${steps.length > 6 ? "" : "ml-auto"}`}><X size={13} /></button>
      </div>

      {/* the message stream — the whole chat */}
      {steps.length === 0 ? (
        <p className="mt-2 text-[12px] text-zinc-400">Nothing yet — this chat has made no moves. 🦗</p>
      ) : (
        <div ref={scrollRef} className={`mt-1 ${logOpen ? "" : "max-h-72 overflow-y-auto"}`}>
          <ul>
            {steps.map((s, k) =>
              s.tool === "waitForWork"
                ? <WaitingLine key={k} e={s} p={p} live={k === steps.length - 1 && t.live} />
                : <ChatLine key={k} s={s} p={p} />,
            )}
          </ul>
        </div>
      )}

      {/* quick-reply suggestion: tap to wake this agent so it drains its queue now */}
      {type && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={drain}
            title="Wake this agent to drain its queue now"
            className={`rounded-2xl rounded-br-md px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition ${sent ? "bg-emerald-600" : "bg-sky-600 hover:bg-sky-500"}`}
          >
            {sent ? "Sent ✓" : "💬 Drain my queue"}
          </button>
        </div>
      )}
    </div>
  );
}

const jobItems = (jobs: ThreadJob[], status: string): BacklogItem[] =>
  jobs.filter((j) => j.status === status).map((j) => ({ id: j.id, label: j.summary ?? j.id }));

// A labeled list, rendered inside a popover panel (the panel provides the chrome).
function JobList({ items, empty }: { items: BacklogItem[]; empty: string }) {
  if (items.length === 0) return <p className="px-3 py-2 text-[12px] text-zinc-500">{empty}</p>;
  return (
    <ul className="max-h-72 space-y-0.5 overflow-y-auto py-1">
      {items.map((it) => (
        <li key={it.id} className="flex items-center gap-2 px-3 py-1 text-[12px] text-zinc-200">
          <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
          <span className="truncate">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

type View = "inbox" | "working" | "done";
const PILL_TONE: Record<View, { idle: string; active: string }> = {
  inbox: { idle: "text-zinc-300 hover:bg-zinc-800", active: "bg-zinc-700 text-zinc-50" },
  working: { idle: "text-amber-300 hover:bg-amber-500/10", active: "bg-amber-500/25 text-amber-100" },
  done: { idle: "text-emerald-300 hover:bg-emerald-500/10", active: "bg-emerald-500/25 text-emerald-100" },
};
function Pill({ view, n, active, onClick }: { view: View; n: number; active: boolean; onClick: (e: React.MouseEvent) => void }) {
  const tone = PILL_TONE[view];
  const label = view[0].toUpperCase() + view.slice(1);
  return (
    <button
      onClick={onClick}
      disabled={n === 0}
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums transition ${n === 0 ? "cursor-default text-zinc-600" : active ? tone.active : tone.idle}`}
    >
      {label} {n}
    </button>
  );
}

// ── Full lane (CoWork page) ──
function LaneCard({ l, onDelete, onWake, onRun }: { l: Lane; onDelete: (id: string) => void; onWake: (type: string) => void; onRun: (type: string) => void }) {
  const anyLive = l.threads.some((t) => t.live);
  const anyWorking = l.threads.some((t) => t.working);
  const [open, setOpen] = useState(anyWorking || l.queued > 0);
  const [pop, setPop] = useState<{ view: View; at: { x: number; y: number } } | null>(null);
  const [ran, setRan] = useState(false);

  const allJobs = l.threads.flatMap((t) => t.jobs);
  const working = jobItems(allJobs, "wip");
  const done = jobItems(allJobs, "ingested");
  // One chat box per RUNTIME (label): CoWork and Claude Code each get their own box; duplicate
  // threads of the same runtime (from MCP restarts) collapse to the live/most-recent one.
  const byLabel = new Map<string, Thread[]>();
  for (const t of l.threads) {
    const k = t.label || "CoWork";
    (byLabel.get(k) ?? byLabel.set(k, []).get(k)!).push(t);
  }
  const sortLive = (a: Thread, b: Thread) => Number(b.live) - Number(a.live) || b.lastSeenAt.localeCompare(a.lastSeenAt);
  const chats = [...byLabel.values()].map((g) => [...g].sort(sortLive)[0]).sort(sortLive);
  const run = () => { if (l.type) { onRun(l.type); setRan(true); setTimeout(() => setRan(false), 2500); } };

  // Each pill opens a popover (anchored to it) with the list — not appended to the chat box.
  const openPop = (view: View, e: React.MouseEvent) =>
    setPop((cur) => (cur?.view === view ? null : { view, at: anchorFrom(e) }));
  const popItems = pop ? (pop.view === "inbox" ? l.queuedJobs : pop.view === "working" ? working : done) : [];
  const popEmpty = pop?.view === "inbox" ? "Inbox is empty." : pop?.view === "working" ? "Nothing in progress." : "Nothing finished yet.";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30">
      <div className="group flex w-full items-center gap-2.5 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          {open ? <ChevronDown size={15} className="shrink-0 text-zinc-400" /> : <ChevronRight size={15} className="shrink-0 text-zinc-400" />}
          <StatusDot live={anyLive} working={anyWorking} />
          <PersonaBot p={l.persona} box={6} />
          <span className="truncate text-[13px] font-medium text-zinc-100">{l.persona.name}</span>
        </button>
        {/* Clickable counts → open a popover with the matching list. */}
        <div className="flex shrink-0 items-center gap-1">
          <Pill view="inbox" n={l.queued} active={pop?.view === "inbox"} onClick={(e) => openPop("inbox", e)} />
          <Pill view="working" n={working.length} active={pop?.view === "working"} onClick={(e) => openPop("working", e)} />
          <Pill view="done" n={done.length} active={pop?.view === "done"} onClick={(e) => openPop("done", e)} />
        </div>
        {/* Per-agent shortcut to CoWork. NB: opens the app, not this exact chat — we hold our own
            thread id, not Claude's chat id (true per-chat deep-link needs CoWork to report it). */}
        <a href={OPEN_COWORK} title="Open CoWork" className="shrink-0 text-zinc-500 transition hover:text-violet-300"><ExternalLink size={14} /></a>
      </div>

      {open && (
        <div className="space-y-2 border-t border-zinc-800/60 px-4 py-3">
          {l.type && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-zinc-700/70 px-3 py-2 text-[12px]">
              {/* Two ways to drain: spawn a headless Claude Code run (one click, no chat needed), or
                  paste a kickoff prompt into a CoWork chat (browser + desktop tools). */}
              <button
                onClick={run}
                title="Spawn a headless Claude Code run that drains this queue and exits (uses your subscription)"
                className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-900 transition hover:bg-white"
              >
                {ran ? "Started ✓" : "▶ Run with Claude Code"}
              </button>
              <span className="text-zinc-600">or</span>
              <span className="text-zinc-500">paste into a CoWork chat:</span>
              <CopyKickoff type={l.type} name={l.persona.name} />
            </div>
          )}
          {chats.map((t) => <ChatBlock key={t.id} t={t} p={l.persona} type={l.type} onDelete={onDelete} onWake={onWake} />)}
        </div>
      )}

      {pop && (
        <PopoverPanel at={pop.at} onClose={() => setPop(null)} className="w-72">
          <JobList items={popItems} empty={popEmpty} />
        </PopoverPanel>
      )}
    </div>
  );
}

// ── Compact lane (floating robot): live agents only; the page is the full view ──
function CompactLane({ l, onDelete }: { l: Lane; onDelete: (id: string) => void }) {
  const anyLive = l.threads.some((t) => t.live);
  const anyWorking = l.threads.some((t) => t.working);
  const lastSeen = l.threads.map((t) => t.lastSeenAt).sort().pop();
  const c = laneCounts(l);
  return (
    <div className="group px-4 py-2">
      <div className="flex items-center gap-2">
        <StatusDot live={anyLive} working={anyWorking} />
        <PersonaBot p={l.persona} size={11} box={5} />
        <span className="truncate text-[12px] font-medium text-zinc-200">{l.persona.name}</span>
        {lastSeen && <span className="ml-auto shrink-0 text-[11px] text-zinc-400">{ago(lastSeen)}</span>}
        {l.threads.length === 1 && (
          <button onClick={() => onDelete(l.threads[0].id)} title="Hide this chat (returns if it acts again)" className="shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-300"><X size={12} /></button>
        )}
      </div>
      <p className="mt-0.5 flex items-center gap-2 pl-4 text-[11px] tabular-nums">
        {c.queued > 0 && <span className="text-zinc-400">{c.queued} queued</span>}
        {c.working > 0 && <span className="text-amber-300">{c.working} working</span>}
        {c.done > 0 && <span className="text-emerald-300">{c.done} done</span>}
        {c.queued + c.working + c.done === 0 && <span className="text-zinc-500">idle</span>}
      </p>
    </div>
  );
}

export default function CoWorkThreads({ compact = false }: { compact?: boolean }) {
  // Full page keeps a deeper log so "show full log" has something to show; the compact strip stays light.
  const { threads, backlog, refresh } = useThreads(compact ? 10_000 : 8_000, compact ? 12 : 150);
  const onDelete = useCallback((id: string) => {
    fetch(`/api/threads/${id}`, { method: "DELETE" }).then(refresh).catch(() => {});
  }, [refresh]);
  // Wake a parked agent of this type (sets the one-shot trigger its waitForWork loop consumes).
  const onWake = useCallback((type: string) => {
    fetch("/api/jobs/wait", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type }) }).catch(() => {});
  }, []);
  // Spawn a headless Claude Code run to drain this type (runs on the subscription, then exits).
  const onRun = useCallback((type: string) => {
    fetch("/api/agents/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type }) }).then(refresh).catch(() => {});
  }, [refresh]);

  const lanes = buildLanes(threads, backlog);

  if (compact) {
    // Floating strip = live agents only (backlog clutter belongs on the page).
    const live = lanes.filter((l) => l.threads.length > 0);
    if (live.length === 0) return null;
    return (
      <div className="border-b border-zinc-800">
        <p className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
          <Bot size={12} className="text-violet-300" /> Agents
        </p>
        <div className="max-h-56 divide-y divide-zinc-800/40 overflow-y-auto">
          {live.map((l) => <CompactLane key={l.type ?? "_generic"} l={l} onDelete={onDelete} />)}
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
          Agents
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-amber-300/90 ring-1 ring-inset ring-amber-500/25">Deprecating</span>
          {lanes.length > 0 && <span className="rounded-full bg-zinc-800 px-1.5 text-[11px] font-bold tabular-nums text-zinc-400">{lanes.length}</span>}
        </h2>
        {/* App-level, NOT per-thread: we can't deep-link to a specific chat yet (we hold our own
            thread id, not Claude's chat id), so this just focuses Claude Desktop. */}
        <a
          href={OPEN_COWORK}
          title="Open Claude Desktop"
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-400 ring-1 ring-inset ring-zinc-800 transition hover:text-violet-200 hover:ring-violet-500/40"
        >
          <ExternalLink size={12} /> Open CoWork
        </a>
      </div>
      {lanes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 px-4 py-6 text-center text-[13px] text-zinc-400">
          🤖 No work yet. Hand off jobs from the funnel and they show up here under the agent that handles them, with a play-by-play of every move.
        </div>
      ) : (
        <div className="space-y-2">
          {lanes.map((l) => <LaneCard key={l.type ?? "_generic"} l={l} onDelete={onDelete} onWake={onWake} onRun={onRun} />)}
        </div>
      )}
    </section>
  );
}
