import { notFound } from "next/navigation";
import { getCompanyProfile } from "@/lib/db/prep";
import { prepContextDumpedAt } from "@/lib/prep/export-context";
import CompanyPrep from "@/components/prep/CompanyPrep";

export const dynamic = "force-dynamic";

// The single per-company prep surface — the CoWork-researched profile organized into LeetCode /
// System Design / Other trackers, an Overview, and a scoped live agent chat under each tab.
export default async function CompanyPrepPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = getCompanyProfile(slug);
  if (!profile) notFound();
  return <CompanyPrep profile={profile} lastDumpedAt={prepContextDumpedAt(slug)} />;
}
