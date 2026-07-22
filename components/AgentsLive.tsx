"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, ChevronRight, Loader2, Play, Square, Send, Wrench, CheckCircle2, AlertCircle, Eraser, BookOpen, X } from "lucide-react";
import { agentColor } from "@/components/jobMeta";
import { ago } from "@/lib/format";
import { personaFor } from "@/lib/agents/personas";
import { useAgentChats, type Entry } from "@/components/AgentChatsProvider";
import AgentQueue from "@/components/AgentQueue";
import Playbook from "@/components/agents/Playbook";

type JobTypeMeta = { type: string; title: string; description: string; playbook: string };
type JobView = { type: string; status: string };

// The everyday loop — paste a JD → fit → tailor, plus the inbox reconcile that keeps stages honest.
// These three are the agents you drive daily, so they stay expanded up top. Every other job type is
// a supporting/occasional agent tucked under "Advanced" — collapsed, but never hidden (each keeps its
// own "Work queue" drain button, so a rarely-used queue can still be run).
const CORE_TYPES = new Set(["fit", "tailoring", "inbox-sync"]);

// The Claude-Code-backed Agents section: one agent per job type, each a live streaming conversation.
// All chat state lives in AgentChatsProvider (root layout), so conversations + in-flight runs survive
// navigating between pages; this component is just the view + the backlog counts.
export default function AgentsLive() {
  const { open, setOpen } = useAgentChats();
  const [types, setTypes] = useState<JobTypeMeta[]>([]);
  const [backlog, setBacklog] = useState<Record<string, number>>({});
  // Advanced (supporting) agents are collapsed by default so the page reads as the 3 core agents.
  const [showAdvanced, setShowAdvanced] = useState(false);
  // The agent whose instructions (playbook) are open in the side drawer, or null.
  const [instr, setInstr] = useState<{ title: string; type: string; playbook: string } | null>(null);

  const apply = useCallback((d: { types?: JobTypeMeta[]; jobs?: JobView[] }) => {
    setTypes(d.types ?? []);
    const counts: Record<string, number> = {};
    for (const j of d.jobs ?? []) if (j.status === "queued") counts[j.type] = (counts[j.type] ?? 0) + 1;
    setBacklog(counts);
  }, []);
  // Initial load + a light refresh so the "N queued" badges shrink as agents drain.
  useEffect(() => {
    let alive = true;
    const pull = () => fetch("/api/jobs").then((r) => r.json()).then((d) => { if (alive) apply(d); }).catch(() => {});
    pull();
    const iv = setInterval(pull, 12_000);
    return () => { alive = false; clearInterval(iv); };
  }, [apply]);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">
          <Bot size={13} className="text-sky-300" /> Agents
        </h2>
        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">Claude Code · live</span>
      </div>
      <p className="mb-2 text-[12px] text-zinc-500">One agent per task, each a live Claude Code conversation — watch every step, or steer it.</p>

      {(() => {
        const core = types.filter((t) => CORE_TYPES.has(t.type));
        const advanced = types.filter((t) => !CORE_TYPES.has(t.type));
        const advQueued = advanced.reduce((n, t) => n + (backlog[t.type] ?? 0), 0);
        const card = (t: JobTypeMeta) => (
          <AgentCard
            key={t.type}
            meta={t}
            backlog={backlog[t.type] ?? 0}
            open={open === t.type}
            onToggle={() => setOpen(open === t.type ? null : t.type)}
            onInstructions={() => setInstr({ title: personaFor(t.type), type: t.type, playbook: t.playbook })}
          />
        );
        if (types.length === 0)
          return <div className="rounded-2xl border border-dashed border-zinc-700 px-4 py-6 text-center text-[13px] text-zinc-400">loading agents…</div>;
        return (
          <div className="space-y-2">
            {core.map(card)}
            {advanced.length > 0 && (
              <div className="pt-1">
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wider text-zinc-500 transition hover:text-zinc-300"
                >
                  <ChevronRight size={13} className={`transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`} />
                  Advanced agents
                  <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-400">{advanced.length}</span>
                  {/* Surface queued work even while collapsed, so a rarely-run agent's backlog isn't missed. */}
                  {advQueued > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-200">{advQueued} queued</span>
                  )}
                </button>
                {showAdvanced && <div className="mt-2 space-y-2">{advanced.map(card)}</div>}
              </div>
            )}
          </div>
        );
      })()}

      {/* Instructions drawer — the selected agent's playbook (its operating manual), editable. */}
      {instr && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setInstr(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-3">
              <BookOpen size={15} className="text-violet-300" />
              <h3 className="text-[14px] font-semibold text-zinc-100">{instr.title} — instructions</h3>
              <button onClick={() => setInstr(null)} className="ml-auto rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"><X size={18} /></button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <Playbook path={instr.playbook} fill />
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

// Rough context-window per model (most Claude models are 200k; a few 1M-context variants exist).
function contextWindow(model?: string): number {
  return model && /1m|\[1m\]/i.test(model) ? 1_000_000 : 200_000;
}
const fmtTok = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

// How full this agent's resumed session context is — a bar + Xk label that goes amber at 70% and
// rose at 85%, so a long-lived session's context pressure is visible (nudge: hit the eraser to reset).
function ContextMeter({ tokens, model }: { tokens?: number; model?: string }) {
  const win = contextWindow(model);
  const known = typeof tokens === "number" && tokens > 0;
  const pct = known ? Math.min(100, (tokens! / win) * 100) : 0;
  const tone = !known ? { bar: "bg-zinc-700", text: "text-zinc-600" }
    : pct >= 85 ? { bar: "bg-rose-500", text: "text-rose-300" }
    : pct >= 70 ? { bar: "bg-amber-500", text: "text-amber-300" }
    : { bar: "bg-emerald-500", text: "text-zinc-400" };
  return (
    <span
      title={known
        ? `context ~${fmtTok(tokens!)} of ${fmtTok(win)} tokens (${Math.round(pct)}%)${pct >= 70 ? " — getting full; hit the eraser for a fresh session" : ""}`
        : "context meter — run this agent to measure its session size"}
      className="flex shrink-0 items-center gap-1.5"
    >
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-800">
        <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: known ? `${Math.max(4, pct)}%` : "0%" }} />
      </span>
      <span className={`text-[10px] tabular-nums ${tone.text}`}>{known ? fmtTok(tokens!) : "—"}</span>
    </span>
  );
}

function AgentCard({ meta, backlog, open, onToggle, onInstructions }: {
  meta: JobTypeMeta; backlog: number; open: boolean; onToggle: () => void; onInstructions: () => void;
}) {
  const { get, clear } = useAgentChats();
  const { running, contextTokens, model, entries, sessionId } = get(meta.type);
  const hasSession = !!sessionId || entries.length > 0 || !!contextTokens;
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30">
      <div className="flex items-center">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-900/50">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800"><Bot size={16} className={agentColor(meta.type)} /></span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              {personaFor(meta.type)}
              {running && <Loader2 size={12} className="animate-spin text-sky-300" />}
            </p>
            <p className="truncate text-[12px] text-zinc-500">{meta.title}</p>
          </div>
          {backlog > 0 && (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-bold tabular-nums text-zinc-300">{backlog} queued</span>
          )}
          <ChevronRight size={16} className={`shrink-0 text-zinc-600 transition ${open ? "rotate-90" : ""}`} />
        </button>
        {/* Context meter + one-click reset, side by side — see the session fill up, clear it right there. */}
        <div className="flex shrink-0 items-center gap-2 pl-1 pr-2">
          <ContextMeter tokens={contextTokens} model={model} />
          <button
            onClick={() => clear(meta.type)}
            disabled={running || !hasSession}
            title="Clear this agent's chat + reset its session (frees the context)"
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-rose-300 disabled:opacity-30"
          >
            <Eraser size={13} />
          </button>
        </div>
        {/* Each agent's operating manual, one click from where you talk to it. */}
        <button
          onClick={onInstructions}
          title="Instructions (this agent's playbook)"
          className="mr-3 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] text-zinc-400 ring-1 ring-inset ring-zinc-800 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          <BookOpen size={12} /> Instructions
        </button>
      </div>
      {open && (
        // Split view: live chat on the left, this agent's live queue (working + queued) on the right.
        // Fixed height so the chat's input pins to the bottom and the transcript scrolls within it.
        <div className="flex h-[32rem] border-t border-zinc-800/60">
          <div className="flex min-w-0 flex-1 flex-col"><LiveAgentChat type={meta.type} backlog={backlog} /></div>
          <aside className="hidden w-80 shrink-0 flex-col border-l border-zinc-800/60 md:flex">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Queue</p>
              <WorkQueueButton type={meta.type} />
            </div>
            <div className="min-h-0 flex-1">
              <AgentQueue type={meta.type} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

// Start/stop the queue drain — lives in the Queue panel (it acts on the queue). Toggles to Stop
// while a run is streaming.
function WorkQueueButton({ type }: { type: string }) {
  const { get, start, stop } = useAgentChats();
  const { running } = get(type);
  return running ? (
    <button onClick={() => stop(type)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-rose-500">
      <Square size={11} /> Stop
    </button>
  ) : (
    <button onClick={() => start(type)} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-sky-500">
      <Play size={11} /> Work queue
    </button>
  );
}

function LiveAgentChat({ type, backlog }: { type: string; backlog: number }) {
  const { get, start, stop, lastEventAt } = useAgentChats();
  const { entries, running } = get(type);
  const [input, setInput] = useState("");
  // Stall counter: seconds since the run last emitted anything (it auto-stops at 5 min — see the
  // route). Computed in a timer (not during render, to stay lint-pure); the tick also keeps the
  // "X min ago" timestamps fresh. Ticks every second while running, lazily otherwise.
  const [, setTick] = useState(0);
  const [idleSec, setIdleSec] = useState(0);
  useEffect(() => {
    const tick = () => {
      const s = lastEventAt(type);
      setIdleSec(running && s ? Math.max(0, Math.floor((Date.now() - s) / 1000)) : 0);
      setTick((t) => t + 1);
    };
    const iv = setInterval(tick, running ? 1_000 : 30_000);
    return () => clearInterval(iv);
  }, [running, type, lastEventAt]);
  const stalled = running && idleSec >= 20;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // only auto-scroll when already near the bottom — lets you scroll back
  const prevRunningRef = useRef(false);

  // Track whether the user is parked at the bottom; pause auto-scroll when they scroll up to read.
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  useEffect(() => {
    if (stickRef.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries]);
  useEffect(() => {
    if (prevRunningRef.current && !running) {
      const state = get(type);
      const lastAssistant = [...state.entries].reverse().find(
        (e): e is Extract<Entry, { role: "assistant" }> => e.role === "assistant",
      );
      if (lastAssistant) {
        window.pendo?.trackAgent("agent_response", {
          agentId: "jWe0OBiRjOpN1pzlG5ElbI1IOE0",
          conversationId: state.sessionId || type,
          messageId: `agent_response_${lastAssistant.id}`,
          content: lastAssistant.text,
          modelUsed: state.model,
        });
      }
    }
    prevRunningRef.current = running;
  }, [running, type, get]);

  const submit = () => {
    const m = input.trim();
    if (m && !running) {
      window.pendo?.trackAgent("prompt", {
        agentId: "jWe0OBiRjOpN1pzlG5ElbI1IOE0",
        conversationId: get(type).sessionId || type,
        messageId: crypto.randomUUID(),
        content: m,
      });
      setInput(""); stickRef.current = true; start(type, m);
    }
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {entries.length === 0 && (
          <p className="py-5 text-center text-[12px] text-zinc-500">
            {backlog > 0
              ? `${backlog} job${backlog === 1 ? "" : "s"} queued — hit “Work queue” to drain them live, or type to steer.`
              : "Nothing queued. Type a message, or hit “Work queue” to check for work."}
          </p>
        )}
        {entries.map((en) => <EntryRow key={en.id} en={en} color={agentColor(type)} />)}
        {running && (
          <div className={`flex items-center gap-2 text-[12px] ${stalled ? "text-amber-300" : "text-zinc-400"}`}>
            <Loader2 size={13} className={`animate-spin ${stalled ? "text-amber-300" : "text-sky-300"}`} />
            {stalled ? `no activity for ${idleSec}s — may be stuck (auto-stops at 5 min)` : "working…"}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-zinc-800/60 px-3 py-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder={`Message the ${personaFor(type)}…`}
          className="max-h-28 min-w-0 flex-1 resize-none rounded-xl bg-zinc-900 px-3 py-2 text-[13px] text-zinc-100 outline-none ring-1 ring-inset ring-zinc-800 placeholder:text-zinc-600 focus:ring-sky-500/40"
        />
        {/* Always-visible run/stop control (the side queue panel is hidden on narrow screens, so the
            Stop must live here too): Stop while running · Send when you've typed · Work-queue when idle. */}
        {running ? (
          <button
            onClick={() => stop(type)}
            title="Stop the agent"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-[12px] font-medium text-white transition hover:bg-rose-500"
          >
            <Square size={13} /> Stop
          </button>
        ) : input.trim() ? (
          <button
            onClick={submit}
            title="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white transition hover:bg-sky-500"
          >
            <Send size={15} />
          </button>
        ) : (
          <button
            onClick={() => start(type)}
            title="Work the queue"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-3 text-[12px] font-medium text-white transition hover:bg-sky-500"
          >
            <Play size={13} /> Work queue
          </button>
        )}
        {/* Reset lives on the card row next to the context meter (always visible) — no duplicate here. */}
      </div>
    </div>
  );
}

const EntryRow = memo(function EntryRow({ en, color }: { en: Entry; color: string }) {
  // iMessage style: your messages are blue bubbles on the right; the agent's are grey bubbles on the
  // left, each led by its robot avatar.
  if (en.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sky-600 px-3 py-1.5 text-[12px] leading-relaxed text-white">{en.text}</div>
      </div>
    );

  if (en.role === "assistant")
    return (
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 ring-1 ring-zinc-700"><Bot size={12} className={color} /></span>
        <div className="min-w-0">
          <div className="prose prose-invert prose-sm max-w-[82%] rounded-2xl rounded-bl-md bg-zinc-800 px-3 py-1.5 text-[12px] leading-relaxed text-zinc-100 prose-p:my-1 prose-pre:my-1 prose-ul:my-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{en.text}</ReactMarkdown>
          </div>
          {en.at && <p className="mt-0.5 pl-1 text-[10px] text-zinc-600">{ago(en.at)}</p>}
        </div>
      </div>
    );

  if (en.role === "note") {
    // A session-boundary marker (↻ …) renders as an unmistakable divider so the reset is obvious;
    // other notes (errors/exits) stay as plain centered text.
    if (en.text.startsWith("↻"))
      return (
        <div className="flex items-center gap-2 py-1 text-[10px] font-medium tracking-wide text-zinc-500">
          <span className="h-px flex-1 bg-zinc-800" />
          {en.text}
          <span className="h-px flex-1 bg-zinc-800" />
        </div>
      );
    return <p className={`text-center text-[11px] ${en.error ? "text-rose-300" : "text-zinc-500"}`}>{en.text}</p>;
  }

  // tool rows align under the avatar
  return <div className="pl-8"><ToolRow en={en} /></div>;
});

function ToolRow({ en }: { en: Extract<Entry, { role: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const inputStr = en.input != null ? JSON.stringify(en.input) : "";
  const compact = inputStr.length > 100 ? `${inputStr.slice(0, 100)}…` : inputStr;
  return (
    <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/40">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
        <Wrench size={12} className="shrink-0 text-violet-300" />
        <span className="font-mono text-[12px] text-violet-200">{en.name}</span>
        {compact && <span className="truncate font-mono text-[11px] text-zinc-500">{compact}</span>}
        <span className="ml-auto shrink-0">
          {!en.result ? <Loader2 size={11} className="animate-spin text-zinc-500" />
            : en.result.ok ? <CheckCircle2 size={12} className="text-emerald-400" />
            : <AlertCircle size={12} className="text-rose-400" />}
        </span>
      </button>
      {open && en.result && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-t border-zinc-800/70 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-zinc-400">
          {en.result.preview || "(no output)"}
        </pre>
      )}
    </div>
  );
}
