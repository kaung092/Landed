"use client";

import { useMemo, useState } from "react";
import { Loader2, ExternalLink, Download } from "lucide-react";
import type { CompanyProfile, PrepQuestion } from "@/lib/db/prep";
import { ago } from "@/lib/format";
import { usePrep } from "@/hooks/usePrep";
import { usePersistentState } from "@/hooks/usePersistentState";
import PrepShell from "./PrepShell";
import QuestionRow from "./QuestionRow";
import QuestionCard from "./QuestionCard";
import ScenarioQuestionCard from "./ScenarioQuestionCard";
import CompanyChatPanel from "./CompanyChatPanel";
import { COMPANY_EXTRAS } from "./reference/companyExtras";
import { SectionTitle } from "./ui";

const OVERVIEW = "__overview__";
const EXTRAS = "__extras__";

// The three fixed per-company trackers. LeetCode + System Design reuse the shared question banks
// (so attempt history / best times carry across companies); "Other" holds bespoke questions that
// aren't standard LC/SD (company-specific design, behavioral, take-homes…).
const LEETCODE = "leetcode";
const SYSDESIGN = "system_design";
const OTHER = "other";
const TRACKER_LABEL: Record<string, string> = { [LEETCODE]: "LeetCode", [SYSDESIGN]: "System Design", [OTHER]: "Other" };
const TRACKER_IDS = new Set([LEETCODE, SYSDESIGN, OTHER]);

// Confirmed (asked-before) questions sort ahead of likely (predicted) ones; their per-question tag
// (ConfidenceTag) shows which is which + why, so no separate tier headers are needed.
const confRank = (q: PrepQuestion) => (q.companyConfidence === "confirmed" ? 0 : 1);

// Build the scope the company chat is seeded with — the company, the loop, and every tracked
// question (grouped by tracker) — so the docked agent can talk about anything on the page. It also
// has the jobhunt MCP tools for deeper lookups.
function companyContext(profile: CompanyProfile, byTracker: Map<string, PrepQuestion[]>): string {
  const rounds = profile.rounds
    .map((r) => `${r.name}${r.format ? ` (${r.format})` : ""}${r.focus ? ` — ${r.focus}` : ""}`)
    .join("; ");
  const group = (id: string) => {
    const qs = byTracker.get(id) ?? [];
    if (!qs.length) return "";
    const list = qs
      .map((q) => `- ${q.name}${q.leetcodeNum ? ` (LC ${q.leetcodeNum})` : ""} [${q.companyConfidence ?? "likely"}]`)
      .join("\n");
    return `${TRACKER_LABEL[id]} questions:\n${list}`;
  };
  return [
    `You are an interview-prep coach helping the candidate prepare for their interviews at ${profile.name}.`,
    profile.overview ? `Company / product:\n${profile.overview}` : "",
    profile.process ? `Interview process:\n${profile.process}` : "",
    rounds ? `Rounds: ${rounds}` : "",
    group(LEETCODE),
    group(SYSDESIGN),
    group(OTHER),
    "You have the jobhunt MCP tools (the candidate's tracker, postings, résumé, and this prep profile) — use them when helpful. Be concise and practical: help them practice, pressure-test answers, surface patterns, suggest variations, and refine the prep when asked.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Company prep, organized into LeetCode / System Design / Other trackers. Each question renders in
// its native card with a confidence tag (confirmed/likely + why); confirmed questions sort first.
// LC/SD questions reuse the shared banks (progress carries across companies); only bespoke "Other"
// questions are local. Every tab embeds a scoped PrepChat so you can iterate live with the agent.
export default function CompanyPrep({ profile, lastDumpedAt }: { profile: CompanyProfile; lastDumpedAt?: string | null }) {
  // Persisted per company, so coming back to this company restores the tab you were on.
  const [tab, setTab] = usePersistentState(`landed.prep.company.tab.${profile.slug}`, OVERVIEW);
  const { questions, loading, logAttempt, undoLast, setNoted, setRedo } = usePrep(undefined, profile.slug);

  // A question's card style: the research category's kind if set, else its own track. Coding →
  // LeetCode tracker, system_design → System Design, everything else (behavioral/bespoke) → Other.
  const kindByCat = useMemo(() => new Map(profile.categories.map((c) => [c.key, c.kind])), [profile.categories]);
  const cardKind = (q: PrepQuestion) => kindByCat.get(q.companyCategory ?? "") ?? q.track;
  const trackerOf = (q: PrepQuestion) => {
    const k = cardKind(q);
    return k === "coding" ? LEETCODE : k === "system_design" ? SYSDESIGN : OTHER;
  };

  const byTracker = useMemo(() => {
    const m = new Map<string, PrepQuestion[]>([[LEETCODE, []], [SYSDESIGN, []], [OTHER, []]]);
    for (const q of questions) m.get(trackerOf(q))!.push(q);
    for (const list of m.values()) list.sort((a, b) => confRank(a) - confRank(b));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, kindByCat]);

  const extras = COMPANY_EXTRAS[profile.slug];
  const otherCount = byTracker.get(OTHER)!.length;

  // LeetCode + System Design always present (every company gets both); Other only when it has any.
  const tabs = [
    { id: OVERVIEW, label: "Overview" },
    { id: LEETCODE, label: "LeetCode" },
    { id: SYSDESIGN, label: "System Design" },
    ...(otherCount ? [{ id: OTHER, label: "Other" }] : []),
    ...(extras ? [{ id: EXTRAS, label: extras.label }] : []),
  ];
  // A persisted tab that no longer exists (e.g. "Other" emptied out) falls back to Overview.
  const activeTab = tabs.some((t) => t.id === tab) ? tab : OVERVIEW;

  const renderCard = (q: PrepQuestion) => {
    const kind = cardKind(q);
    if (kind === "coding")
      return <QuestionRow key={q.id} q={q} onLog={logAttempt} onUndo={undoLast} onNoted={setNoted} onRedo={setRedo} />;
    if (kind === "system_design") return <QuestionCard key={q.id} q={q} onLog={logAttempt} onUndo={undoLast} />;
    return <ScenarioQuestionCard key={q.id} q={q} onLog={logAttempt} onUndo={undoLast} />;
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <PrepShell
          title={profile.name}
          subtitle={profile.process ? undefined : "Company-specific interview prep"}
          parent={{ label: "Interview Prep", href: "/prep" }}
          tabs={tabs}
          active={activeTab}
          onChange={setTab}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <Loader2 size={16} className="animate-spin" /> loading…
            </div>
          ) : activeTab === OVERVIEW ? (
            <div className="space-y-5">
              <DumpContextButton slug={profile.slug} initialAt={lastDumpedAt ?? null} />
              <Overview profile={profile} count={questions.length} />
            </div>
          ) : activeTab === EXTRAS && extras ? (
            extras.node
          ) : TRACKER_IDS.has(activeTab) ? (
            <Tracker label={TRACKER_LABEL[activeTab]} dense={activeTab === LEETCODE} questions={byTracker.get(activeTab) ?? []} renderCard={renderCard} />
          ) : null}
        </PrepShell>
      </div>

      {/* Docked, collapsible chat with Claude Code — scoped to this company. */}
      <CompanyChatPanel slug={profile.slug} companyName={profile.name} context={companyContext(profile, byTracker)} />
    </div>
  );
}

// One tracker (LeetCode / System Design / Other): its questions (confirmed first), each card
// carrying its own confidence tag. `dense` = coding rows (own dividers, no extra spacing).
function Tracker({
  label,
  dense,
  questions,
  renderCard,
}: {
  label: string;
  dense: boolean;
  questions: PrepQuestion[];
  renderCard: (q: PrepQuestion) => React.ReactNode;
}) {
  return (
    <div>
      <SectionTitle title={label} sub={`${questions.length} question${questions.length === 1 ? "" : "s"}`} />
      {questions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800/70 py-8 text-center text-[13px] text-zinc-600">
          No {label} questions yet — ask the agent below, or have CoWork research them.
        </p>
      ) : (
        <div className={dense ? "" : "space-y-2"}>{questions.map(renderCard)}</div>
      )}
    </div>
  );
}

// The research narrative: a concise, role-relevant company snapshot + the rounds and sources.
// Dump this company's current context to interview-prep/<slug>/context.md (for a CoWork prep chat),
// showing when it was last dumped. The file is the single brief a per-company CoWork chat reads.
function DumpContextButton({ slug, initialAt }: { slug: string; initialAt: string | null }) {
  const [at, setAt] = useState<string | null>(initialAt);
  const [busy, setBusy] = useState(false);
  const dump = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/prep/company/${slug}/export`, { method: "POST" });
      const d = await r.json();
      if (d.at) {
        setAt(d.at);
        pendo.track("prep_context_exported", { company_slug: slug });
      }
    } catch { /* ignore */ } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800/70 bg-zinc-900/30 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-zinc-200">CoWork prep context</p>
        <p className="text-[12px] text-zinc-500">
          {at ? `Last dumped ${ago(at)}` : "Not dumped yet"} · <code className="text-zinc-400">interview-prep/{slug}/context.md</code>
        </p>
      </div>
      <button
        onClick={dump}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        Dump context
      </button>
    </div>
  );
}

function Overview({ profile, count }: { profile: CompanyProfile; count: number }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-zinc-500">
        <span>{count} questions</span>
        {profile.rounds.length > 0 && (
          <>
            <span>·</span>
            <span>{profile.rounds.length} round{profile.rounds.length === 1 ? "" : "s"}</span>
          </>
        )}
        {profile.researchedAt && (
          <>
            <span>·</span>
            <span>researched {profile.researchedAt.slice(0, 10)}</span>
          </>
        )}
      </div>

      {profile.overview && (
        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-zinc-600">Company &amp; product</h3>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-zinc-300">{profile.overview}</p>
        </div>
      )}

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
