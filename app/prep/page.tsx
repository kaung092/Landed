import Link from "next/link";
import { Code2, Network, Building2 } from "lucide-react";
import { listQuestions, listCompanyProfiles } from "@/lib/db/prep";

export const dynamic = "force-dynamic";

// Progress over a question set: solved (≥1 solved attempt) / total.
function progress(qs: { done: boolean }[]) {
  const done = qs.filter((q) => q.done).length;
  return { done, total: qs.length, pct: qs.length ? Math.round((done / qs.length) * 100) : 0 };
}

export default function PrepLanding() {
  const coding = listQuestions({ track: "coding" }).filter((q) => q.plan?.day != null);
  const systemDesign = listQuestions({ track: "system_design" });

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

  const companies = listCompanyProfiles().map((p) => {
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
          {companies.length > 0 && (
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-600">Tracks</h2>
          )}
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
