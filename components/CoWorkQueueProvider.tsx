"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// A live CoWork job, as the floating queue + CoWork page see it — `queued` (up for grabs) or `wip`
// (an agent claimed it; has claimedAt). Ingested/history rows are excluded.
export type QueueJob = {
  id: string;
  type: string;
  createdBy: string;
  createdAt: string;
  status: string; // queued | wip
  claimedAt?: string | null;
  claimedBy?: string | null;
  task?: string | null;
  params?: Record<string, unknown>;
};

export type AddJobSpec = { type: string; params?: Record<string, unknown>; task?: string };

type QueueCtx = {
  jobs: QueueJob[]; // outstanding (queued + wip), newest first
  count: number;
  pulse: boolean; // transient — drives the "job added" animation on the floating icon
  add: (spec: AddJobSpec) => Promise<void>;
  remove: (id: string) => Promise<void>;
  requeue: (id: string) => Promise<void>; // return a stuck/failed wip job to the queue (manual recovery)
  refresh: () => void; // re-read the queue (after an external add, or to catch CoWork draining it)
  bump: () => void; // pulse + refresh — for adds made through other endpoints (e.g. discovery actions)
  // The queued redo note for a posting's phase, or null if no redo is queued. Live (the queue polls
  // + refreshes on delete), so the "Queued for redo" tag + the composer pre-fill clear the moment
  // the job is drained or removed. The note rides on the job params (see enqueueTailoring).
  redoNoteFor: (postingId: string, phase: "fit" | "tailor") => string | null;
  // Whether a posting's fit/tailor job is currently being worked (an agent claimed it → wip). Drives
  // the table's spinning "In progress" status. Live off the same polled queue.
  isWorking: (postingId: string, phase: "fit" | "tailor") => boolean;
};

const Ctx = createContext<QueueCtx | null>(null);

// Owns the live CoWork queue for the whole app: one fetch, shared by the floating icon and the
// CoWork page. Adds optimistically + pulses; polls so the badge shrinks as CoWork drains the queue.
export default function CoWorkQueueProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((d) => setJobs((d.jobs ?? []).filter((j: QueueJob) => j.status === "queued" || j.status === "wip")))
      .catch(() => {});
  }, []);

  // Initial load + a light poll, and a refresh whenever the tab regains focus (CoWork may have
  // drained the queue while you were away).
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 25_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  const firePulse = useCallback(() => {
    setPulse(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(false), 700);
  }, []);

  const add = useCallback(async (spec: AddJobSpec) => {
    firePulse();
    try {
      await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(spec) });
    } finally {
      refresh();
    }
  }, [firePulse, refresh]);

  const remove = useCallback(async (id: string) => {
    setJobs((js) => js.filter((j) => j.id !== id)); // optimistic
    try {
      await fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    } finally {
      refresh();
    }
  }, [refresh]);

  // Manual recovery: an agent claimed a job (wip) but never finished. Return it to `queued` so
  // another agent can pick it up. Optimistic flip; the poll/refresh reconciles.
  const requeue = useCallback(async (id: string) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, status: "queued", claimedAt: null, claimedBy: null } : j)));
    try {
      await fetch(`/api/jobs/${encodeURIComponent(id)}/requeue`, { method: "POST" });
    } finally {
      refresh();
    }
  }, [refresh]);

  const bump = useCallback(() => { firePulse(); refresh(); }, [firePulse, refresh]);

  const redoNoteFor = useCallback((postingId: string, phase: "fit" | "tailor"): string | null => {
    const id = phase === "tailor" ? `tailoring-app-${postingId}` : `fit-redo-${postingId}`;
    const note = jobs.find((j) => j.id === id)?.params?.redoNote;
    return typeof note === "string" ? note : null;
  }, [jobs]);

  // Find the live job for a posting's phase (tailor: stable id; fit: the redo id, else a fit job
  // whose params carry this posting) and report whether it's claimed (wip = being worked now).
  const isWorking = useCallback((postingId: string, phase: "fit" | "tailor"): boolean => {
    const job = phase === "tailor"
      ? jobs.find((j) => j.id === `tailoring-app-${postingId}`)
      : jobs.find((j) => j.id === `fit-redo-${postingId}`)
        ?? jobs.find((j) => j.type === "fit" && (j.params?.postings as { id?: unknown }[] | undefined)?.some((p) => String(p?.id) === postingId));
    return job?.status === "wip";
  }, [jobs]);

  return (
    <Ctx.Provider value={{ jobs, count: jobs.length, pulse, add, remove, requeue, refresh, bump, redoNoteFor, isWorking }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCoWorkQueue(): QueueCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCoWorkQueue must be used within CoWorkQueueProvider");
  return c;
}
