"use client";

import { useEffect, useState } from "react";
import { Loader2, Briefcase, CalendarDays, GitBranchPlus, Bot, GraduationCap } from "lucide-react";
import { ago } from "@/lib/format";
import type { DashboardStats, Tone } from "@/lib/db/dashboard";

const TONE_BAR: Record<Tone, string> = {
  good: "bg-emerald-500", accent: "bg-sky-500", critical: "bg-rose-500", warning: "bg-amber-500", neutral: "bg-zinc-500",
};
const pct = (f: number) => `${Math.round(f * 100)}%`;

export default function Dashboard() {
  const [d, setD] = useState<DashboardStats | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then((j) => (j.error ? setErr(true) : setD(j))).catch(() => setErr(true));
  }, []);

  return (
    <div className="flex h-full flex-col text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 px-6 py-3.5 backdrop-blur">
        <h1 className="text-[15px] font-semibold tracking-tight text-zinc-100">Dashboard</h1>
        <p className="mt-0.5 text-[13px] text-zinc-500">Your job hunt at a glance — funnel, outcomes, and momentum.</p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-5xl">
          {err ? (
            <p className="py-16 text-center text-[13px] text-rose-300">Couldn’t load stats.</p>
          ) : !d ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> loading…</div>
          ) : (
            <div className="space-y-6">
              {/* Headline KPIs */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatTile label="Applied" value={d.kpis.applied} />
                <StatTile label="Interviews" value={d.kpis.interviewed} tone="accent" />
                <StatTile label="Offers" value={d.kpis.offers} tone="good" />
                <StatTile label="Interview rate" value={pct(d.rates.interview)} sub="of applied" />
                <StatTile label="Active" value={d.kpis.active} sub="in progress" />
                <StatTile label="Watchlist" value={d.kpis.watchlist} sub="companies" />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Pipeline funnel" icon={<GitBranchPlus size={14} className="text-sky-300" />}>
                  <Funnel funnel={d.funnel} />
                </Card>
                <Card title="Application outcomes" icon={<Briefcase size={14} className="text-emerald-300" />}>
                  <Outcomes outcomes={d.outcomes} />
                </Card>
              </div>

              <Card title="Applications per week" icon={<CalendarDays size={14} className="text-violet-300" />} sub="last 12 weeks">
                <Weekly weekly={d.weekly} />
              </Card>

              <div className="grid gap-6 lg:grid-cols-3">
                <Card title="Agents" icon={<Bot size={14} className="text-sky-300" />}>
                  <MiniStats items={[["Jobs done", d.agent.done], ["Queued", d.agent.queued], ["Working", d.agent.wip]]} />
                </Card>
                <Card title="Prep" icon={<GraduationCap size={14} className="text-emerald-300" />}>
                  <MiniStats items={[["Practice attempts", d.prep.attempts], ["Companies researched", d.prep.companies]]} />
                </Card>
                <Card title="Recent activity">
                  {d.recent.length === 0 ? (
                    <p className="py-4 text-center text-[12px] text-zinc-600">No activity yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {d.recent.map((e, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px]">
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${e.actor === "CoWork" ? "bg-sky-400" : "bg-emerald-400"}`} />
                          <span className="min-w-0 flex-1 truncate text-zinc-300" title={e.summary}>{e.summary}</span>
                          <span className="shrink-0 text-zinc-600">{ago(e.at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: Tone }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "accent" ? "text-sky-300" : "text-zinc-100";
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-600">{sub}</p>}
    </div>
  );
}

function Card({ title, icon, sub, children }: { title: string; icon?: React.ReactNode; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-[13px] font-semibold text-zinc-200">{title}</h2>
        {sub && <span className="text-[11px] text-zinc-600">· {sub}</span>}
      </div>
      {children}
    </section>
  );
}

// Cumulative funnel — magnitude bars scaled to the widest stage, with step conversion %.
function Funnel({ funnel }: { funnel: DashboardStats["funnel"] }) {
  const max = Math.max(1, ...funnel.map((f) => f.count));
  return (
    <div className="space-y-2.5">
      {funnel.map((f, i) => {
        const prev = funnel[i - 1];
        const conv = prev && prev.count ? Math.round((f.count / prev.count) * 100) : null;
        return (
          <div key={f.key} className="flex items-center gap-3">
            <div className="w-20 shrink-0 text-[12px] text-zinc-400">{f.label}</div>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(2, (f.count / max) * 100)}%` }} />
            </div>
            <div className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-100">{f.count}</div>
            <div className="w-12 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">{conv != null ? `${conv}%` : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

// Outcomes — a proportional status bar (2px gaps) + a legend with counts. Status colors, never alone.
function Outcomes({ outcomes }: { outcomes: DashboardStats["outcomes"] }) {
  const total = outcomes.reduce((s, o) => s + o.count, 0);
  const shown = outcomes.filter((o) => o.count > 0);
  return (
    <div>
      {total === 0 ? (
        <p className="py-4 text-center text-[12px] text-zinc-600">No applications yet.</p>
      ) : (
        <>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {shown.map((o) => (
              <div key={o.key} className={`h-full ${TONE_BAR[o.tone]}`} style={{ width: `${(o.count / total) * 100}%` }} title={`${o.label}: ${o.count}`} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {outcomes.map((o) => (
              <div key={o.key} className="flex items-center gap-1.5 text-[12px]">
                <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_BAR[o.tone]}`} />
                <span className="min-w-0 flex-1 truncate text-zinc-400">{o.label}</span>
                <span className="tabular-nums text-zinc-200">{o.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Applications over time — vertical magnitude bars, one hue.
function Weekly({ weekly }: { weekly: DashboardStats["weekly"] }) {
  const max = Math.max(1, ...weekly.map((w) => w.count));
  return (
    <div className="flex h-32 items-end gap-1.5">
      {weekly.map((w) => (
        <div key={w.week} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`Week of ${w.week}: ${w.count} application${w.count === 1 ? "" : "s"}`}>
          <div className="flex w-full flex-1 items-end">
            <div className="w-full rounded-t bg-sky-500/80" style={{ height: `${(w.count / max) * 100}%`, minHeight: w.count ? "3px" : "0" }} />
          </div>
          <span className="text-[9px] tabular-nums text-zinc-600">{w.label}</span>
        </div>
      ))}
    </div>
  );
}

function MiniStats({ items }: { items: [string, number][] }) {
  return (
    <div className="space-y-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between">
          <span className="text-[12px] text-zinc-400">{label}</span>
          <span className="text-sm font-semibold tabular-nums text-zinc-100">{value}</span>
        </div>
      ))}
    </div>
  );
}
