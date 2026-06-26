"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, X, ArrowRight, RotateCcw } from "lucide-react";
import { useCoWorkQueue, type QueueJob } from "@/components/CoWorkQueueProvider";
import { jobIcon, jobVerb, jobSubject, loadTone, loadHint, hasWip, wipBlink, KILL_CONFIRM } from "@/components/jobMeta";
import { CopyPrompt } from "@/components/CopyCoworkPrompt";
import { JobStatusChip, jobWorkStatus } from "@/components/JobStatus";
import { ago } from "@/lib/format";

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
  const { jobs, count, pulse, remove, requeue } = useCoWorkQueue();
  const [open, setOpen] = useState(false);
  // Any job an agent has claimed (wip) → CoWork is actively working; the Bot icon spins to show it.
  const working = jobs.some((j) => j.status === "wip");

  // Idle, the icon tucks off the right edge showing only a ~25% sliver; it slides fully into view on
  // hover, while the panel is open, or briefly when a job is queued (pulse). The wrapper reaches the
  // screen edge (right-0 + pr-6) so its hover area covers both the sliver and the revealed button —
  // otherwise the icon would flicker as it slid out from under the cursor.
  const revealed = open || pulse;

  return (
    <div className="group fixed bottom-6 right-0 z-50 flex flex-col items-end gap-3 pr-6">
      {open && <Panel onClose={() => setOpen(false)} jobs={jobs} count={count} remove={remove} requeue={requeue} />}

      <button
        onClick={() => setOpen((o) => !o)}
        title={working ? "CoWork queue — working…" : "CoWork queue"}
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

const PREVIEW = 5; // jobs shown for the active tab before "+N more →"

// One queue row. A `wip` job (an agent claimed it) reads "claimed · by …" with a force-requeue control
// (use only when its CoWork thread died — see KILL_CONFIRM). A `queued` job reads "queued · ago" with
// the remove (X) control.
function QueueRow({ j, remove, requeue }: { j: QueueJob; remove: (id: string) => Promise<void>; requeue: (id: string) => Promise<void> }) {
  const wip = j.status === "wip";
  const ws = jobWorkStatus(j);
  return (
    <div className="group flex items-center gap-2.5 px-4 py-2.5 hover:bg-zinc-800/40">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-zinc-200">
          {jobSubject(j) ?? "all postings"}
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <span className="truncate">
            {wip ? `claimed ${ago(j.claimedAt ?? j.createdAt)} by ${j.claimedBy ?? "CoWork"}` : `queued ${ago(j.createdAt)} by ${j.createdBy}`}
          </span>
          {ws && <JobStatusChip status={ws} />}
        </p>
      </div>
      {wip ? (
        <button onClick={() => { if (confirm(KILL_CONFIRM)) requeue(j.id); }} title="Thread died? Force this stuck job back to the queue" className="shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-300"><RotateCcw size={14} /></button>
      ) : (
        <button onClick={() => remove(j.id)} title="Remove from queue" className="shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-300"><X size={14} /></button>
      )}
    </div>
  );
}

function Panel({ jobs, count, remove, requeue, onClose }: { jobs: ReturnType<typeof useCoWorkQueue>["jobs"]; count: number; remove: (id: string) => Promise<void>; requeue: (id: string) => Promise<void>; onClose: () => void }) {
  const groups = groupByType(jobs);
  const [tab, setTab] = useState<string | null>(null);
  // Active tab, falling back to the first group (and recovering if the active type drains away).
  const active = tab && groups.some(([t]) => t === tab) ? tab : groups[0]?.[0] ?? null;
  const items = groups.find(([t]) => t === active)?.[1] ?? [];
  const preview = items.slice(0, PREVIEW);

  return (
    <div className="w-80 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-zinc-100">
          <Bot size={14} className="text-violet-300" /> CoWork queue
          <span className="rounded-full bg-zinc-800 px-1.5 text-[11px] font-bold tabular-nums text-zinc-400">{count}</span>
        </h3>
        <button onClick={onClose} title="Close" className="text-zinc-500 hover:text-zinc-300"><X size={15} /></button>
      </div>

      {groups.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-zinc-600">Queue is empty — hand off work from the funnel.</p>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-2 py-2">
            {groups.map(([type, list]) => {
              const Icon = jobIcon(type);
              return (
                <button
                  key={type}
                  onClick={() => setTab(type)}
                  title={hasWip(list) ? `${loadHint(list.length)} · working now` : loadHint(list.length)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${wipBlink(list)} ${active === type ? "bg-violet-500 text-violet-50" : "text-zinc-400 hover:bg-zinc-800"}`}
                >
                  <Icon size={12} /> {jobVerb(type)}
                  <span className={`rounded-full px-1 text-[11px] font-bold tabular-nums ${loadTone(list.length)}`}>{list.length}</span>
                </button>
              );
            })}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {preview.map((j) => (
              <QueueRow key={j.id} j={j} remove={remove} requeue={requeue} />
            ))}
          </div>

          {items.length > PREVIEW && (
            <Link href="/cowork" onClick={onClose} className="flex items-center justify-center gap-1.5 border-t border-zinc-800 py-2.5 text-[13px] font-medium text-violet-300 transition hover:bg-zinc-800/40">
              +{items.length - PREVIEW} more <ArrowRight size={13} />
            </Link>
          )}

          {/* The hand-off is split-brain: queued jobs only run when you tell the desktop agent to
              drain them. Explain it once, here at the bottom (always on-screen, above the floating
              button), with a one-click prompt to paste into CoWork. */}
          <div className="border-t border-zinc-800 bg-zinc-950/40 px-4 py-3">
            <p className="text-[12px] leading-snug text-zinc-400">
              To run the <span className="font-medium text-zinc-300">{jobVerb(active ?? "")}</span> queue, open Claude CoWork and paste the instruction below.
            </p>
            {active && <CopyPrompt type={active} className="mt-2 w-full" />}
          </div>
        </>
      )}
    </div>
  );
}
