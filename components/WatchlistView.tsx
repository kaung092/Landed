"use client";

import { useMemo } from "react";
import { useApplications } from "@/hooks/useApplications";
import { buildTargetCounts } from "@/lib/pipeline";
import TargetsTable from "@/components/board/TargetsTable";

// The Watchlist is optional auto-discovery: the companies CoWork scans for new postings. It used to
// be the pipeline's first step; it now lives on its own route so the funnel is purely paste → fit →
// tailor → apply. Scanned postings still flow into the pipeline's Fit step as before — only the
// setup/config table moved here. TargetsTable owns its own header + layout; we just supply the
// per-company pipeline rollup (where each watched company's postings currently sit).
export default function WatchlistView() {
  const { postings } = useApplications();
  const counts = useMemo(() => buildTargetCounts(postings), [postings]);
  return <TargetsTable counts={counts} />;
}
