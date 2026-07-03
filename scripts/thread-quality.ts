// Quality-by-thread-position readout. Answers: does CoWork get sloppier the deeper a chat goes?
//
//   npx tsx scripts/thread-quality.ts
//
// Mechanism: each CoWork chat (thread) processes its jobs in claim order — position 1, 2, 3… The
// hypothesis behind a per-chat job cap is that accuracy decays with depth (context rot +
// cross-contamination). This script measures that decay from the data the thread telemetry now
// collects, so you set any cap from evidence instead of a hunch.
//
// Quality signal per job (fit/tailoring only — those carry a redo conversation):
//   • redo requested  — the posting's redo_log has a `user` turn for this phase = first output
//                       wasn't good enough (the cleanest accuracy proxy we have).
//   • needs review    — the posting is flagged needs_review.
//   A job is "flagged" if either is true for any of its postings.
// Plus, for ALL job types: tool-error rate (failed MCP calls) and work duration by position.
//
// NOTE: only jobs claimed AFTER the thread-id rollout carry a chat attribution — older jobs have no
// thread_id and are invisible here. So this fills in as CoWork runs on the new build.

import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { jobs, threads, threadSteps, postings } from "../lib/db/schema";
import { parseRedoLog, phaseTurns } from "../lib/jobs/redolog";
import type { RedoPhase } from "../lib/types";

type JobStat = {
  threadId: string;
  jobId: string;
  type: string;
  position: number; // 1-based order within its chat
  measurable: boolean; // fit/tailoring with at least one posting → has a redo signal
  flagged: boolean; // redo requested or needs-review on any of its postings
  toolErrors: number; // failed MCP calls attributed to this job
  workMs: number | null; // claimed → ingested
};

const phaseFor = (type: string): RedoPhase | null =>
  type === "fit" ? "fit" : type === "tailoring" ? "tailor" : null;

function parsePostingIds(paramsRaw: string | null): number[] {
  if (!paramsRaw) return [];
  try {
    const p = JSON.parse(paramsRaw) as { postings?: { id?: number }[] };
    return (p.postings ?? []).map((x) => x?.id).filter((x): x is number => typeof x === "number");
  } catch {
    return [];
  }
}

function collect(): JobStat[] {
  const threadRows = db.select().from(threads).all();
  const stats: JobStat[] = [];

  for (const t of threadRows) {
    const tJobs = db
      .select()
      .from(jobs)
      .where(eq(jobs.threadId, t.id))
      .all()
      .sort((a, b) => (a.claimedAt ?? a.createdAt).localeCompare(b.claimedAt ?? b.createdAt));

    tJobs.forEach((j, i) => {
      const phase = phaseFor(j.type);
      const postingIds = parsePostingIds(j.params);
      let flagged = false;
      let measurable = false;
      if (phase && postingIds.length) {
        measurable = true;
        for (const pid of postingIds) {
          const post = db.select().from(postings).where(eq(postings.id, pid)).get();
          if (!post) continue;
          if (post.needsReview) flagged = true;
          const redo = phaseTurns(parseRedoLog(post.redoLog), phase).some((turn) => turn.role === "user");
          if (redo) flagged = true;
        }
      }
      const toolErrors = db
        .select()
        .from(threadSteps)
        .where(eq(threadSteps.jobId, j.id))
        .all()
        .filter((s) => !s.ok).length;
      const workMs = j.claimedAt && j.ingestedAt ? Date.parse(j.ingestedAt) - Date.parse(j.claimedAt) : null;

      stats.push({
        threadId: t.id,
        jobId: j.id,
        type: j.type,
        position: i + 1,
        measurable,
        flagged,
        toolErrors,
        workMs: workMs != null && Number.isFinite(workMs) && workMs >= 0 ? workMs : null,
      });
    });
  }
  return stats;
}

const pct = (n: number, d: number) => (d === 0 ? "  —  " : `${((100 * n) / d).toFixed(0).padStart(3)}%`);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const secs = (ms: number) => `${(ms / 1000).toFixed(0)}s`;

function rowFor(label: string, group: JobStat[]) {
  const measurable = group.filter((g) => g.measurable);
  const flagged = measurable.filter((g) => g.flagged).length;
  const errs = avg(group.map((g) => g.toolErrors));
  const durs = group.map((g) => g.workMs).filter((x): x is number => x != null);
  return (
    `${label.padEnd(8)}` +
    `${String(group.length).padStart(5)}` +
    `${String(measurable.length).padStart(7)}` +
    `   ${pct(flagged, measurable.length)}` +
    `   ${errs.toFixed(2).padStart(5)}` +
    `   ${(durs.length ? secs(avg(durs)) : "—").padStart(6)}`
  );
}

function main() {
  const stats = collect();

  if (stats.length === 0) {
    console.log("\nNo thread-stamped jobs yet.\n");
    console.log("Thread attribution starts the moment CoWork runs on the new MCP build — older jobs");
    console.log("have no thread_id, so there's nothing to position yet. Re-run this after a few CoWork");
    console.log("runs and the gradient will fill in.\n");
    const tc = db.select().from(threads).all().length;
    console.log(`(threads seen so far: ${tc})\n`);
    return;
  }

  const depths = new Map<string, number>();
  for (const s of stats) depths.set(s.threadId, Math.max(depths.get(s.threadId) ?? 0, s.position));
  const measurable = stats.filter((s) => s.measurable);

  console.log("\n══ CoWork quality by thread position ══\n");
  console.log(`threads: ${depths.size}   stamped jobs: ${stats.length}   measurable (fit/tailoring): ${measurable.length}`);
  console.log(`chat depth: avg ${avg([...depths.values()]).toFixed(1)} jobs/chat, max ${Math.max(...depths.values())}\n`);

  // Per exact position (1..8), then 9+ bucket.
  console.log("position  jobs  measur   flagged   err/j     work");
  console.log("────────  ────  ──────   ───────   ─────   ──────");
  const maxPos = Math.max(...stats.map((s) => s.position));
  for (let p = 1; p <= Math.min(maxPos, 8); p++) {
    const g = stats.filter((s) => s.position === p);
    if (g.length) console.log(rowFor(`#${p}`, g));
  }
  if (maxPos > 8) {
    const g = stats.filter((s) => s.position > 8);
    if (g.length) console.log(rowFor("#9+", g));
  }

  // The gradient: early vs mid vs late.
  console.log("\n── gradient (the headline) ──");
  console.log("bucket    jobs  measur   flagged   err/j     work");
  console.log("────────  ────  ──────   ───────   ─────   ──────");
  const buckets: [string, (p: number) => boolean][] = [
    ["1–3", (p) => p <= 3],
    ["4–6", (p) => p >= 4 && p <= 6],
    ["7+", (p) => p >= 7],
  ];
  for (const [label, test] of buckets) {
    const g = stats.filter((s) => test(s.position));
    if (g.length) console.log(rowFor(label, g));
  }

  const early = measurable.filter((s) => s.position <= 3);
  const late = measurable.filter((s) => s.position >= 7);
  const earlyRate = early.length ? early.filter((s) => s.flagged).length / early.length : null;
  const lateRate = late.length ? late.filter((s) => s.flagged).length / late.length : null;
  console.log("");
  if (earlyRate != null && lateRate != null && late.length >= 3) {
    const ratio = earlyRate > 0 ? (lateRate / earlyRate).toFixed(1) : "∞";
    console.log(
      lateRate > earlyRate
        ? `▶ Late jobs flag ${ratio}× as often as early ones (${(lateRate * 100).toFixed(0)}% vs ${(earlyRate * 100).toFixed(0)}%) — a real gradient. A per-chat cap around where it climbs would help.`
        : `▶ No degradation with depth (late ${(lateRate * 100).toFixed(0)}% ≤ early ${(earlyRate * 100).toFixed(0)}%). A cap would add chat-spawning overhead without an accuracy win.`,
    );
  } else {
    console.log("▶ Not enough deep jobs yet to call a gradient — need more chats that run 7+ jobs. Re-run later.");
  }

  console.log("\nCaveats: 'measurable' = fit/tailoring only (others have no redo signal). A redo can reflect");
  console.log("taste, not just accuracy. Small samples per position are noisy — watch the trend, not one row.\n");
}

main();
