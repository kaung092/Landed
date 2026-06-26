// Side-effect module: MUST be imported before any "@/lib/*" module so the app's
// DB connection and asset paths point at a throwaway temp location, never the real
// data/jobhunt.db. ESM evaluates this fully before later imports in the test file.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-test-"));
process.env.ASSET_ROOT = dir;
process.env.JOBS_ROOT = path.join(dir, "agent-jobs");
process.env.DB_PATH = path.join(dir, "test.db");

// Build the schema on a throwaway connection (the app opens its own later).
const here = path.dirname(fileURLToPath(import.meta.url));
const sqlite = new Database(process.env.DB_PATH);
sqlite.exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));
sqlite.close();

export const TEST_DIR = dir;
