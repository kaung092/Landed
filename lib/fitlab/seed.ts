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

export const PROFILE_SEED = `KAUNG HTET — New York, NY
Senior/Staff Software Engineer · 9 years at Amazon building large-scale, customer-facing systems across advertising, trust & risk, and recommendation platforms. Drives cross-team technical strategy and delivers distributed systems with measurable business impact. Recently built a 0→1 full-stack product as a technical founder.

EXPERIENCE
Senior Software Engineer (L6) · Amazon (Nov 2023 – Nov 2025) · New York, NY
Advertising Partner Trust, Risk and Compliance
- Defined a 1-year technical north star for the Advertising Partner Trust & Compliance ecosystem across 2 teams (~15 engineers), aligning multiple systems under a unified architecture and securing org-level funding.
- Owned Partner Quality Score, an external-facing advertiser metric — end-to-end system design across science, backend, and customer-facing frontend.
- Led an LLM-powered automated policy violation detection system (evals, precision, human-in-the-loop) scanning advertiser websites and social content for policy violations.
- Led an org-level prototype of a RAG-based expert subagent within a large-scale retail agentic workflow.
- Drove security audits and leadership approvals; unblocked cross-team execution while mentoring 3 engineers.
- Owned discovery of fragmented sales workflows and identity consolidation between Salesforce and internal systems (data ingestion + reconciliation pipelines), coordinating across 3 teams.

Software Engineer (L5 & L4) · Amazon (Feb 2017 – Nov 2023) · New York, NY
Recommendation & Content Optimization
- Pioneered a recommendation content optimization system adopted by internal advertising recommendation systems, driving 2–3% incremental lift in adoption.
- Productionized recommendation and content optimization models into customer-facing systems; built MLOps pipelines incl. feature stores, offline/online evaluation, and low-latency inference services.
- Built a rule-based audience targeting engine with batch ingestion via ETL from a data lake and multi-channel delivery (email, SMS, in-product) supporting millions of daily communications.
- Owned a campaign management platform with ML-driven optimization recommendations; architected a hierarchical reporting system (partner → advertiser → campaign → ad group → creative) with role-based views.

Founder / CTO · Cinelay (Dec 2025 – Feb 2026) · Myanmar
- Built a 0→1 full-stack micro-drama platform as the sole engineer: coin-based monetization, episode gating, adaptive low-bandwidth video streaming, content management backend. Conducted investor + market validation.

Earlier: Software Engineer · Veripad (Android, counterfeit-medicine detection). Software Engineer (Co-op) · MTA (real-time bus tracking for 6,000+ NYC buses).

PROJECTS
- Agentic Job-Search Pipeline: stage-based pipeline (scan → fit → tailor → apply) with operator UI; bring-your-own-agent architecture over a DB-backed job queue behind a custom MCP server; atomic claim leases + idempotent reconcile.
- Criteria-Driven Research Agent (LangGraph): lead agent fans out to parallel sub-researchers with human-in-the-loop gates and checkpointed resumable runs; policy-based eval harness with variance (Jaccard/Levenshtein) + snapshot-regression testing.
- Voice-First Travel Planner (Gemini Live): real-time sync between a streaming voice agent and a multimodal UI.

SKILLS
Languages: Java, TypeScript, Python, C++, SQL. Backend: Node.js, Express, GraphQL, Redis, Docker. Cloud: AWS, CI/CD. Frontend: React, React Native. AI/Agentic: LLM integration, multi-agent systems, RAG pipelines.

EDUCATION
B.E. Electrical Engineering · City College of New York · Magna Cum Laude.`;
