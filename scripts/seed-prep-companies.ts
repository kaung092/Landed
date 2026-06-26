// Seed company prep profiles + back-fill companyMeta on already-tagged questions. Idempotent:
// upserts the profile on slug and only writes companyMeta (never attempts/progress), so it's
// safe to re-run. This migrates Databricks from the old hardcoded view to the data-driven
// company-prep model. Run: npm run seed:prep-companies
import { db } from "../lib/db";
import { prepQuestions, prepCompany } from "../lib/db/schema";
import { sql, eq } from "drizzle-orm";

// Databricks profile. Categories ARE the view's sections; the curated Signals / OA time-budget
// / strategy reference still renders via the COMPANY_EXTRAS "Interview" tab (not a category).
const DATABRICKS = {
  slug: "databricks",
  name: "Databricks",
  process:
    "Databricks screens with an online assessment heavy on data-structures & algorithms, " +
    "then live coding + system design. The LeetCode hit list and bespoke lakehouse scenarios " +
    "below reflect the most-reported problems. See the Interview tab for the signals they " +
    "evaluate and the OA time budget.",
  rounds: [
    { name: "Online Assessment", format: "~35 min/problem", focus: "DS&A — arrays, heaps, intervals, streaming" },
    { name: "Live Coding", focus: "Bespoke lakehouse scenarios — k-way merge, dedup, top-K" },
    { name: "System Design", focus: "Data-intensive systems, tradeoffs at scale" },
  ],
  categories: [
    {
      key: "scenarios",
      label: "DB Questions",
      kind: "other",
      description: "Bespoke scenarios mirroring lakehouse reality — k-way merge, dedup, streaming top-K.",
    },
    {
      key: "lc",
      label: "LC Hit List",
      kind: "coding",
      description: "Problems most frequently reported by Databricks candidates. Know these cold before the OA.",
    },
  ],
  sources: [] as { label: string; url?: string }[],
  researchedAt: "2026-06-20T00:00:00.000Z",
};

function parse<T>(raw: string | null, fb: T): T {
  if (!raw) return fb;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fb;
  }
}

function seedProfile(p: typeof DATABRICKS) {
  const row = {
    slug: p.slug,
    name: p.name,
    process: p.process,
    rounds: JSON.stringify(p.rounds),
    categories: JSON.stringify(p.categories),
    sources: JSON.stringify(p.sources),
    researchedAt: p.researchedAt,
  };
  db.insert(prepCompany).values(row).onConflictDoUpdate({ target: prepCompany.slug, set: row }).run();
}

// Assign each question tagged for the company to a category. Default rule: a question with a
// leetcodeNum is the "LC hit list"; everything else is the bespoke "scenarios" bucket.
function backfillCompanyMeta(companySlug: string, lcKey: string, bespokeKey: string) {
  const rows = db.select().from(prepQuestions).all();
  const order: Record<string, number> = {};
  let touched = 0;
  for (const r of rows) {
    const companies = parse<string[]>(r.companies, []);
    if (!companies.includes(companySlug)) continue;
    const meta = parse<Record<string, unknown>>(r.companyMeta, {});
    const category = r.leetcodeNum != null ? lcKey : bespokeKey;
    order[category] = (order[category] ?? 0) + 1;
    meta[companySlug] = { category, sortOrder: order[category] };
    db.update(prepQuestions).set({ companyMeta: JSON.stringify(meta) }).where(eq(prepQuestions.id, r.id)).run();
    touched++;
  }
  return touched;
}

function main() {
  seedProfile(DATABRICKS);
  const touched = backfillCompanyMeta(DATABRICKS.slug, "lc", "scenarios");
  const profiles = db.select({ c: sql<number>`count(*)` }).from(prepCompany).get();
  console.log(`prep companies seeded — ${profiles?.c} profile(s); ${touched} questions categorized for ${DATABRICKS.name}`);
}

main();
