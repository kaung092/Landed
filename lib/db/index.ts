import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// DB lives in the repo (gitignored), NOT in iCloud — see config discussion.
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "jobhunt.db");

// Cache the connection across Next.js hot reloads.
const globalForDb = globalThis as unknown as { _sqlite?: Database.Database };

function connection() {
  if (globalForDb._sqlite) return globalForDb._sqlite;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Fold the WAL into the main .db file frequently so the file stays current —
  // otherwise a plain cp backup captures a stale snapshot (learned the hard way).
  sqlite.pragma("wal_autocheckpoint = 100");
  // Lightweight bootstrap for tables added after the initial schema (drizzle-kit push
  // is flaky in this project — see notes). Idempotent.
  sqlite.exec(`CREATE TABLE IF NOT EXISTS pending_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    actor TEXT NOT NULL,
    source TEXT NOT NULL,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    company_name TEXT NOT NULL,
    signature TEXT NOT NULL,
    payload TEXT NOT NULL,
    candidate_ids TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'match',
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_app_id INTEGER,
    resolved_at TEXT
  )`);
  // `kind` was added after pending_matches shipped — backfill it on existing DBs (idempotent).
  {
    const pmCols = new Set(
      (sqlite.prepare("PRAGMA table_info(pending_matches)").all() as { name: string }[]).map((r) => r.name)
    );
    if (!pmCols.has("kind")) sqlite.exec(`ALTER TABLE pending_matches ADD COLUMN kind TEXT NOT NULL DEFAULT 'match'`);
  }
  sqlite.exec(`CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    due TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS prep_questions (
    id TEXT PRIMARY KEY,
    track TEXT NOT NULL,
    name TEXT NOT NULL,
    prompt TEXT,
    difficulty TEXT,
    priority TEXT,
    url TEXT,
    leetcode_num INTEGER,
    tags TEXT,
    companies TEXT,
    content TEXT,
    plan TEXT,
    sort_order INTEGER
  )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS prep_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id TEXT NOT NULL REFERENCES prep_questions(id),
    attempted_at TEXT NOT NULL,
    duration_sec INTEGER,
    status TEXT NOT NULL DEFAULT 'solved',
    notes TEXT
  )`);
  // Unify: the discovery/tracker store is now `postings` (renamed from `candidates`). Rename in
  // place on existing DBs so the 2.9k rows carry over; fresh DBs get the name from the CREATE below.
  if (sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='candidates'").get()
      && !sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='postings'").get()) {
    sqlite.exec("ALTER TABLE candidates RENAME TO postings");
  }
  sqlite.exec(`CREATE TABLE IF NOT EXISTS postings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    ats_id TEXT,
    title TEXT NOT NULL,
    location TEXT,
    url TEXT,
    department TEXT,
    verdict TEXT NOT NULL,
    reason TEXT,
    state TEXT NOT NULL DEFAULT 'new',
    scanned_at TEXT NOT NULL,
    UNIQUE(company_id, ats_id)
  )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS prep_progress (
    question_id TEXT PRIMARY KEY REFERENCES prep_questions(id),
    noted INTEGER NOT NULL DEFAULT 0,
    redo INTEGER NOT NULL DEFAULT 0,
    redo_added_at TEXT,
    updated_at TEXT
  )`);
  // Per-company prep profile (CoWork research output). Keyed by canonical company slug.
  sqlite.exec(`CREATE TABLE IF NOT EXISTS prep_company (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    process TEXT,
    rounds TEXT,
    categories TEXT,
    sources TEXT,
    researched_at TEXT
  )`);
  // company_meta added to prep_questions after the initial schema (idempotent ALTER).
  const prepQCols = new Set(
    (sqlite.prepare("PRAGMA table_info(prep_questions)").all() as { name: string }[]).map((r) => r.name)
  );
  if (!prepQCols.has("company_meta")) sqlite.exec(`ALTER TABLE prep_questions ADD COLUMN company_meta TEXT`);
  // The jobs table became the live queue (not just an ingest ledger) — add the spec/payload
  // columns. Idempotent: only ALTER for columns the table doesn't already have.
  const jobCols = new Set(
    (sqlite.prepare("PRAGMA table_info(jobs)").all() as { name: string }[]).map((r) => r.name)
  );
  for (const [name, ddl] of [
    ["playbook", "playbook TEXT"],
    ["task", "task TEXT"],
    ["params", "params TEXT"],
    ["result", "result TEXT"],
    ["claimed_at", "claimed_at TEXT"], // agent-claim timestamp (status wip)
    ["claimed_by", "claimed_by TEXT"], // who claimed it
  ] as const) {
    if (!jobCols.has(name)) sqlite.exec(`ALTER TABLE jobs ADD COLUMN ${ddl}`);
  }
  // Target scrape config + search criteria on companies (CoWork curates via upsertCompanies).
  const coCols = new Set(
    (sqlite.prepare("PRAGMA table_info(companies)").all() as { name: string }[]).map((r) => r.name)
  );
  for (const [name, ddl] of [
    ["fetch_method", "fetch_method TEXT"],
    ["fetch_recipe", "fetch_recipe TEXT"],
    ["slug", "slug TEXT"],
    ["endpoint", "endpoint TEXT"],
    ["target_titles", "target_titles TEXT"],
    ["target_location", "target_location TEXT"],
    ["leveling", "leveling TEXT"],
    ["last_scraped_at", "last_scraped_at TEXT"],
    ["watchlist", "watchlist INTEGER NOT NULL DEFAULT 0"],
  ] as const) {
    if (!coCols.has(name)) sqlite.exec(`ALTER TABLE companies ADD COLUMN ${ddl}`);
  }
  // postings gained the fit phase (fit_score/fit_detail/resume_dir/jd) and then the unified
  // tracker fields (folded in from `applications` — see docs/unify-postings-plan.md) — add if missing.
  const candCols = new Set(
    (sqlite.prepare("PRAGMA table_info(postings)").all() as { name: string }[]).map((r) => r.name)
  );
  for (const [name, ddl] of [
    ["fit_score", "fit_score INTEGER"],
    ["fit_detail", "fit_detail TEXT"],
    ["resume_dir", "resume_dir TEXT"],
    ["jd", "jd TEXT"],
    ["level", "level TEXT"],
    ["team", "team TEXT"],
    ["source", "source TEXT"],
    ["channel", "channel TEXT"],
    ["note", "note TEXT"],
    ["interviewed", "interviewed INTEGER NOT NULL DEFAULT 0"],
    ["needs_review", "needs_review INTEGER NOT NULL DEFAULT 0"],
    ["pinned", "pinned INTEGER NOT NULL DEFAULT 0"],
    ["chosen_resume", "chosen_resume TEXT"],
    ["edited_resumes", "edited_resumes TEXT"],
    ["email_refs", "email_refs TEXT"],
    ["historical", "historical INTEGER NOT NULL DEFAULT 0"],
    ["discovered_at", "discovered_at TEXT"],
    ["applied_date", "applied_date TEXT"],
    ["updated_at", "updated_at TEXT"],
    ["redo_log", "redo_log TEXT"],
    ["comments", "comments TEXT"],
  ] as const) {
    if (!candCols.has(name)) sqlite.exec(`ALTER TABLE postings ADD COLUMN ${ddl}`);
  }
  // interviews gained a per-round Gmail thread id (inbox-sync) for direct email links — add if missing.
  {
    const ivCols = new Set(
      (sqlite.prepare("PRAGMA table_info(interviews)").all() as { name: string }[]).map((r) => r.name)
    );
    if (ivCols.size && !ivCols.has("email_id")) sqlite.exec(`ALTER TABLE interviews ADD COLUMN email_id TEXT`);
  }
  // Index the stage + company — every funnel/board/tracker query scopes by these, and the table
  // holds the full scan firehose (mostly `filtered`), so the indexes keep those scoped reads fast.
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_candidates_state ON postings(state)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_candidates_company ON postings(company_id)");
  // Legacy state rename (idempotent — no rows match once migrated):
  //   tracked/queued → fit_queue (a posting sent to fit assessment).
  sqlite.exec("UPDATE postings SET state='fit_queue' WHERE state IN ('tracked','queued')");
  // `state` is now the single source of truth for the funnel step (was derived from verdict).
  // Backfill the never-triaged `new` rows and split tailoring by resume slug — idempotent (no
  // rows match once migrated):
  //   new + kept   → matched  (passed the pre-filter, awaiting CoWork's glance)
  //   new + dropped→ filtered (rigid pre-filter drop, never glanced)
  //   tailoring + a resume slug → tailored (resume ready)
  sqlite.exec("UPDATE postings SET state='matched'  WHERE state='new' AND verdict='kept'");
  sqlite.exec("UPDATE postings SET state='filtered' WHERE state='new' AND verdict='dropped'");
  sqlite.exec("UPDATE postings SET state='tailored' WHERE state='tailoring' AND resume_dir IS NOT NULL");

  // (The one-time `applications` → `postings` merge migration was removed — that table no longer
  // exists in any DB; the unified posting model is fully in place. See git history if ever needed.)

  globalForDb._sqlite = sqlite;
  return sqlite;
}

export const db = drizzle(connection(), { schema });
export { schema };
