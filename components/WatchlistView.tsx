"use client";

import { useMemo } from "react";
import { useApplications } from "@/hooks/useApplications";
import { buildTargetCounts } from "@/lib/pipeline";
import TargetsTable from "@/components/board/TargetsTable";
import ScanResults from "@/components/board/ScanResults";

// The Watchlist is optional auto-discovery: the companies the agent scans for new postings. It used to
// be the pipeline's first step; it now lives on its own route so the funnel is purely paste → fit →
// tailor → apply. The page shows what the scan surfaced (ScanResults — triage new postings into Fit)
// on top of the company config (TargetsTable). We supply TargetsTable the per-company pipeline rollup.
export default function WatchlistView() {
  const { postings } = useApplications();
  const counts = useMemo(() => buildTargetCounts(postings), [postings]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScanResults />
      <div className="min-h-0 flex-1"><TargetsTable counts={counts} /></div>
    </div>
  );
}
