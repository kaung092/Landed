import { desc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, threads, threadSteps } from "@/lib/db/schema";
import { listJobs } from "@/lib/jobs/store";
import type { JobView } from "@/lib/jobs/store";

// ── CoWork thread observability ──
// A "thread" is one CoWork chat. Claude Desktop runs a separate `jobhunt` MCP server process per
// chat; that process mints a threadId at boot and tags every call with it (x-jobhunt-thread). The
// app records the chat here (register/heartbeat) and a per-call trace (recordStep), so the CoWork
// page can show each chat, the jobs it's running, and a live step timeline — without ever touching
// Claude Desktop's internals. Correlation is server-side (we trust the header from the per-chat
// process), so a forgetful agent can't split a thread.

const now = () => new Date().toISOString();

// How long after its last MCP call a thread still counts as "live". The claim lease is 60 min and
// CoWork can sit between calls for a while, so we keep this generous — it's a display hint, not a
// lock. Past this, the chat is shown as idle (it may have been closed; we get no exit event).
const LIVE_WINDOW_MS = 8 * 60 * 1000;

// Drop trace rows older than this on write — the timeline is a recent-activity view, not an archive.
const STEP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// Register (or heartbeat) a thread. Called on the MCP server's `initialize` and bumped on every step.
// Idempotent: first contact sets startedAt; later calls only move lastSeenAt (+ fill a missing label/pid).
export function registerThread(input: { id: string; label?: string | null; pid?: number | null }): void {
  const ts = now();
  const id = input.id.trim();
  if (!id) return;
  const label = input.label?.trim() || null;
  db.insert(threads)
    .values({ id, label, pid: input.pid ?? null, startedAt: ts, lastSeenAt: ts, steps: 0 })
    .onConflictDoUpdate({
      target: threads.id,
      // Don't clobber an existing label/pid with nulls from a bare heartbeat.
      set: { lastSeenAt: ts, ...(label ? { label } : {}), ...(input.pid != null ? { pid: input.pid } : {}) },
    })
    .run();
}

// Record one MCP tool call against a thread + bump the thread heartbeat and step count.
export function recordStep(input: {
  threadId: string;
  tool: string;
  jobId?: string | null;
  ok?: boolean;
  durationMs?: number | null;
  summary?: string | null;
}): void {
  const ts = now();
  const id = input.threadId.trim();
  if (!id) return;
  // Ensure the parent row exists (a step can arrive before any explicit register).
  registerThread({ id });
  db.insert(threadSteps)
    .values({
      threadId: id,
      ts,
      tool: input.tool,
      jobId: input.jobId?.trim() || null,
      ok: input.ok ?? true,
      durationMs: input.durationMs ?? null,
      summary: input.summary?.slice(0, 280) ?? null,
    })
    .run();
  db.update(threads)
    .set({ lastSeenAt: ts, steps: (db.select().from(threads).where(eq(threads.id, id)).get()?.steps ?? 0) + 1 })
    .where(eq(threads.id, id))
    .run();
  // Cheap rolling prune so the trace table can't grow unbounded (indexed by ts).
  db.delete(threadSteps).where(lt(threadSteps.ts, new Date(Date.now() - STEP_RETENTION_MS).toISOString())).run();
}

export type ThreadJobView = {
  id: string;
  type: string;
  status: string;
  summary?: string | null;
  createdAt: string;
  claimedAt?: string | null;
};

export type ThreadStepView = {
  ts: string;
  tool: string;
  jobId?: string | null;
  ok: boolean;
  durationMs?: number | null;
  summary?: string | null;
};

export type ThreadView = {
  id: string;
  label: string | null;
  pid: number | null;
  startedAt: string;
  lastSeenAt: string;
  stepCount: number;
  live: boolean; // seen within LIVE_WINDOW_MS
  working: boolean; // has a job currently in flight (wip)
  jobs: ThreadJobView[]; // jobs this chat has claimed, newest first
  steps: ThreadStepView[]; // most recent trace rows, newest first
};

// All threads seen recently, newest activity first, each with the jobs it ran + a recent step trace.
// `stepLimit` caps the per-thread timeline; `sinceMs` filters out long-dead chats.
export function listThreads(opts?: { stepLimit?: number; sinceMs?: number }): ThreadView[] {
  const stepLimit = opts?.stepLimit ?? 40;
  const sinceMs = opts?.sinceMs ?? 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - sinceMs).toISOString();
  const rows = db
    .select()
    .from(threads)
    .where(gt(threads.lastSeenAt, cutoff))
    .all()
    // Hide dismissed chats — unless they've acted since being dismissed (then they're back).
    .filter((t) => !t.dismissedAt || t.lastSeenAt > t.dismissedAt);
  const liveCutoff = Date.now() - LIVE_WINDOW_MS;

  return rows
    .map((t): ThreadView => {
      const jobRows = db.select().from(jobs).where(eq(jobs.threadId, t.id)).all();
      const jobViews = jobRows
        .map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          summary: j.summary,
          createdAt: j.createdAt,
          claimedAt: j.claimedAt,
        }))
        .sort((a, b) => (b.claimedAt ?? b.createdAt).localeCompare(a.claimedAt ?? a.createdAt));
      const stepRows = db
        .select()
        .from(threadSteps)
        .where(eq(threadSteps.threadId, t.id))
        .orderBy(desc(threadSteps.ts), desc(threadSteps.id))
        .limit(stepLimit)
        .all();
      return {
        id: t.id,
        label: t.label,
        pid: t.pid,
        startedAt: t.startedAt,
        lastSeenAt: t.lastSeenAt,
        stepCount: t.steps,
        live: Date.parse(t.lastSeenAt) >= liveCutoff,
        working: jobRows.some((j) => j.status === "wip"),
        jobs: jobViews,
        steps: stepRows.map((s) => ({
          ts: s.ts,
          tool: s.tool,
          jobId: s.jobId,
          ok: s.ok,
          durationMs: s.durationMs,
          summary: s.summary,
        })),
      };
    })
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

// A human label for one queued job — "Company — Role", else its task, else its id.
export type BacklogItem = { id: string; label: string };
function jobLabel(j: JobView): string {
  const ps = (j.params?.postings as Array<{ company?: string; role?: string }> | undefined) ?? [];
  const first = ps[0];
  if (first && (first.company || first.role)) {
    const base = [first.company, first.role].filter(Boolean).join(" — ");
    return ps.length > 1 ? `${base} +${ps.length - 1} more` : base;
  }
  return j.task?.trim() || j.id;
}

// The unclaimed backlog grouped by job type — each agent's "inbox". Work handed off but not yet
// picked up by any chat (no thread_id until claimed), so the agents view folds it in by type→persona.
// Uses listJobs so a stale-lease wip counts as queued again (matches the app).
export function backlogByType(): Record<string, BacklogItem[]> {
  const out: Record<string, BacklogItem[]> = {};
  for (const j of listJobs()) {
    if (j.status !== "queued") continue;
    (out[j.type] ??= []).push({ id: j.id, label: jobLabel(j) });
  }
  return out;
}

// Soft-dismiss a thread from the app view. It stays in the DB (and reappears the instant it acts
// again, since recordStep bumps lastSeenAt past dismissedAt) — so you can't permanently lose a live
// chat by clearing it.
export function dismissThread(id: string): void {
  if (!id) return;
  db.update(threads).set({ dismissedAt: now() }).where(eq(threads.id, id)).run();
}

// Stamp a job with the chat that claimed it (called from the claim path with the request's thread
// header). Best-effort: a missing/blank threadId is a no-op, so non-CoWork claims are unaffected.
export function stampJobThread(jobId: string, threadId?: string | null): void {
  const tid = threadId?.trim();
  if (!tid || !jobId) return;
  db.update(jobs).set({ threadId: tid }).where(eq(jobs.id, jobId)).run();
}
