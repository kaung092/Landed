import type { Criterion } from "./types";

// The starter rubric — stable criterion CATEGORIES. Per-posting requirement instances roll up into
// these, so verdicts aggregate across runs (what makes precision/recall computable). Editable later;
// this is just the cold-start set. `definition` is the judging instruction handed to the LLM.
//   gate   = hard veto (a clear miss drops the posting regardless of score)
//   must   = core fit, heavily weighted
//   nice   = bonus, lightly weighted
//   signal = soft indicator, lightly weighted
export const STARTER_CRITERIA: Omit<Criterion, "active">[] = [
  {
    key: "location",
    label: "Location",
    type: "gate",
    weight: 0,
    sortOrder: 0,
    definition:
      "Is the role workable from the candidate's location (NYC / US-remote)? Onsite/hybrid in another metro, or non-US only, is a miss. US-remote or NYC-based is met. If location is unstated, mark unclear.",
  },
  {
    key: "yoe-floor",
    label: "YoE floor",
    type: "gate",
    weight: 0,
    sortOrder: 1,
    definition:
      "Does the candidate clear the posting's minimum years-of-experience requirement? The candidate has ~9 years. Only an unusually high floor (e.g. 12+) or a domain-specific YoE the candidate lacks is a miss. No floor stated → met.",
  },
  {
    key: "level-match",
    label: "Level match",
    type: "must",
    weight: 3,
    sortOrder: 2,
    definition:
      "Does the posting's level match the candidate's level (Senior / Staff, ex-Amazon L6)? Staff/Senior/L6-L7 is met. Principal/Director or a clear under-level (new-grad/L4) is unmet; an adjacent stretch is partial.",
  },
  {
    key: "must-have-coverage",
    label: "Must-have coverage",
    type: "must",
    weight: 3,
    sortOrder: 3,
    definition:
      "What fraction of the posting's must-have technical requirements does the resume evidence? Full coverage = met, most = partial, a core must-have clearly missing = unmet. Judge against demonstrated experience, not keyword presence.",
  },
  {
    key: "domain-relevance",
    label: "Domain relevance",
    type: "signal",
    weight: 1,
    sortOrder: 4,
    definition:
      "How relevant is the candidate's domain background (large-scale distributed systems, ads/trust/risk, recommendations, ML platform / agentic systems) to the posting's domain? Strong overlap = met, adjacent = partial, unrelated = unmet.",
  },
  {
    key: "seniority-signal",
    label: "Seniority signal",
    type: "signal",
    weight: 1,
    sortOrder: 5,
    definition:
      "Does the posting want scope the candidate demonstrably has — cross-team technical leadership, ownership of org-level strategy, mentoring, 0→1 delivery? Clear match = met, neutral = partial, the posting wants something absent (e.g. people-management) = unmet.",
  },
];

// The candidate profile the Detect stage judges against — plain text so the LLM reads it directly
// (no PDF parsing in the request path). Seeded from the base reference resume; editable on the page,
// stored under the config key below. Keep it the SOURCE OF TRUTH the assessor sees.
export const PROFILE_CONFIG_KEY = "fitlab_profile";

export const PROFILE_SEED = `REDACTED-RESUME`;
