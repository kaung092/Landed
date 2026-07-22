// The pipeline spine — the single source of truth for the home Pipeline page's stages, drawn as the
// arrow-ribbon funnel (components/Pipeline.tsx). `turn` = whose move it is: you = your decision,
// cowork = waiting on CoWork, done = graduated to the tracker, archive = dropped.
// A step spans one or more `states`: pre-apply steps over candidate scan-store states (Fit
// Assessment = fit_queue + assessed; Tailor Resume = tailoring + tailored; Apply Later = apply_later)
// summed from /api/scanned?state=<states>; tracker steps over Posting statuses (filtered via lib/pipeline columnOf).
export type Turn = "you" | "cowork" | "done" | "archive";
export type SpineStep = { key: string; label: string; turn: Turn; states: string[]; hint?: string };

// The full pipeline, left → right. The first three steps are pre-apply candidate stages backed by
// the scan store (/api/scanned); the last three are tracker stages backed by `postings` (the
// applications table). A tracker step's `states` are the Posting statuses that roll into it (same
// grouping as lib/pipeline columnOf), so the funnel can filter postings by status per step.
export const DISCOVERY_SPINE: SpineStep[] = [
  // Note: the watchlist/scan-setup ("Scan Watchlist") is no longer a funnel step — it lives on its
  // own /watchlist route as optional auto-discovery. Fit Assessment is the funnel's first step; its
  // `review` here is a candidate STATE (a scanned posting awaiting triage), not the old step.
  { key: "fit", label: "Fit Assessment", turn: "cowork", states: ["matched", "review", "fit_queue", "assessed"], hint: "Triage new matches (queue or discard), CoWork scores them, then tailor / apply / save" },
  { key: "tailor", label: "Tailor Resume", turn: "cowork", states: ["tailoring", "tailored"], hint: "CoWork tailors a resume — then apply" },
  { key: "later", label: "Apply Later", turn: "you", states: ["apply_later"], hint: "Ready to submit — parked here until you apply" },
  { key: "applied", label: "Applied", turn: "done", states: ["applied"], hint: "Submitted — awaiting a response" },
  { key: "interview", label: "Interviewing", turn: "done", states: ["interview", "offer"], hint: "In the loop — interviews and offers" },
  { key: "closed", label: "Closed", turn: "done", states: ["accepted", "rejected", "ghost", "withdrawn", "company_skipped", "expired"], hint: "Outcome reached" },
];

export const DISCOVERY_ARCHIVE: SpineStep[] = [
  { key: "dismissed", label: "Discarded", turn: "archive", states: ["dismissed"], hint: "Dropped at a glance / triage" },
  { key: "filtered", label: "Filtered", turn: "archive", states: ["filtered"], hint: "Rejected by the coarse pre-filter (never glanced)" },
];

// Total candidates in a pre-apply step — summed across its member scan-store states.
export const stepCount = (step: SpineStep, counts: Record<string, number> | null | undefined): number =>
  step.states.reduce((n, s) => n + (counts?.[s] ?? 0), 0);
