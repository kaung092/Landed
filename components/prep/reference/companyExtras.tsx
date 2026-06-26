import type { ReactNode } from "react";
import InterviewMeta from "./InterviewMeta";

// Hand-curated reference extras for a company's prep view, keyed by slug. Most companies are
// fully data-driven from their CoWork research profile; this is the escape hatch for the rare
// company with bespoke, hand-built reference material (Databricks's signals / OA time budget /
// strategy) that's richer than the generic profile overview. Rendered as an extra tab by
// CompanyPrep. Empty for any company without an entry.
export const COMPANY_EXTRAS: Record<string, { label: string; node: ReactNode }> = {
  databricks: { label: "Interview", node: <InterviewMeta /> },
};
