import { db } from "./index";
import { postings, companies, prepAttempts, prepCompany, jobs, events } from "./schema";

// Dashboard aggregation — everything the /dashboard page shows, computed from existing tables in one
// pass. `state` is a single point-in-time value, so funnel counts are CUMULATIVE ("reached at least
// this stage"): the `interviewed` flag + downstream states stand in for history.

const APPLIED_STATES = new Set(["applied", "interview", "offer", "accepted", "rejected", "ghost", "withdrawn"]);
const ACTIVE_STATES = new Set(["applied", "interview", "offer"]); // in-flight, not closed
const OFFER_STATES = new Set(["offer", "accepted"]);

export type Tone = "good" | "warning" | "critical" | "neutral" | "accent";
export type DashboardStats = {
  kpis: { applied: number; interviewed: number; offers: number; active: number; assessed: number; watchlist: number };
  rates: { interview: number; offer: number }; // fractions 0–1, of applied
  funnel: { key: string; label: string; count: number }[]; // cumulative, ordered
  outcomes: { key: string; label: string; count: number; tone: Tone }[]; // of applications
  weekly: { week: string; label: string; count: number }[]; // applications per week (last 12)
  agent: { done: number; queued: number; wip: number };
  prep: { attempts: number; companies: number };
  recent: { at: string; summary: string; actor: string }[]; // last activity from the change log
};

// Monday-anchored week key (YYYY-MM-DD) — computed entirely in UTC so the bucket keys here and the
// week axis below always agree (mixing local getDay() with UTC toISOString silently shifts the day
// and drops every applied date into the wrong bucket).
function weekMonday(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back up to Monday
  return d.toISOString().slice(0, 10);
}

export function dashboardStats(): DashboardStats {
  const ps = db
    .select({ state: postings.state, fitScore: postings.fitScore, appliedDate: postings.appliedDate, interviewed: postings.interviewed })
    .from(postings)
    .all();
  const cos = db.select({ watchlist: companies.watchlist }).from(companies).all();

  const byState: Record<string, number> = {};
  for (const p of ps) byState[p.state] = (byState[p.state] ?? 0) + 1;
  const n = (pred: (p: (typeof ps)[number]) => boolean) => ps.filter(pred).length;

  const assessed = n((p) => p.fitScore != null);
  const applied = n((p) => APPLIED_STATES.has(p.state) || !!p.appliedDate);
  const interviewed = n((p) => p.interviewed || p.state === "interview" || OFFER_STATES.has(p.state));
  const offers = n((p) => OFFER_STATES.has(p.state));
  const active = n((p) => ACTIVE_STATES.has(p.state) && !OFFER_STATES.has(p.state));
  const watchlist = cos.filter((c) => c.watchlist).length;

  const funnel = [
    { key: "assessed", label: "Assessed", count: assessed },
    { key: "applied", label: "Applied", count: applied },
    { key: "interviewed", label: "Interviewed", count: interviewed },
    { key: "offer", label: "Offer", count: offers },
  ];

  const outcomes: DashboardStats["outcomes"] = [
    { key: "offer", label: "Offer / accepted", count: offers, tone: "good" },
    { key: "active", label: "In progress", count: active, tone: "accent" },
    { key: "rejected", label: "Rejected", count: byState["rejected"] ?? 0, tone: "critical" },
    { key: "ghost", label: "Ghosted", count: byState["ghost"] ?? 0, tone: "warning" },
    { key: "withdrawn", label: "Withdrawn", count: (byState["withdrawn"] ?? 0) + (byState["expired"] ?? 0), tone: "neutral" },
  ];

  // Applications per week for the last 12 weeks (by appliedDate) — Mondays in UTC (see weekMonday).
  const now = new Date();
  const thisMon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  thisMon.setUTCDate(thisMon.getUTCDate() - ((thisMon.getUTCDay() + 6) % 7));
  const weeks: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const w = new Date(thisMon);
    w.setUTCDate(w.getUTCDate() - i * 7);
    weeks.push(w.toISOString().slice(0, 10));
  }
  const perWeek: Record<string, number> = {};
  for (const p of ps) if (p.appliedDate) { const k = weekMonday(p.appliedDate); if (k) perWeek[k] = (perWeek[k] ?? 0) + 1; }
  const weekly = weeks.map((w) => ({ week: w, label: `${w.slice(5, 7)}/${w.slice(8, 10)}`, count: perWeek[w] ?? 0 }));

  const js = db.select({ status: jobs.status }).from(jobs).all();
  const agent = {
    done: js.filter((j) => j.status === "ingested").length,
    queued: js.filter((j) => j.status === "queued").length,
    wip: js.filter((j) => j.status === "wip").length,
  };

  const prep = {
    attempts: db.select({ id: prepAttempts.id }).from(prepAttempts).all().length,
    companies: db.select({ slug: prepCompany.slug }).from(prepCompany).all().length,
  };

  const recent = db
    .select({ at: events.ts, summary: events.summary, actor: events.actor })
    .from(events)
    .all()
    .filter((e) => e.summary)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8)
    .map((e) => ({ at: e.at, summary: e.summary ?? "", actor: e.actor }));

  return {
    kpis: { applied, interviewed, offers, active, assessed, watchlist },
    rates: { interview: applied ? interviewed / applied : 0, offer: applied ? offers / applied : 0 },
    funnel,
    outcomes,
    weekly,
    agent,
    prep,
    recent,
  };
}
