import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

// Tier of a company. Drives the pipeline rules (see lib/pipeline.ts).
export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  tier: text("tier", { enum: ["top_target", "target", "practice"] })
    .notNull()
    .default("practice"),
  careersUrl: text("careers_url"),
  ats: text("ats"), // backend system: greenhouse | ashby | custom | verify — drives the app's API scan
  // HOW to actually read the board, separate from the backend system. The app's scanCompany
  // keys off `ats`; CoWork uses this to pick its own path when the API scan doesn't apply.
  fetchMethod: text("fetch_method"), // api | careers-get | browser
  // Short, human/agent-readable scan steps for browser/careers-get companies (no click
  // coords): which filters to set, what to exclude, and whether level comes from the title
  // or the JD. Only needed when fetchMethod isn't `api`. Distinct from freeform `notes`.
  fetchRecipe: text("fetch_recipe"),
  notes: text("notes"),
  // Scrape config + search criteria for a target (CoWork curates these via upsertCompanies).
  slug: text("slug"), // ATS board slug, e.g. "anthropic" for greenhouse/ashby
  endpoint: text("endpoint"), // scrape API endpoint (or a "(verify XHR)" hint)
  targetTitles: text("target_titles"), // JSON string[] of titles to target, e.g. ["Senior","Staff"]
  targetLocation: text("target_location"), // e.g. "NYC|remote"
  leveling: text("leveling"), // JSON {source,ladder} — levels.fyi ladder on the shared 1–10 reference scale
  lastScrapedAt: text("last_scraped_at"), // ISO; stamped when discovery surfaces a posting for this company
  // Discovery auto-scans ONLY watchlisted companies (scanning is expensive). Orthogonal to
  // tier — tier is for tagging/categorization; watchlist is "scan this for new postings".
  watchlist: integer("watchlist", { mode: "boolean" }).notNull().default(false),
});

// NOTE: the former `applications` table was folded into `postings` (the unified model — see
// docs/unify-postings-plan.md). The tracker is now `postings` rows in a TRACKER stage.

// Change log — every mutation writes a row here, tagged with its source.
// Powers the Changes view and makes automated edits auditable/reversible.
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: text("ts").notNull(), // ISO timestamp
  actor: text("actor").notNull().default("You"), // You (manual) | CoWork (ingestion)
  source: text("source").notNull(), // ui | inbox | cowork | scraper | reconcile
  entity: text("entity").notNull(), // application | company
  entityId: integer("entity_id"),
  action: text("action").notNull(), // insert | update | preserve | flag | delete | merge
  field: text("field"), // null for row-level summary events
  oldValue: text("old_value"),
  newValue: text("new_value"),
  summary: text("summary"),
});

// Many interview rounds per application — the "interviewing" stage.
export const interviews = sqliteTable("interviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id")
    .notNull()
    .references(() => postings.id),
  round: integer("round"),
  kind: text("kind"), // phone_screen | onsite | system_design | ...
  date: text("date"),
  outcome: text("outcome"), // passed | rejected | pending
  notes: text("notes"),
  emailId: text("email_id"), // Gmail thread id for this round's email (inbox-sync) — for a direct link
});

// Small key-value store for app state (Gmail refresh token, last-sync cursor, …).
export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value"),
});

// CoWork job ledger. A job's live state lives in the asset-folder queue/done
// The job queue + ledger (DB-backed; replaces the agent-jobs/{queue,results,done} files).
// A row IS the queued job: app→CoWork handoffs (fit/tailoring) and CoWork self-runs both
// live here. Lifecycle: queued → wip (an agent claimed it) → ingested (result submitted) | failed.
// An agent claims a job (queued → wip, stamping claimed_at) before working it so two agents never
// run the same job; a stuck wip job is recovered by the user with a manual requeue (wip → queued).
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // discovery | inbox-sync | fit | tailoring | prep
  createdBy: text("created_by").notNull().default("You"), // You | CoWork
  status: text("status").notNull().default("queued"), // queued | wip | ingested | failed
  createdAt: text("created_at").notNull(),
  claimedAt: text("claimed_at"), // when an agent claimed it (status wip); cleared on requeue
  claimedBy: text("claimed_by"), // the agent/session that claimed it (defaults to CoWork)
  ingestedAt: text("ingested_at"),
  summary: text("summary"),
  playbook: text("playbook"), // instructions/<playbook> CoWork should follow
  task: text("task"), // human/CoWork-readable instruction
  params: text("params"), // JSON job input (e.g. { postings: [{ company, role, jd, url }] })
  result: text("result"), // JSON of the submitted result records (history)
});

// One row per agent run — powers the Agents page "last run" + history.
export const agentRuns = sqliteTable("agent_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: text("agent_id").notNull(),
  ts: text("ts").notNull(),
  inserted: integer("inserted").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  fieldChanges: integer("field_changes").notNull().default(0),
  flagged: integer("flagged").notNull().default(0),
  newCompanies: integer("new_companies").notNull().default(0),
  summary: text("summary"),
});

// Ambiguous ingestion matches awaiting a human pick. When a sync record (e.g. a
// rejection) could belong to 2+ existing applications, we don't guess — we park it
// here and surface it in the Changes "needs review" panel for the user to resolve.
export const pendingMatches = sqliteTable("pending_matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
  actor: text("actor").notNull(), // who produced the incoming record (CoWork)
  source: text("source").notNull(), // inbox-sync, ...
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  companyName: text("company_name").notNull(),
  signature: text("signature").notNull(), // norm(role)|status|appliedDate — for idempotent re-sync
  payload: text("payload").notNull(), // JSON: IncomingApp (match) | { jobType, declaredId, record } (unbound)
  candidateIds: text("candidate_ids").notNull(), // JSON number[] of candidate posting ids (hints for unbound)
  // Action kind: `match` = pick which posting an incoming inbox record belongs to (fuzzy/ambiguous);
  // `unbound` = a fit/tailor result whose echoed id didn't resolve — an alert to look at (dismiss only).
  kind: text("kind", { enum: ["match", "unbound"] }).notNull().default("match"),
  status: text("status", { enum: ["pending", "resolved", "dismissed"] })
    .notNull()
    .default("pending"),
  resolvedAppId: integer("resolved_app_id"),
  resolvedAt: text("resolved_at"),
});

// your personal to-do list — manual action items (follow-ups, interview prep, …).
// Not tied to the application change-log; this is your own scratchpad.
export const todos = sqliteTable("todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  due: text("due"), // optional ISO date
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

// ── Interview prep ──
// One row per distinct practiceable question — the single source of truth shared by
// the generic (coding / system design) and company-specific views. `companies` tags
// which company lenses feature it; `[]` = generic-only. Like `todos`, prep is a
// personal scratchpad and does NOT write to the `events` change-log.
export const prepQuestions = sqliteTable("prep_questions", {
  id: text("id").primaryKey(), // stable slug, e.g. "kway", "lc-23", "news_agg"
  // coding / system_design = the shared generic banks; behavioral / other = company-specific
  // (bespoke technical, values/leadership) — these live only inside a company lens.
  track: text("track", { enum: ["coding", "system_design", "behavioral", "other"] }).notNull(),
  name: text("name").notNull(),
  prompt: text("prompt"),
  difficulty: text("difficulty"), // Easy | Medium | Hard | Mixed
  priority: text("priority"), // coding: TOP | ...
  url: text("url"),
  leetcodeNum: integer("leetcode_num"),
  tags: text("tags"), // JSON string[]
  companies: text("companies"), // JSON string[] of company slugs; [] = generic-only
  // Per-company framing: { [slug]: { category, sortOrder, note } }. Lets ONE shared question
  // (e.g. an LC problem) sit under a different category per company while keeping one row +
  // one shared attempt history. `companies` stays the membership/filter list; this adds grouping.
  companyMeta: text("company_meta"), // JSON { [slug]: { category, sortOrder, note } }
  content: text("content"), // JSON blob: why/note/approach/followUps/gotchas/keyComponents/deepDive/category/tier
  plan: text("plan"), // JSON { day, week, pattern, anchor, extra } — coding curriculum grouping
  sortOrder: integer("sort_order"),
});

// One row per company you're prepping for — the research output CoWork writes (see the
// prep-research job). The catalog of questions stays in prep_questions; this holds the
// company-specific narrative + the ordered category list its view is built from. Keyed by
// the same slug used in prepQuestions.companies / companyMeta (canonical company key).
export const prepCompany = sqliteTable("prep_company", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  process: text("process"), // markdown — interview-process overview
  rounds: text("rounds"), // JSON [{ name, format, focus }]
  categories: text("categories"), // JSON [{ key, label, description, kind }] — ordered; drives the view's sections
  sources: text("sources"), // JSON [{ label, url }] — where the intel came from
  researchedAt: text("researched_at"), // ISO; last time CoWork refreshed this profile
});

// Append-only practice log. Powers "how many times" (count) and "time record" (min duration).
export const prepAttempts = sqliteTable("prep_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: text("question_id")
    .notNull()
    .references(() => prepQuestions.id),
  attemptedAt: text("attempted_at").notNull(), // ISO timestamp
  durationSec: integer("duration_sec"),
  status: text("status", { enum: ["solved", "partial", "failed"] }).notNull().default("solved"),
  notes: text("notes"),
});

// Per-question flags (mirrors the artifact's "noted" + "redo queue").
export const prepProgress = sqliteTable("prep_progress", {
  questionId: text("question_id")
    .primaryKey()
    .references(() => prepQuestions.id),
  noted: integer("noted", { mode: "boolean" }).notNull().default(false), // notes written up
  redo: integer("redo", { mode: "boolean" }).notNull().default(false), // in redo queue
  redoAddedAt: text("redo_added_at"),
  updatedAt: text("updated_at"),
});

// The unified posting model — ONE row per (company, ATS job id) spanning the whole lifecycle, from
// raw watchlist-scan output through the tracker. A scan produces hundreds of rows per company (most
// stay `filtered`); a posting advances through `state` (the single lifecycle field) as it's
// triaged, assessed, tailored, applied, interviewed… Re-scans upsert + refresh the verdict but
// preserve the triage `state`. Funnel = pre-apply states; board/tracker = applied-onward states.
export const postings = sqliteTable("postings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  atsId: text("ats_id"), // stable ATS job id — the dedup key
  title: text("title").notNull(),
  location: text("location"),
  url: text("url"),
  department: text("department"),
  // verdict + reason are DISPLAY ANNOTATIONS only (why the pre-filter kept/dropped a row) — `state`
  // alone decides which lifecycle step a posting sits in. See the `state` note below.
  verdict: text("verdict", { enum: ["kept", "dropped"] }).notNull(),
  reason: text("reason"), // null when kept; discipline | location | level | dedup when dropped
  // The pipeline stage — the SINGLE source of truth for where a posting sits, spanning the whole
  // lifecycle (the discovery funnel + the tracker, being unified into this one model — see
  // docs/unify-postings-plan.md). Pre-filter: filtered · matched. Glance: review · dismissed ·
  // fit_queue. Fit: assessed · apply_later. Tailor: tailoring · tailored. Tracker: applied ·
  // interview · offer · accepted · rejected · ghost · withdrawn · company_skipped · expired.
  state: text("state", { enum: ["filtered", "matched", "review", "dismissed", "fit_queue", "assessed", "apply_later", "tailoring", "tailored", "applied", "interview", "offer", "accepted", "rejected", "ghost", "withdrawn", "company_skipped", "expired"] }).notNull().default("filtered"),
  fitScore: integer("fit_score"),
  fitDetail: text("fit_detail"), // JSON FitAssessment blob (mirrors applications.fit_detail)
  jd: text("jd"), // the posting's job description — fetched once (scan or fit) and reused by fit + tailoring
  resumeDir: text("resume_dir"), // per-candidate tailoring folder once tailored (latest version)
  // The résumé you've chosen to submit — "base" (the untailored résumé) or a specific version's slug.
  // Deliberately NOT defaulted to the latest version: you pick it explicitly in the drawer.
  chosenResume: text("chosen_resume"),
  editedResumes: text("edited_resumes"), // JSON string[] of version slugs you've manually edited by hand
  // JSON { applied?, rejected?, offer?, interview? } → Gmail thread id for the email that drove that
  // stage (from inbox-sync). Lets the tracker deep-link straight to the email; null = none captured.
  emailRefs: text("email_refs"),
  // The redo conversation: a JSON RedoTurn[] alternating agent⇄user, one logical thread per phase
  // (fit / tailor). Seeded by the agent's first result, then a user redo note, then the agent's
  // next versioned result… Each agent turn IS a version; the live fit_detail/resume_dir project the
  // latest. Powers "redo with a note" — the agent replays the whole thread on its next run.
  redoLog: text("redo_log"), // JSON RedoTurn[]
  comments: text("comments"), // JSON Comment[] — your personal comment thread on this posting
  scannedAt: text("scanned_at").notNull(),
  // Tracker fields (folded in from `applications` for the unified model; populated at Stage 2).
  level: text("level"), // Staff, Senior, ...
  team: text("team"), // Infra, Ads, Platform, ...
  source: text("source"), // greenhouse | ashby | inbox | manual | ...
  channel: text("channel", { enum: ["direct", "referral"] }),
  note: text("note"),
  interviewed: integer("interviewed", { mode: "boolean" }).notNull().default(false),
  needsReview: integer("needs_review", { mode: "boolean" }).notNull().default(false),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false), // user-pinned → floats to the top of its stage table
  historical: integer("historical", { mode: "boolean" }).notNull().default(false),
  discoveredAt: text("discovered_at"),
  appliedDate: text("applied_date"),
  updatedAt: text("updated_at"),
});

export type PrepQuestionRow = typeof prepQuestions.$inferSelect;
export type PrepCompanyRow = typeof prepCompany.$inferSelect;
export type PrepAttemptRow = typeof prepAttempts.$inferSelect;
export type PrepProgressRow = typeof prepProgress.$inferSelect;

export type CompanyRow = typeof companies.$inferSelect;
export type TodoRow = typeof todos.$inferSelect;
export type PendingMatchRow = typeof pendingMatches.$inferSelect;
export type InterviewRow = typeof interviews.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type PostingRow = typeof postings.$inferSelect;
