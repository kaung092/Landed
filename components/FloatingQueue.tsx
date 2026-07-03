"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, X, ArrowRight, Play, Square } from "lucide-react";
import { useCoWorkQueue } from "@/components/CoWorkQueueProvider";
import { useAgentChats } from "@/components/AgentChatsProvider";
import { loadTone, loadHint, hasWip, wipBlink, agentColor } from "@/components/jobMeta";
import { personaFor } from "@/lib/agents/personas";
import AgentQueue from "@/components/AgentQueue";

// Group queued jobs by type, preserving newest-first order (so the just-added type floats up).
function groupByType<T extends { type: string }>(items: T[]): [string, T[]][] {
  const g = new Map<string, T[]>();
  for (const it of items) (g.get(it.type) ?? g.set(it.type, []).get(it.type)!).push(it);
  return [...g.entries()];
}

// Bottom-right floating CoWork queue: a count badge that pops when you hand off work (from the
// discovery funnel), a popover of the most recent queued jobs (removable), and a link to the full
// CoWork page. Pure notification surface — jobs are added contextually, not here. Mounted once in
// the layout, backed by the shared queue context.
export default function FloatingQueue() {
  const { jobs, count, pulse } = useCoWorkQueue();
  const [open, setOpen] = useState(false);
  // Any job an agent has claimed (wip) → an agent is actively working; the Bot icon spins to show it.
  const working = jobs.some((j) => j.status === "wip");

  // Idle, the icon tucks off the right edge showing only a ~25% sliver; it slides fully into view on
  // hover, while the panel is open, or briefly when a job is queued (pulse). The wrapper reaches the
  // screen edge (right-0 + pr-6) so its hover area covers both the sliver and the revealed button —
  // otherwise the icon would flicker as it slid out from under the cursor.
  const revealed = open || pulse;

  return (
    <div className="group fixed bottom-6 right-0 z-50 flex flex-col items-end gap-3 pr-6">
      {open && <Panel onClose={() => setOpen(false)} jobs={jobs} count={count} />}

      <button
        onClick={() => setOpen((o) => !o)}
        title={working ? "Agent queue — working…" : "Agent queue"}
        className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500 text-violet-50 shadow-lg shadow-violet-500/30 ring-1 ring-violet-400/40 transition duration-300 ease-out hover:bg-violet-400 ${pulse ? "scale-110" : "scale-100"} ${working ? "cowork-working-box" : ""} ${revealed ? "translate-x-0" : "translate-x-[66px] group-hover:translate-x-0"}`}
      >
        {pulse && <span className="absolute inset-0 animate-ping rounded-2xl bg-violet-400/60" />}
        {/* "CoWork is working" indicator (any job in progress): the Bot icon spins slowly while the
            violet box breathes a glow (robot-lab variant 14). */}
        <Bot size={22} strokeWidth={2.2} className={`relative ${working ? "cowork-working-icon" : ""}`} />
        {count > 0 && (
          <span className={`absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[var(--background)] bg-amber-400 px-1 text-[12px] font-bold tabular-nums text-amber-950 transition-transform ${pulse ? "scale-125" : "scale-100"}`}>
            {count}
          </span>
        )}
      </button>
    </div>
  );
}

function Panel({ jobs, count, onClose }: { jobs: ReturnType<typeof useCoWorkQueue>["jobs"]; count: number; onClose: () => void }) {
  const groups = groupByType(jobs);
  const [tab, setTab] = useState<string | null>(null);
  // The SAME live agent the Agents page shows (shared provider) — so the floating "Run" and the
  // on-screen robot are one run, not two separate processes.
  const { get, start, stop, setOpen } = useAgentChats();
  // Active agent tab, falling back to the first (and recovering if the active type drains away).
  const active = tab && groups.some(([t]) => t === tab) ? tab : groups[0]?.[0] ?? null;
  const running = active ? get(active).running : false;

  const toggleRun = () => {
    if (!active) return;
    if (running) stop(active);
    else { setOpen(active); start(active); } // open it on the Agents page too, then run
  };

  return (
    <div className="w-80 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-zinc-100">
          <Bot size={14} className="text-sky-300" /> Agent queues
          <span className="rounded-full bg-zinc-800 px-1.5 text-[11px] font-bold tabular-nums text-zinc-400">{count}</span>
        </h3>
        <button onClick={onClose} title="Close" className="text-zinc-500 hover:text-zinc-300"><X size={15} /></button>
      </div>

      {groups.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-zinc-600">No agent has work queued — hand off from the funnel.</p>
      ) : (
        <>
          {/* One tab per agent (with work) — colored robot + persona + its queue depth. */}
          <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-2 py-2">
            {groups.map(([type, list]) => (
              <button
                key={type}
                onClick={() => setTab(type)}
                title={hasWip(list) ? `${loadHint(list.length)} · working now` : loadHint(list.length)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${wipBlink(list)} ${active === type ? "bg-zinc-800 text-zinc-100 ring-1 ring-inset ring-zinc-700" : "text-zinc-400 hover:bg-zinc-800/60"}`}
              >
                <Bot size={12} className={agentColor(type)} /> {personaFor(type)}
                <span className={`rounded-full px-1 text-[11px] font-bold tabular-nums ${loadTone(list.length)}`}>{list.length}</span>
              </button>
            ))}
          </div>

          {/* What the active agent is working on + what's queued (shared with the agent's split view). */}
          <div className="h-72">
            {active && <AgentQueue type={active} />}
          </div>

          <div className="border-t border-zinc-800 bg-zinc-950/40 px-4 py-3">
            <button
              onClick={toggleRun}
              className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium text-white transition ${running ? "bg-rose-600 hover:bg-rose-500" : "bg-sky-600 hover:bg-sky-500"}`}
            >
              {running ? <><Square size={13} /> Stop the {personaFor(active ?? "")}</>
                : <><Play size={13} /> Run the {personaFor(active ?? "")}</>}
            </button>
            <Link href="/agents" onClick={onClose} className="mt-2 flex items-center justify-center gap-1 text-[12px] font-medium text-zinc-400 transition hover:text-sky-300">
              Watch live in Agents <ArrowRight size={12} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
