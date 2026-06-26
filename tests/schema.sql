CREATE TABLE IF NOT EXISTS `agent_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`ts` text NOT NULL,
	`inserted` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`field_changes` integer DEFAULT 0 NOT NULL,
	`flagged` integer DEFAULT 0 NOT NULL,
	`new_companies` integer DEFAULT 0 NOT NULL,
	`summary` text
);

CREATE TABLE IF NOT EXISTS `app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);

-- (The legacy `applications` table was removed — the unified `postings` table is the source of
-- truth now. Tests build the schema in its post-migration form.)

CREATE TABLE IF NOT EXISTS `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`tier` text DEFAULT 'practice' NOT NULL,
	`careers_url` text,
	`ats` text,
	`notes` text,
	`fetch_method` text,
	`fetch_recipe` text,
	`slug` text,
	`endpoint` text,
	`target_titles` text,
	`target_location` text,
	`last_scraped_at` text,
	`watchlist` integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`actor` text DEFAULT 'System' NOT NULL,
	`source` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer,
	`action` text NOT NULL,
	`field` text,
	`old_value` text,
	`new_value` text,
	`summary` text
);

CREATE TABLE IF NOT EXISTS `interviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`round` integer,
	`kind` text,
	`date` text,
	`outcome` text,
	`notes` text,
	FOREIGN KEY (`application_id`) REFERENCES `postings`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS jobs(id text PRIMARY KEY, type text NOT NULL, created_by text NOT NULL DEFAULT 'app', status text NOT NULL DEFAULT 'queued', created_at text NOT NULL, ingested_at text, summary text, playbook text, task text, params text, result text);

CREATE TABLE IF NOT EXISTS pending_matches (
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
  );

CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    due TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

CREATE UNIQUE INDEX IF NOT EXISTS `companies_name_unique` ON `companies` (`name`);

CREATE TABLE IF NOT EXISTS `candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL REFERENCES companies(id),
	`ats_id` text,
	`title` text NOT NULL,
	`location` text,
	`url` text,
	`department` text,
	`verdict` text NOT NULL,
	`reason` text,
	`state` text DEFAULT 'new' NOT NULL,
	`fit_score` integer,
	`fit_detail` text,
	`resume_dir` text,
	`comments` text,
	`scanned_at` text NOT NULL,
	UNIQUE(company_id, ats_id)
);
