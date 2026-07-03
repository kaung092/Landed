import Link from "next/link";
import { Code2, Network, Building2, Loader2, ChevronRight, CircleCheck, CircleDashed, MessageSquare } from "lucide-react";
import { listQuestions, listCompanyProfiles, listFeedback, getCompanyProfile, companySlug } from "@/lib/db/prep";
import { listPostings } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

// Progress over a question set: solved (≥1 solved attempt) / total.
function progress(qs: { done: boolean }[]) {
  const done = qs.filter((q) => q.done).length;
  return { done, total: qs.length, pct: qs.length ? Math.round((done / qs.length) * 100) : 0 };
}

// Companies currently in the interview/offer stage, with their prep-profile summary. Companies with
// no profile yet show as "researching" (CoWork auto-queues a prep-research job on stage entry).
// Collapsed by canonical slug so multiple postings at one company show once.
function interviewingCompanies() {
  const active = listPostings().filter((p) => p.status === "interview" || p.status === "offer");
  const byCompany = new Map<string, (typeof active)[number]>();
  for (const p of active) {
    const slug = companySlug(p.company);
    if (!byCompany.has(slug)) byCompany.set(slug, p);
  }
  return [...byCompany.entries()].map(([slug, p]) => {
    const profile = getCompanyProfile(slug);
    const questions = profile ? listQuestions({ company: slug }) : [];
    const confirmed = questions.filter((q) => q.companyConfidence === "confirmed").length;
    return {
      slug,
      name: p.company,
      role: p.role,
      status: p.status,
      researched: !!profile,
      overview: profile?.overview ?? null,
      rounds: profile?.rounds.length ?? 0,
      questions: questions.length,
      confirmed,
      likely: questions.length - confirmed,
      done: questions.filter((q) => q.done).length,
      pendingFeedback: profile ? listFeedback(slug).filter((f) => f.status === "queued").length : 0,
    };
  });
}

export default function PrepLanding() {
  const coding = listQuestions({ track: "coding" }).filter((q) => q.plan?.day != null);
  const systemDesign = listQuestions({ track: "system_design" });
  const interviewing = interviewingCompanies();
  const interviewingSlugs = new Set(interviewing.map((c) => c.slug));

  // Generic tracks always show; company lenses are data-driven from researched profiles.
  const tracks = [
    {
      href: "/prep/coding",
      icon: Code2,
      title: "Coding",
      sub: "14-day curriculum · patterns · complexity",
      accent: "from-emerald-400 to-sky-500",
      ...progress(coding),
    },
    {
      href: "/prep/system-design",
      icon: Network,
      title: "System Design",
      sub: "Question bank · game plan · tech decisions",
      accent: "from-sky-400 to-indigo-500",
      ...progress(systemDesign),
    },
  ];

  // Researched profiles NOT already shown under "Interviewing now" (avoid listing a company twice).
  const companies = listCompanyProfiles().filter((p) => !interviewingSlugs.has(p.slug)).map((p) => {
    const qs = listQuestions({ company: p.slug });
    const sub = [
      `${p.categories.length} categor${p.categories.length === 1 ? "y" : "ies"}`,
      p.rounds.length ? `${p.rounds.length} rounds` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      href: `/prep/company/${p.slug}`,
      icon: Building2,
      title: p.name,
      sub: sub || "Company-specific prep",
      accent: "from-fuchsia-400 to-purple-500",
      ...progress(qs),
    };
  });

  return (
    <div className="flex h-full flex-col text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 px-6 py-3.5 backdrop-blur">
        <h1 className="text-[15px] font-semibold tracking-tight text-zinc-100">Interview Prep</h1>
        <p className="mt-0.5 text-[13px] text-zinc-500">Track progress across coding, system design, and company-specific prep.</p>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {interviewing.length > 0 && (
            <>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-600">Interviewing now</h2>
              <div className="space-y-3">
                {interviewing.map((c) => (
                  <InterviewingCard key={c.slug} c={c} />
                ))}
              </div>
            </>
          )}

          <h2 className={`mb-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-600 ${interviewing.length > 0 ? "mt-6" : ""}`}>Tracks</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {tracks.map((c) => (
              <PrepCard key={c.href} {...c} />
            ))}
          </div>

          {companies.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-wider text-zinc-600">Companies</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {companies.map((c) => (
                  <PrepCard key={c.href} {...c} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// A company you're interviewing with. Researched → links into its prep page; not yet researched →
// a static card noting CoWork is building the prep (the page is force-dynamic, so it fills in on reload).
function InterviewingCard({
  c,
}: {
  c: {
    slug: string;
    name: string;
    role: string;
    status: string;
    researched: boolean;
    overview: string | null;
    rounds: number;
    questions: number;
    confirmed: number;
    likely: number;
    done: number;
    pendingFeedback: number;
  };
}) {
  const inner = (
    <div className={`group rounded-xl border bg-zinc-900/30 p-4 transition ${c.researched ? "border-zinc-800/70 hover:border-zinc-700 hover:bg-zinc-900/50" : "border-zinc-800/50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold text-zinc-100">{c.name}</h2>
            {c.status === "offer" && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25">offer</span>
            )}
            {c.pendingFeedback > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/25">
                <MessageSquare size={10} /> {c.pendingFeedback} refining
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-zinc-500">{c.role}</p>
        </div>
        {c.researched && <ChevronRight size={18} className="mt-0.5 shrink-0 text-zinc-600 transition group-hover:text-zinc-300" />}
      </div>

      {c.researched ? (
        <>
          {c.overview && <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-400">{c.overview}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
            <span>{c.rounds} round{c.rounds === 1 ? "" : "s"}</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {c.confirmed} confirmed</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {c.likely} likely</span>
            <span className="inline-flex items-center gap-1">
              {c.done >= c.questions && c.questions > 0 ? <CircleCheck size={12} className="text-emerald-400" /> : <CircleDashed size={12} />}
              {c.done}/{c.questions} practiced
            </span>
          </div>
        </>
      ) : (
        <div className="mt-2.5 flex items-center gap-2 text-[13px] text-zinc-500">
          <Loader2 size={13} className="animate-spin text-zinc-600" />
          CoWork is researching this company&apos;s interview process…
        </div>
      )}
    </div>
  );
  return c.researched ? <Link href={`/prep/company/${c.slug}`}>{inner}</Link> : inner;
}

function PrepCard({
  href,
  icon: Icon,
  title,
  sub,
  accent,
  done,
  total,
  pct,
}: {
  href: string;
  icon: typeof Code2;
  title: string;
  sub: string;
  accent: string;
  done: number;
  total: number;
  pct: number;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-5 transition hover:border-zinc-700 hover:bg-zinc-900/60"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-zinc-950`}>
          <Icon size={20} strokeWidth={2.4} />
        </div>
        <span className="font-mono text-[13px] text-zinc-500">
          {done}/{total}
        </span>
      </div>
      <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      <p className="mt-0.5 text-[13px] text-zinc-500">{sub}</p>
      <div className="mt-4 h-1.5 overflow-hidden rounded bg-zinc-800">
        <div className={`h-full rounded bg-gradient-to-r ${accent} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}
