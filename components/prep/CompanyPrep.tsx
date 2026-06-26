"use client";

import { useMemo, useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import type { CompanyProfile, PrepQuestion } from "@/lib/db/prep";
import { usePrep } from "@/hooks/usePrep";
import PrepShell from "./PrepShell";
import QuestionRow from "./QuestionRow";
import QuestionCard from "./QuestionCard";
import DBQuestionCard from "./DBQuestionCard";
import { COMPANY_EXTRAS } from "./reference/companyExtras";
import { SectionTitle } from "./ui";

const OVERVIEW = "__overview__";
const EXTRAS = "__extras__";

// Generic company prep lens — fully data-driven from the CoWork research profile. The
// profile's ordered `categories` become the tabs; each question lands in its category via
// companyCategory. Cards are picked by category.kind so a shared LC problem (coding),
// reused SD question, bespoke scenario (other), or behavioral prompt each render in their
// native style — all sharing the single attempt history. Databricks is now just one of these.
export default function CompanyPrep({ profile }: { profile: CompanyProfile }) {
  const [tab, setTab] = useState(OVERVIEW);
  const { questions, loading, logAttempt, undoLast, setNoted, setRedo } = usePrep(undefined, profile.slug);

  // Bucket questions by their per-company category key. Questions whose category no longer
  // matches any defined category fall into an "Other" catch-all so nothing is hidden.
  const byCategory = useMemo(() => {
    const m = new Map<string, PrepQuestion[]>();
    for (const q of questions) {
      const key = q.companyCategory ?? "";
      (m.get(key) ?? m.set(key, []).get(key)!).push(q);
    }
    return m;
  }, [questions]);

  const known = new Set(profile.categories.map((c) => c.key));
  const orphans = questions.filter((q) => !q.companyCategory || !known.has(q.companyCategory));
  const extras = COMPANY_EXTRAS[profile.slug];

  const tabs = [
    { id: OVERVIEW, label: "Overview" },
    ...profile.categories.map((c) => ({ id: c.key, label: c.label })),
    ...(orphans.length ? [{ id: "__orphans__", label: "Other" }] : []),
    ...(extras ? [{ id: EXTRAS, label: extras.label }] : []),
  ];

  const renderCard = (q: PrepQuestion, kind: string) => {
    if (kind === "coding")
      return <QuestionRow key={q.id} q={q} onLog={logAttempt} onUndo={undoLast} onNoted={setNoted} onRedo={setRedo} />;
    if (kind === "system_design") return <QuestionCard key={q.id} q={q} onLog={logAttempt} onUndo={undoLast} />;
    // behavioral + other → the expandable scenario card (prompt + why/approach/follow-ups)
    return <DBQuestionCard key={q.id} q={q} onLog={logAttempt} onUndo={undoLast} />;
  };

  const active = profile.categories.find((c) => c.key === tab);

  return (
    <PrepShell
      title={`${profile.name} Prep`}
      subtitle={profile.process ? undefined : "Company-specific interview prep"}
      tabs={tabs}
      active={tab}
      onChange={setTab}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" /> loading…
        </div>
      ) : tab === OVERVIEW ? (
        <Overview profile={profile} count={questions.length} />
      ) : tab === EXTRAS && extras ? (
        extras.node
      ) : tab === "__orphans__" ? (
        <div>
          <SectionTitle title="Other" sub="Questions not yet assigned to a category." />
          <div className="space-y-2">{orphans.map((q) => renderCard(q, q.track))}</div>
        </div>
      ) : active ? (
        <div>
          <SectionTitle title={active.label} sub={active.description} />
          <div className={active.kind === "coding" ? "" : "space-y-2"}>
            {(byCategory.get(active.key) ?? []).map((q) => renderCard(q, active.kind))}
            {(byCategory.get(active.key) ?? []).length === 0 && (
              <p className="py-8 text-center text-sm text-zinc-600">No questions in this category yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </PrepShell>
  );
}

// The research narrative: process overview, the rounds, and sources.
function Overview({ profile, count }: { profile: CompanyProfile; count: number }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-zinc-500">
        <span>{count} questions</span>
        <span>·</span>
        <span>{profile.categories.length} categories</span>
        {profile.researchedAt && (
          <>
            <span>·</span>
            <span>researched {profile.researchedAt.slice(0, 10)}</span>
          </>
        )}
      </div>

      {profile.process && (
        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-zinc-600">Interview process</h3>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-zinc-300">{profile.process}</p>
        </div>
      )}

      {profile.rounds.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-600">Rounds</h3>
          <div className="space-y-2">
            {profile.rounds.map((r, i) => (
              <div key={i} className="rounded-xl border border-zinc-800/70 bg-zinc-900/30 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold text-zinc-100">{r.name}</span>
                  {r.format && <span className="font-mono text-[13px] text-zinc-500">{r.format}</span>}
                </div>
                {r.focus && <p className="mt-1 text-[14px] leading-relaxed text-zinc-400">{r.focus}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.sources.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-600">Sources</h3>
          <ul className="space-y-1">
            {profile.sources.map((s, i) => (
              <li key={i} className="text-[14px] text-zinc-400">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-emerald-300"
                  >
                    {s.label}
                    <ExternalLink size={11} className="opacity-50" />
                  </a>
                ) : (
                  s.label
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
