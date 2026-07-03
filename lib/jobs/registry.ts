import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, postings } from "@/lib/db/schema";
import type { CompanyRow, PostingRow } from "@/lib/db/schema";
import { logEvent, enqueueUnboundResult } from "@/lib/db/queries";
import { reconcile } from "@/lib/agents/reconcile";
import { incomingFromInboxRecords } from "@/lib/agents/sources/inbox";
import { canonical, norm } from "@/lib/agents/canonical";
import { ingestPrepRecords, ingestPrepResearch } from "@/lib/db/prep";
import { str, num } from "@/lib/coerce";
import { parseRedoLog, nextVersion } from "./redolog";
import { ingestFitLabResult } from "@/lib/fitlab/ingest";
import { coerceDiff } from "@/lib/linediff";
import type { FitAssessment, RedoTurn } from "@/lib/types";
import type { ChangeDetail, ReconcileResult } from "@/lib/agents/types";
import type { JobDef, JobType, ResultRecord } from "./types";

// Fit + tailoring update the matching POSTING (discovery side of the unified model). Match by id
// (echoed back), else company + url/role, preferring the fit-phase rows; apply the patch.
function ingestCandidateUpdates(
  records: ResultRecord[],
  dryRun: boolean | undefined,
  source: string,
  label: string,
  build: (r: ResultRecord, cand: PostingRow, co: CompanyRow) => { next: Record<string, unknown>; summary: string } | null,
): ReconcileResult {
  const coByKey = new Map<string, CompanyRow>();
  const coById = new Map<number, CompanyRow>();
  for (const co of db.select().from(companies).all()) {
    coById.set(co.id, co);
    const key = canonical(co.name)?.key;
    if (key) coByKey.set(key, co);
  }
  const byCo = new Map<number, PostingRow[]>();
  const byId = new Map<number, PostingRow>();
  for (const c of db.select().from(postings).all()) {
    byId.set(c.id, c);
    (byCo.get(c.companyId) ?? byCo.set(c.companyId, []).get(c.companyId)!).push(c);
  }
  // ID-ONLY. The posting `id` is the stable round-trip key the app stamped on the job and CoWork
  // echoes back — title/url guessing here risks binding the result onto the wrong posting, so it
  // was removed. An id that doesn't resolve raises a human-action item instead of silently skipping.
  const match = (r: ResultRecord): { co: CompanyRow; cand: PostingRow } | null => {
    const id = num(r.id);
    if (id == null) return null;
    const cand = byId.get(id);
    const co = cand ? coById.get(cand.companyId) : undefined;
    return cand && co ? { co, cand } : null;
  };

  // The id didn't resolve — park an "unbound result" alert (dismiss-only) so it's visible in the
  // Changes inbox rather than dropped. Best-effort company resolution (needed for the FK); same-title
  // postings under that company become hints. Idempotent via enqueueUnboundResult's signature.
  const raiseUnbound = (r: ResultRecord) => {
    const key = canonical(str(r.company) ?? "")?.key;
    const co = key ? coByKey.get(key) : undefined;
    if (!co) { logEvent({ actor: "CoWork", source, action: "flag", summary: `${source} result for id ${num(r.id) ?? "?"} — no matching posting or company (skipped)` }); return; }
    const rn = norm(str(r.role) ?? "");
    const hintIds = rn ? (byCo.get(co.id) ?? []).filter((x) => norm(x.title) === rn).map((x) => x.id) : [];
    enqueueUnboundResult({
      source, companyId: co.id, companyName: co.name, jobType: source,
      declaredId: num(r.id) ?? undefined, role: str(r.role) ?? null, record: r, candidateIds: hintIds,
    });
  };

  const details: ChangeDetail[] = [];
  let updated = 0;
  let unbound = 0;
  for (const r of records) {
    const m = match(r);
    if (!m) {
      if (!dryRun) raiseUnbound(r);
      details.push({ action: "flag", summary: `${source} result · id ${num(r.id) ?? "?"} not found → needs your review` });
      unbound++;
      continue;
    }
    const built = build(r, m.cand, m.co);
    if (!built) continue;
    details.push({ action: "update", summary: built.summary });
    if (!dryRun) {
      db.update(postings).set(built.next).where(eq(postings.id, m.cand.id)).run();
      logEvent({ actor: "CoWork", source, entity: "company", entityId: m.co.id, action: "update", summary: built.summary });
    }
    updated++;
  }
  const summary = unbound ? `${updated} ${label} · ${unbound} unbound (needs review)` : `${updated} ${label}`;
  return { inserted: 0, updated, fieldChanges: updated, flagged: 0, pending: unbound, newCompanies: 0, summary, details };
}

// tailoring record { company, role, slug, note }: CoWork tailored a resume into resume/<slug>/.
// The slug is the versioned folder the app told it to write (resume/<base>/v<N>/); `note` is the
// "what changed & why" that becomes this version's agent turn in the redo conversation.
function ingestTailoring(records: ResultRecord[], dryRun?: boolean): ReconcileResult {
  return ingestCandidateUpdates(records, dryRun, "tailoring", "tailored", (r, cand, co) => {
    const slug = str(r.slug);
    if (!slug) return null;
    // Append this attempt as a versioned agent turn; resume_dir/state project the latest version.
    const log = parseRedoLog(cand.redoLog);
    const version = nextVersion(log, "tailor");
    const note = str(r.note) ?? "Tailored the base resume to the posting.";
    // CoWork's annotated tailored-vs-base diff (each changed line + why). Optional — when absent the
    // diff view falls back to the computed textutil diff.
    const diff = coerceDiff(r.diff);
    const turn: RedoTurn = { phase: "tailor", role: "agent", at: new Date().toISOString(), text: note, version, slug, ...(diff ? { diff } : {}) };
    return {
      next: { resumeDir: slug, state: "tailored", redoLog: JSON.stringify([...log, turn]) },
      summary: `${co.name} — ${cand.title} · tailored v${version} → ${slug}`,
    };
  });
}

// Normalize a fit result record into the stored FitAssessment. levelMatch may arrive as an
// object {call, why} or a bare string; summary may be `summary` or `fitSummary`.
function buildFitDetail(r: ResultRecord): FitAssessment {
  const lm = r.levelMatch;
  return {
    levelMatch: typeof lm === "string" ? { call: lm } : (lm as FitAssessment["levelMatch"]),
    recommendation: str(r.recommendation),
    summary: str(r.summary) ?? str(r.fitSummary),
    strengths: Array.isArray(r.strengths) ? r.strengths : undefined,
    gaps: Array.isArray(r.gaps) ? (r.gaps as FitAssessment["gaps"]) : undefined,
  };
}

// fit record (rich): { company, role, fitScore, levelMatch{call,why}, recommendation,
// summary, strengths[], gaps[{text,severity,detail}] }. Store fitScore for quick sort/badge
// and the full assessment as a JSON blob (fit_detail); advance discovered → assessed.
function ingestFit(records: ResultRecord[], dryRun?: boolean): ReconcileResult {
  return ingestCandidateUpdates(records, dryRun, "fit", "scored", (r, cand, co) => {
    const score = num(r.fitScore);
    const detail = buildFitDetail(r);
    // Append this assessment as a versioned agent turn; fit_score/fit_detail project the latest.
    const log = parseRedoLog(cand.redoLog);
    const version = nextVersion(log, "fit");
    const turn: RedoTurn = {
      phase: "fit", role: "agent", at: new Date().toISOString(),
      text: detail.summary ?? `Fit ${score ?? "?"} (${detail.levelMatch?.call ?? "?"})`,
      version, fitScore: score ?? undefined, fit: detail,
    };
    const next: Record<string, unknown> = { fitScore: score, fitDetail: JSON.stringify(detail), redoLog: JSON.stringify([...log, turn]) };
    const jd = str(r.jd);
    if (jd) next.jd = jd; // persist the JD CoWork used so tailoring reuses it (no re-fetch)
    if (cand.state === "fit_queue") next.state = "assessed";
    return { next, summary: `${co.name} — ${cand.title} · fit v${version} ${score ?? "?"} (${detail.levelMatch?.call ?? "?"})` };
  });
}

// prep record: { leetcodeNum?|name, status, durationSec?, notes?, noted?, redo?, ... }.
// CoWork logged a coding practice attempt; ingestPrepRecords resolves it to a catalog
// question (or inserts a new one) and appends the attempt. Doesn't touch applications.
function ingestPrep(records: ResultRecord[], dryRun?: boolean): ReconcileResult {
  const r = ingestPrepRecords(records, dryRun);
  const parts: string[] = [];
  if (r.attempts) parts.push(`${r.attempts} attempt${r.attempts === 1 ? "" : "s"}`);
  if (r.inserted) parts.push(`${r.inserted} new question${r.inserted === 1 ? "" : "s"}`);
  if (r.flagged) parts.push(`${r.flagged} flagged`);
  return {
    inserted: r.inserted,
    updated: r.attempts,
    fieldChanges: r.attempts + r.flagged,
    flagged: r.flagged,
    pending: 0,
    newCompanies: 0,
    summary: parts.join(", ") || "no prep changes",
    details: r.details,
  };
}

// prep-research record batch: one { type:"profile", company, process, rounds[], categories[],
// sources[] } + N { type:"question", company, category, track?, name, leetcodeNum?|prompt, ... }.
// CoWork researched a company's interview process; ingestPrepResearch upserts the profile and
// tags/creates questions (reusing the shared bank by leetcodeNum so progress carries over).
function ingestPrepResearchJob(records: ResultRecord[], dryRun?: boolean): ReconcileResult {
  const r = ingestPrepResearch(records, dryRun);
  const parts: string[] = [];
  if (r.profile) parts.push("profile");
  if (r.reused) parts.push(`${r.reused} reused`);
  if (r.inserted) parts.push(`${r.inserted} new question${r.inserted === 1 ? "" : "s"}`);
  return {
    inserted: r.inserted,
    updated: r.reused + r.profile,
    fieldChanges: r.reused + r.inserted + r.profile,
    flagged: 0,
    pending: 0,
    newCompanies: 0,
    summary: parts.join(", ") || "no prep-research changes",
    details: r.details,
  };
}

// Ingest for the watchlist-scan source (legacy submitJobResult path; the live flow is
// submitGlance). Land each surfaced posting as a fit_queue CANDIDATE — it enters discovery,
// never an application. New companies are created on the fly.
function ingestDiscovered(source: string) {
  return (records: ResultRecord[], dryRun?: boolean): ReconcileResult => {
    const details: ChangeDetail[] = [];
    let inserted = 0, updated = 0;
    for (const r of records) {
      const company = str(r.company) ?? "";
      const key = canonical(company)?.key;
      if (!key) continue;
      const role = str(r.role) ?? "(untitled)";
      const url = str(r.url);
      let co = db.select().from(companies).all().find((c) => canonical(c.name)?.key === key);
      if (!co) {
        if (dryRun) { details.push({ action: "insert", summary: `${company} — ${role} · would add (new company) → fit queue` }); inserted++; continue; }
        const ts = new Date().toISOString();
        co = db.insert(companies).values({ name: company, tier: "tier3", createdAt: ts, updatedAt: ts }).returning().get();
      }
      const list = db.select().from(postings).where(eq(postings.companyId, co.id)).all();
      const existing = (url ? list.find((c) => c.url === url) : undefined) ?? list.find((c) => c.title.toLowerCase() === role.toLowerCase());
      if (existing) {
        if (!dryRun) db.update(postings).set({ state: "fit_queue" }).where(eq(postings.id, existing.id)).run();
        details.push({ action: "update", summary: `${co.name} — ${role} · → fit queue` }); updated++;
      } else {
        if (!dryRun) db.insert(postings).values({ companyId: co.id, title: role, location: str(r.location) ?? null, url: url ?? null, department: null, verdict: "kept", reason: null, state: "fit_queue", scannedAt: new Date().toISOString() }).run();
        details.push({ action: "insert", summary: `${co.name} — ${role} · added to fit queue` }); inserted++;
      }
      if (!dryRun) logEvent({ actor: "CoWork", source, entity: "company", entityId: co.id, action: existing ? "update" : "insert", summary: `${co.name} — ${role} · watchlist-scan → fit queue` });
    }
    return { inserted, updated, fieldChanges: updated, flagged: 0, pending: 0, newCompanies: 0, summary: `${inserted} added, ${updated} requeued`, details };
  };
}

// watchlist-add has no submitJobResult ingest — CoWork writes directly via upsertCompanies +
// addToWatchlist. The def exists so it shows as a job (with its playbook); ingest is a no-op.
const noopIngest = (): ReconcileResult => ({ inserted: 0, updated: 0, fieldChanges: 0, flagged: 0, pending: 0, newCompanies: 0, summary: "", details: [] });

// Ordered by pipeline stage (ascending): create → scan → fit → tailor → inbox sync.
// prep / prep-research keep their machinery but are hidden from the CoWork Jobs list for now.
export const JOB_DEFS: Record<JobType, JobDef> = {
  "watchlist-add": {
    type: "watchlist-add",
    title: "Create Watchlist Entry",
    description: "Research a company (fetch method, target titles) → configure it and add to the watchlist. Leveling is fetched lazily later.",
    playbook: "watchlist-add.md",
    buildTask: (p) =>
      `Research and configure ${p?.company ?? "a company"} — fetch method + target titles — then add it to the watchlist per watchlist-add.md. (Leveling is a separate, lazy job — don't collect it here.)`,
    ingest: noopIngest,
  },
  leveling: {
    type: "leveling",
    title: "Fetch Leveling",
    description: "Pull a company's levels.fyi IC SWE ladder (vs the reference) and store it — queued lazily from the fit view.",
    playbook: "leveling.md",
    buildTask: (p) =>
      `Collect ${p?.company ?? "a company"}'s levels.fyi IC SWE ladder via the Chrome geometry method and store it with upsertCompanies, per leveling.md.`,
    ingest: noopIngest,
  },
  "watchlist-scan": {
    type: "watchlist-scan",
    title: "Scan Watchlist",
    description: "Targeted — check watchlisted companies' boards for new postings → fill 'discovered'.",
    playbook: "watchlist-scan.md",
    buildTask: () =>
      `Watchlist scan: call scanWatchlist, glance every candidate by title + location only (no JD) against my profile, and submit a high/low/drop verdict per posting via submitGlance — high auto-queues a fit job. Follow watchlist-scan.md.`,
    ingest: ingestDiscovered("watchlist-scan"),
  },
  fit: {
    type: "fit",
    title: "Assess Job Fit",
    description: "Score fit + draft a tailoring brief for discovered postings.",
    playbook: "fit.md",
    buildTask: () => `Assess fit for the postings in this job using my base resume; write the result per fit.md.`,
    ingest: ingestFit,
  },
  "fitlab-assess": {
    type: "fitlab-assess",
    title: "Fit Lab assessment",
    description: "Score one posting against the Fit Lab rubric — per-criterion verdicts (Extract + Detect). App-queued from the Fit Lab.",
    playbook: "fitlab-assess.md",
    // The real instruction (rubric + profile + JD embedded) is passed explicitly by queueRun; this
    // fallback only fires if a job is created without one.
    buildTask: (p) => `Fit Lab assessment for run ${p?.runId ?? "?"} — follow the embedded task: extract each criterion's JD requirement, judge it against the profile, and submit one verdict record per criterion per fitlab-assess.md.`,
    ingest: ingestFitLabResult,
  },
  tailoring: {
    type: "tailoring",
    title: "Tailor Resume For a Job",
    description: "Tailor a resume per posting (postings in the 'tailoring' stage) and save it.",
    playbook: "tailoring.md",
    buildTask: () =>
      `Tailor resumes for postings in the 'tailoring' stage (see the listApplications MCP tool). For each, read its JD, tailor the base resume, save to resume/<slug>/, and report the result via submitJobResult per tailoring.md.`,
    ingest: ingestTailoring,
  },
  "inbox-sync": {
    type: "inbox-sync",
    title: "Sync Inbox",
    description: "Read job email → update application statuses, interviews, and dates.",
    playbook: "inbox-sync.md",
    buildTask: (p) =>
      `Audit my Gmail for job-application emails since ${p?.since ?? "the last sync"} and write the result per inbox-sync.md.`,
    ingest: (records, dryRun) => reconcile(incomingFromInboxRecords(records), { actor: "CoWork", source: "inbox-sync", dryRun }),
  },
  prep: {
    type: "prep",
    title: "Coding prep",
    description: "Log coding-practice progress (attempts, times, notes) from a CoWork session.",
    playbook: "prep.md",
    hidden: true,
    buildTask: () =>
      `Report the coding-practice progress from our session — one record per question worked — per prep.md.`,
    ingest: ingestPrep,
  },
  "prep-research": {
    type: "prep-research",
    title: "Prep research",
    description: "Research a company's interview process → build a company prep profile + question set.",
    playbook: "prep-research.md",
    buildTask: (p) =>
      `Research the interview process at ${p?.company ?? "the company"} (rounds, categories, past questions) and submit a prep profile + categorized questions via submitJobResult per prep-research.md.${
        p?.intel ? " params.intel holds recruiter-confirmed comp/team/rounds — treat it as authoritative ground truth and only research to fill gaps." : ""
      }`,
    ingest: ingestPrepResearchJob,
  },
};

export const jobDef = (type: string): JobDef | null => (JOB_DEFS as Record<string, JobDef>)[type] ?? null;
