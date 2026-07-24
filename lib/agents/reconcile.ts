import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, postings, pendingMatches } from "@/lib/db/schema";
import type { PostingRow, CompanyRow } from "@/lib/db/schema";
import { logEvent, createPendingMatch, upsertInterviews } from "@/lib/db/queries";
import { TRACKER_STAGES } from "@/lib/pipeline";
import { maybeQueuePrepResearch } from "@/lib/jobs/store";
import { canonical, defaultTier } from "./canonical";
import { matchPosting } from "./match";
import type { IncomingApp, ReconcileResult } from "./types";

const today = () => new Date().toISOString().slice(0, 10);
const blank = (v: unknown) => v === null || v === undefined || v === "";

// Incoming descriptive fields to take-latest. `role` maps to the posting's `title` column.
const TAKE_LATEST: (keyof IncomingApp)[] = ["role", "level", "team", "location", "channel", "source", "url", "note"];
const colOf = (f: keyof IncomingApp): keyof PostingRow => (f === "role" ? "title" : (f as keyof PostingRow));

// Map an incoming status onto a posting stage (the early board status `discovered` is the funnel's
// fit_queue; everything else is already a valid stage).
const toStage = (s?: string | null) => (s === "discovered" ? "fit_queue" : s) as PostingRow["state"];

// Exact-match pool: every stage a confident URL/exact-title match may land on — tracker stages
// (status progression: applied→interview, idempotent re-sync) PLUS all pre-apply candidates. In the
// unified model a candidate and its applied row are the SAME row, so an "applied" email for a posting
// you were tailoring graduates THAT row, not a duplicate. Excludes only dropped rows (dismissed/filtered).
const MATCH_STAGES: PostingRow["state"][] = [
  ...TRACKER_STAGES, "review", "matched", "fit_queue", "assessed", "tailoring", "tailored", "apply_later",
];
// Fuzzy/approval pool: only the PRE-APPLY candidate stages. A non-exact (fuzzy) match is offered for
// human approval, and we only ever ask about a posting you're still pursuing — never re-point an
// email at an already-applied, interviewing, or closed row (that'd be a separate application).
const FUZZY_STAGES = new Set<string>(["review", "matched", "fit_queue", "assessed", "tailoring", "tailored", "apply_later"]);

// Status progression rank. Sync may ADVANCE status but never walk it backward —
// e.g. an old interview-scheduling email must not un-reject a closed application.
const STATUS_RANK: Record<string, number> = {
  discovered: 0, fit_queue: 0, assessed: 1, tailoring: 1, tailored: 1, company_skipped: 0,
  applied: 2, ghost: 2, interview: 3, rejected: 4, expired: 4,
};
const rank = (s?: string | null) => STATUS_RANK[s ?? ""] ?? 0;

// Matching now lives in ./match (matchPosting / exactMatch / fuzzy tier) — one shared decision for
// every ingest path. reconcile() calls it below with MATCH_STAGES (exact) + FUZZY_STAGES (ask).

// Apply an incoming record onto a matched posting: take-latest descriptive fields, advance
// (never regress) status, monotonic interviewed, fill blank appliedDate. Mutates `match` in place.
function applyIncoming(
  match: PostingRow,
  rec: IncomingApp,
  opts: { actor: string; source: string; companyName: string }
): { diffs: string[]; summary: string } {
  const changes: Record<string, unknown> = {};
  const fieldDiffs: { field: string; old?: string; new?: string }[] = [];
  const str = (v: unknown) => (blank(v) ? undefined : String(v));
  const note = (field: string, oldV: unknown, newV: unknown) => fieldDiffs.push({ field, old: str(oldV), new: str(newV) });

  for (const f of TAKE_LATEST) {
    const col = colOf(f);
    const v = rec[f];
    if (blank(v) || v === match[col]) continue;
    changes[col] = v;
    note(f, match[col], v);
  }
  const incomingStage = toStage(rec.status);
  if (rec.status && incomingStage !== match.state && rank(incomingStage) > rank(match.state)) {
    changes.state = incomingStage;
    note("status", match.state, incomingStage);
  }
  // Interview rounds imply interviewed; they also keep the stage from regressing below interview.
  if ((rec.interviewed || rec.interviews?.length) && !match.interviewed) { changes.interviewed = true; note("interviewed", "no", "yes"); }
  if (blank(match.appliedDate) && !blank(rec.appliedDate)) { changes.appliedDate = rec.appliedDate; note("appliedDate", undefined, rec.appliedDate); }

  // Upsert interview rounds (idempotent). Counts as a change even when no posting field moved.
  const roundsChanged = rec.interviews?.length ? upsertInterviews(match.id, rec.interviews) : 0;
  if (roundsChanged) note("interviews", undefined, `${roundsChanged} round${roundsChanged === 1 ? "" : "s"}`);

  // Merge captured Gmail thread ids per stage onto the posting (link metadata — no event/diff noise).
  let emailChanged = false;
  if (rec.emailRefs && Object.keys(rec.emailRefs).length) {
    const cur = (() => { try { return match.emailRefs ? JSON.parse(match.emailRefs) : {}; } catch { return {}; } })();
    const merged = { ...cur, ...rec.emailRefs };
    if (JSON.stringify(merged) !== JSON.stringify(cur)) { changes.emailRefs = JSON.stringify(merged); emailChanged = true; }
  }

  const diffs = fieldDiffs.map((d) => `${d.field} ${d.old ?? "∅"}→${d.new ?? "∅"}`);
  if (!diffs.length && !roundsChanged && !emailChanged) return { diffs, summary: "" };
  const prevStage = match.state;
  changes.updatedAt = rec.updatedAt ?? today();
  db.update(postings).set(changes as Partial<typeof postings.$inferInsert>).where(eq(postings.id, match.id)).run();
  Object.assign(match, changes); // reflect in the pool so later records match the new values
  // Reaching the interview stage via sync auto-queues prep research (one-shot per company).
  if (changes.state === "interview") maybeQueuePrepResearch(match.companyId, prevStage, "interview");
  // One event per field changed — the actor (the agent for inbox-sync) wrote these.
  const subject = `${opts.companyName} — ${match.title ?? rec.role ?? "?"}`;
  for (const d of fieldDiffs) {
    logEvent({ actor: opts.actor, source: opts.source, entityId: match.id, action: "update", field: d.field, oldValue: d.old, newValue: d.new, summary: subject });
  }
  const summary = `${subject} · ${diffs.join(", ")}`;
  return { diffs, summary };
}

// Insert a brand-new posting from an incoming record. Logs the event; returns the new row
// (so callers can grow their pool) plus the action + logged summary.
function insertIncoming(
  co: CompanyRow,
  rec: IncomingApp,
  opts: { actor: string; source: string }
): { row: PostingRow; action: string; summary: string } {
  const base = {
    companyId: co.id,
    title: rec.role ?? "(untitled)", level: rec.level ?? null, team: rec.team ?? null, location: rec.location ?? null,
    state: toStage(rec.status), channel: (rec.channel ?? null) as PostingRow["channel"], source: rec.source ?? null, url: rec.url ?? null, note: rec.note ?? null,
    interviewed: rec.interviewed ?? false, needsReview: rec.needsReview ?? false, historical: false,
    appliedDate: rec.appliedDate ?? null, updatedAt: rec.updatedAt ?? today(),
    emailRefs: rec.emailRefs && Object.keys(rec.emailRefs).length ? JSON.stringify(rec.emailRefs) : null,
    verdict: "kept" as const, reason: null, scannedAt: new Date().toISOString(),
  };
  const id = db.insert(postings).values(base).returning({ id: postings.id }).get().id;
  if (rec.interviews?.length) upsertInterviews(id, rec.interviews); // attach any interview rounds
  const full = { id, atsId: null, department: null, fitScore: null, fitDetail: null, jd: null, resumeDir: null, redoLog: null, discoveredAt: null, ...base } as PostingRow;
  const action = rec.needsReview ? "flag" : "insert";
  const summary = `${co.name} — ${rec.role ?? "?"} · ${rec.status}${rec.interviewed ? " · interviewed" : ""}${rec.needsReview ? " · NEEDS REVIEW" : ""}`;
  logEvent({ actor: opts.actor, source: opts.source, entityId: id, action, summary });
  return { row: full, action, summary };
}

// Find the best existing company by canonical key; create one (preserving default tier)
// if none exists. Normalizes the stored name to the canonical form.
function resolveCompany(key: string, name: string, actor: string, source: string): { co: CompanyRow; isNew: boolean } {
  const all = db.select().from(companies).all();
  const existing = all.find((c) => canonical(c.name)?.key === key);
  if (existing) {
    if (existing.name !== name) db.update(companies).set({ name, updatedAt: new Date().toISOString() }).where(eq(companies.id, existing.id)).run();
    return { co: { ...existing, name }, isNew: false };
  }
  const tier = defaultTier(key);
  const ts = new Date().toISOString();
  const id = db.insert(companies).values({ name, tier, createdAt: ts, updatedAt: ts }).returning({ id: companies.id }).get().id;
  logEvent({ actor, source, entity: "company", entityId: id, action: "insert", summary: `new company ${name} [${tier}]` });
  return {
    co: { id, name, tier, careersUrl: null, ats: null, fetchMethod: null, fetchRecipe: null, notes: null, slug: null, endpoint: null, targetTitles: null, targetLocation: null, leveling: null, lastScrapedAt: null, watchlist: false, createdAt: ts, updatedAt: ts },
    isNew: true,
  };
}

// Incrementally merge normalized records into the DB. Idempotent: re-running the
// same input produces no changes. Returns a summary and logs per-row events.
// Ambiguous matches (2+ postings) are NOT guessed — they're parked in pending_matches
// for the user to resolve, leaving the posting rows untouched.
export function reconcile(
  records: IncomingApp[],
  opts: { actor: string; source: string; dryRun?: boolean }
): ReconcileResult {
  const { actor, source, dryRun } = opts;
  let inserted = 0, updated = 0, fieldChanges = 0, flagged = 0, pending = 0, newCompanies = 0;
  const details: { action: string; summary: string }[] = [];

  // group incoming by canonical company
  const groups = new Map<string, { name: string; recs: IncomingApp[] }>();
  for (const rec of records) {
    const c = canonical(rec.company);
    if (!c) continue;
    if (!groups.has(c.key)) groups.set(c.key, { name: c.name, recs: [] });
    groups.get(c.key)!.recs.push(rec);
  }

  try {
    db.transaction(() => {
    for (const [key, g] of groups) {
      const { co, isNew } = resolveCompany(key, g.name, actor, source);
      if (isNew) newCompanies++;
      // Mutable pool: the company's tracker postings + active pre-apply candidates (MATCH_STAGES),
      // growing with rows inserted this run so later identical records merge instead of duplicating.
      // Including tailoring/tailored/assessed/apply_later means an "applied" email graduates the
      // the candidate was working in place — no duplicate tracker row.
      const pool: PostingRow[] = db.select().from(postings)
        .where(and(eq(postings.companyId, co.id), inArray(postings.state, MATCH_STAGES))).all();

      for (const rec of g.recs) {
        const res = matchPosting(pool, rec, { fuzzyStates: FUZZY_STAGES });

        if (res.kind === "none") {
          const { row, action, summary } = insertIncoming(co, rec, { actor, source });
          pool.push(row);
          inserted++;
          if (action === "flag") flagged++;
          details.push({ action, summary });
          continue;
        }

        // Fuzzy (non-exact, e.g. email missing the team) and ambiguous (exact 2+) both go to human
        // approval — never auto-applied. The Match-review UI lets You pick the posting / + New /
        // Dismiss; resolvePendingMatch then graduates the chosen candidate in place.
        if (res.kind === "fuzzy" || res.kind === "ambiguous") {
          const created = createPendingMatch({
            actor, source, companyId: co.id, companyName: co.name,
            rec, candidateIds: res.candidates.map((c) => c.id),
          });
          if (created) {
            pending++;
            const why = res.kind === "fuzzy" ? "fuzzy title, confirm match" : "ambiguous, needs match";
            details.push({ action: "flag", summary: `${co.name} — ${rec.role ?? "?"} · ${rec.status}: ${why} (${res.candidates.length} posting${res.candidates.length === 1 ? "" : "s"})` });
          }
          continue;
        }

        // unique → auto-apply
        const { diffs, summary } = applyIncoming(res.app, rec, { actor, source, companyName: co.name });
        if (diffs.length) {
          updated++;
          fieldChanges += diffs.length;
          details.push({ action: "update", summary });
        }
      }
    }
    // dry run: undo everything (writes + logged events) by rolling back the transaction
    if (dryRun) {
      const e = new Error("__dryrun_rollback__") as Error & { __dryrun?: boolean };
      e.__dryrun = true;
      throw e;
    }
    });
  } catch (e) {
    if (!(e as { __dryrun?: boolean })?.__dryrun) throw e;
  }

  const summary = `${inserted} new · ${updated} updated (${fieldChanges} fields) · ${flagged} flagged · ${pending} to match · ${newCompanies} new companies`;
  return { inserted, updated, fieldChanges, flagged, pending, newCompanies, summary, details };
}

// Resolve a parked ambiguous match once the user picks. "apply" merges the incoming
// record onto the chosen posting (actor=You — the human's call is the truth);
// "new" inserts it as a fresh posting; "dismiss" drops it.
export function resolvePendingMatch(
  id: number,
  decision: "apply" | "new" | "dismiss",
  appId?: number
): { ok: boolean; error?: string } {
  const row = db.select().from(pendingMatches).where(eq(pendingMatches.id, id)).get();
  if (!row || row.status !== "pending") return { ok: false, error: "not found" };

  const finish = (resolvedAppId?: number) =>
    db.update(pendingMatches).set({
      status: decision === "dismiss" ? "dismissed" : "resolved",
      resolvedAppId: resolvedAppId ?? null,
      resolvedAt: new Date().toISOString(),
    }).where(eq(pendingMatches.id, id)).run();

  if (decision === "dismiss") { finish(); return { ok: true }; }

  // Unbound results (fit/tailor id-miss) are alerts — there's no IncomingApp to apply. Dismiss only.
  if (row.kind === "unbound") return { ok: false, error: "unbound result: dismiss only" };

  const rec = JSON.parse(row.payload) as IncomingApp;
  if (decision === "apply") {
    if (!appId) return { ok: false, error: "appId required" };
    const candidateIds = JSON.parse(row.candidateIds) as number[];
    if (!candidateIds.includes(appId)) return { ok: false, error: "not a candidate" };
    const match = db.select().from(postings).where(eq(postings.id, appId)).get();
    if (!match) return { ok: false, error: "application not found" };
    applyIncoming(match, rec, { actor: "You", source: row.source, companyName: row.companyName });
    finish(appId);
    return { ok: true };
  }

  // decision === "new"
  const co = db.select().from(companies).where(eq(companies.id, row.companyId)).get();
  if (!co) return { ok: false, error: "company not found" };
  const { row: created } = insertIncoming(co, rec, { actor: "You", source: row.source });
  finish(created.id);
  return { ok: true };
}
