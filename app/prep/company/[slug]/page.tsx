import { notFound } from "next/navigation";
import { getCompanyProfile } from "@/lib/db/prep";
import CompanyPrep from "@/components/prep/CompanyPrep";

export const dynamic = "force-dynamic";

// Generic company prep page — renders the CoWork-researched profile for one company.
// Replaces the old hardcoded /prep/databricks: Databricks is now a seeded profile row.
export default async function CompanyPrepPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = getCompanyProfile(slug);
  if (!profile) notFound();
  return <CompanyPrep profile={profile} />;
}
