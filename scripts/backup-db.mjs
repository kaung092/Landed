#!/usr/bin/env node
// Periodic SQLite backup. The DB is the single source of truth now, so this guards it.
//
// Uses `VACUUM INTO` — a plain `cp` of a WAL-mode database can capture a torn/stale snapshot
// (the .db file lags the -wal). VACUUM INTO reads a consistent snapshot even while the
// always-on server is writing, and emits a single self-contained, defragmented .db (no
// -wal/-shm sidecars to manage). Each run: snapshot → verify with PRAGMA integrity_check →
// prune to the newest N. Safe to run by hand: `npm run backup`.
//
// Config via env: DB_PATH (source), BACKUP_DIR (dest), BACKUP_KEEP (retention count).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.env.DB_PATH || path.join(REPO, "data", "jobhunt.db");
const DEST_DIR = process.env.BACKUP_DIR || path.join(REPO, "data", "backups");
const KEEP = Number(process.env.BACKUP_KEEP || 60);

const log = (m) => process.stdout.write(`[backup ${new Date().toISOString()}] ${m}\n`);
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    log(`source DB not found: ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(DEST_DIR, { recursive: true });
  const dest = path.join(DEST_DIR, `jobhunt-${stamp()}.db`);

  // consistent, self-contained snapshot (WAL-safe; single file, no sidecars)
  const src = new Database(SRC);
  src.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  src.close();

  // verify the snapshot opens + passes an integrity check; drop it if not
  const copy = new Database(dest, { readonly: true });
  const ok = copy.pragma("integrity_check", { simple: true });
  copy.close();
  if (ok !== "ok") {
    log(`integrity check FAILED for ${path.basename(dest)}: ${ok} — discarding`);
    fs.rmSync(dest, { force: true });
    process.exit(1);
  }
  log(`ok → ${path.basename(dest)} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);

  // retention: keep the newest KEEP snapshots (timestamped names sort chronologically)
  const files = fs.readdirSync(DEST_DIR).filter((f) => /^jobhunt-\d{8}-\d{6}\.db$/.test(f)).sort();
  const excess = files.slice(0, Math.max(0, files.length - KEEP));
  for (const f of excess) fs.rmSync(path.join(DEST_DIR, f), { force: true });
  if (excess.length) log(`pruned ${excess.length} old backup(s); keeping newest ${KEEP}`);
}

main().catch((e) => {
  log(`ERROR: ${e?.stack || e}`);
  process.exit(1);
});
