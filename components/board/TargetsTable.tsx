import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, ExternalLink, HelpCircle, Loader2, Plus, Radar, RefreshCw, Sparkles, Telescope, Undo2, X } from "lucide-react";
import { ago } from "@/lib/format";
import { TIER_META, TIERS } from "@/lib/pipeline";
import TrackerTag from "@/components/TrackerTag";
import { useResizableColumns, ResTh } from "@/components/ResizableTable";
import { useCoWorkQueue } from "@/components/CoWorkQueueProvider";
import Section from "@/components/Section";
import type { Tier } from "@/lib/types";

// Scan config (ATS, fetch method, recipe, endpoint) moved into a per-row expander — it's
// CoWork-curated and rarely edited, so the default table stays compact.
const WL_COLS = ["company", "tier", "titles", "location", "scraped", "pipeline", "actions"];
const WL_DEFAULTS = { company: 170, tier: 100, titles: 200, location: 150, scraped: 110, pipeline: 130, actions: 60 };

// "Scrape watchlist" refreshes companies last scraped more than this many days ago (or never).
const STALE_DAYS = 3;
const SCRAPE_HELP =
  `Queues a watchlist-scan job for each watchlisted company last scraped more than ${STALE_DAYS} days ago (or never). ` +
  `CoWork picks them up from the queue — fetches each board, glances new postings for fit, and updates “Last scraped”. Run your CoWork queue to process them.`;
const isStale = (lastScrapedAt: string | null): boolean =>
  !lastScrapedAt || Date.now() - new Date(lastScrapedAt).getTime() > STALE_DAYS * 86_400_000;

// One watchlisted company's metadata + scrape config (from GET /api/watchlist).
type Target = {
  id: number;
  name: string;
  tier: Tier;
  ats: string | null;
  fetchMethod: string | null;
  fetchRecipe: string | null;
  slug: string | null;
  endpoint: string | null;
  careersUrl: string | null;
  notes: string | null;
  titles: string[] | null;
  location: string | null;
  lastScrapedAt: string | null;
};

// Pipeline rollup for a company (discovered/applied/total), keyed by company name.
export type TargetCounts = { discovered: number; applied: number; total: number; items: { role: string; status: string; date?: string; appliedDate?: string; interviewed?: boolean }[] };

type SortDir = "asc" | "desc";
const WL_UNSORTABLE = new Set(["actions"]);

// Sort key for a watchlist row, per column. Tier orders by its rank in TIERS (tier1 → tier3);
// pipeline by tracked count; the rest lexically. Nulls fall to the empty-string / 0 end.
function wlSortVal(t: Target, key: string, counts: Map<string, TargetCounts>): string | number {
  switch (key) {
    case "company": return t.name.toLowerCase();
    case "tier": return TIERS.indexOf(t.tier);
    case "titles": return (t.titles ?? []).join(", ").toLowerCase();
    case "location": return (t.location ?? "").toLowerCase();
    case "scraped": return t.lastScrapedAt ?? "";
    case "pipeline": return counts.get(t.name)?.total ?? 0;
    default: return "";
  }
}

// Numbers numerically, everything else lexicographically, scaled by direction (mirrors Pipeline).
function wlCmp(a: string | number, b: string | number, dir: SortDir): number {
  const d = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return dir === "asc" ? d : -d;
}

export default function TargetsTable({
  counts,
  onSelect,
}: {
  counts: Map<string, TargetCounts>;
  onSelect: (company: string) => void;
}) {
  const { add, jobs, bump } = useCoWorkQueue();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set()); // rows showing their scan config
  const toggleExpand = (id: number) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [undoName, setUndoName] = useState<string | null>(null); // last removed → offer Undo
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Add-to-watchlist box. We don't flip the flag here — adding a bare record makes the scan return
  // `unsupported` (no fetch method). Instead we queue a `watchlist-add` CoWork job per company;
  // CoWork researches fetch method + target titles and calls upsertCompanies → addToWatchlist
  // itself (see watchlist-add.md). The new rows appear here once that job lands. Leveling is fetched
  // separately/lazily from the fit view's Lvl column — it's the slow part, off this critical path.
  const [addInput, setAddInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [queuedMsg, setQueuedMsg] = useState<{ queued: string[]; skipped: string[] } | null>(null);
  const queuedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Scrape watchlist" — mechanical board fetch for stale companies (POST /api/scan { staleDays }).
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);
  const scrapeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-row "Scan now" — names with an in-flight single-company queue request (drives the spinner).
  const [scanningRows, setScanningRows] = useState<Set<string>>(new Set());
  // Click a header: asc → desc → off (back to the API's default order). Mirrors the funnel table.
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  const load = useCallback(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((d) => setTargets(d.watchlist ?? []))
      .catch(() => setTargets([]));
  }, []);
  useEffect(() => load(), [load]);
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (queuedTimer.current) clearTimeout(queuedTimer.current);
    if (scrapeTimer.current) clearTimeout(scrapeTimer.current);
  }, []);

  // "Scrape watchlist" — QUEUE a watchlist-scan job per stale company (>3 days) for CoWork to claim
  // and process through the normal queue (scanCompany + glance + close). No longer an inline app scan.
  const scrape = useCallback(async () => {
    setScraping(true);
    setScrapeMsg(null);
    try {
      const r = await fetch("/api/scan/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ staleDays: STALE_DAYS }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const { queued = 0, skipped = 0 } = d as { queued: number; skipped: number };
      setScrapeMsg(
        queued === 0
          ? skipped > 0
            ? `Already queued — ${skipped} stale compan${skipped === 1 ? "y is" : "ies are"} waiting in the CoWork queue.`
            : "Nothing stale — every watchlisted company was scraped within the last 3 days."
          : `Queued ${queued} compan${queued === 1 ? "y" : "ies"} for CoWork to scan${skipped ? ` (${skipped} already queued)` : ""} — run your CoWork queue.`
      );
      bump(); // refresh the floating queue so the new jobs show
    } catch {
      setScrapeMsg("Couldn’t queue the scan — is the app running?");
    } finally {
      setScraping(false);
      load();
      if (scrapeTimer.current) clearTimeout(scrapeTimer.current);
      scrapeTimer.current = setTimeout(() => setScrapeMsg(null), 12000);
    }
  }, [load, bump]);

  // Per-row "Scan now" — QUEUE a watchlist-scan job for just this one company (POST /api/scan/queue
  // { company }), ignoring the 3-day staleness gate. Same CoWork-queue path as "Scrape watchlist".
  const scanOne = useCallback(async (name: string) => {
    setScanningRows((s) => new Set(s).add(name));
    try {
      const r = await fetch("/api/scan/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company: name }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setScrapeMsg(
        d.status === "in-flight"
          ? `${name} is already queued — it’s waiting in the CoWork queue.`
          : `Queued ${name} for CoWork to scan — run your CoWork queue.`
      );
      bump(); // refresh the floating queue so the new job shows
    } catch {
      setScrapeMsg(`Couldn’t queue ${name} — is the app running?`);
    } finally {
      setScanningRows((s) => { const n = new Set(s); n.delete(name); return n; });
      load();
      if (scrapeTimer.current) clearTimeout(scrapeTimer.current);
      scrapeTimer.current = setTimeout(() => setScrapeMsg(null), 12000);
    }
  }, [load, bump]);

  // Queue a watchlist-add CoWork job per company in the box. Accepts a comma- or newline-separated
  // list, dedups, and skips anything already watchlisted or already queued (so re-pasting is safe).
  const queueAdd = useCallback(async () => {
    const names = addInput.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const onList = new Set((targets ?? []).map((t) => t.name.toLowerCase()));
    const inQueue = new Set(
      jobs.filter((j) => j.type === "watchlist-add").map((j) => String(j.params?.company ?? "").toLowerCase()).filter(Boolean)
    );
    const seen = new Set<string>();
    const queued: string[] = [];
    const skipped: string[] = [];
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (onList.has(key) || inQueue.has(key)) skipped.push(name);
      else queued.push(name);
    }
    setAdding(true);
    try {
      await Promise.all(queued.map((company) => add({ type: "watchlist-add", params: { company } })));
    } finally {
      setAdding(false);
    }
    setAddInput("");
    setQueuedMsg({ queued, skipped });
    if (queuedTimer.current) clearTimeout(queuedTimer.current);
    queuedTimer.current = setTimeout(() => setQueuedMsg(null), 10000);
  }, [addInput, targets, jobs, add]);

  // Inline-edit a company's config (matched by name; only the fields passed change).
  const update = useCallback(
    async (name: string, patch: Record<string, unknown>) => {
      await fetch("/api/companies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companies: [{ name, ...patch }] }) });
      load();
    },
    [load]
  );

  const setWatch = useCallback(async (name: string, on: boolean) => {
    await (on
      ? fetch("/api/watchlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ company: name }),
        })
      : fetch(`/api/watchlist?company=${encodeURIComponent(name)}`, { method: "DELETE" }));
    load();
  }, [load]);

  // Remove a company from the watchlist (discovery stops scanning it). Tier is untouched.
  // Surfaces an Undo for a few seconds — the × is one click and easy to hit by accident.
  const remove = useCallback(
    async (name: string) => {
      setTargets((ts) => (ts ? ts.filter((t) => t.name !== name) : ts));
      await setWatch(name, false);
      setUndoName(name);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndoName(null), 8000);
    },
    [setWatch]
  );

  const undo = useCallback(async () => {
    if (!undoName) return;
    const name = undoName;
    setUndoName(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    await setWatch(name, true);
  }, [undoName, setWatch]);

  const { widths, onMouseDown, total } = useResizableColumns(WL_DEFAULTS, "watchlist-cols");

  // free-text filter across name / tier / location / titles / ats / fetch method
  const q = filter.trim().toLowerCase();
  const filtered = (targets ?? []).filter(
    (t) => !q || [t.name, t.tier, t.location, (t.titles ?? []).join(" "), t.ats, t.fetchMethod].filter(Boolean).join(" ").toLowerCase().includes(q)
  );
  const shown = sort
    ? [...filtered].sort((a, b) => wlCmp(wlSortVal(a, sort.key, counts), wlSortVal(b, sort.key, counts), sort.dir))
    : filtered;

  const staleCount = (targets ?? []).filter((t) => isStale(t.lastScrapedAt)).length;
  const scrapeAction = targets && targets.length > 0 ? (
    <>
      <button
        onClick={scrape}
        disabled={scraping || staleCount === 0}
        title={staleCount === 0 ? `All watchlisted companies were scraped within the last ${STALE_DAYS} days` : `Queue ${staleCount} ${staleCount === 1 ? "company" : "companies"} not scraped in over ${STALE_DAYS} days for CoWork to scan`}
        className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-[13px] font-medium text-zinc-200 ring-1 ring-inset ring-zinc-700 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {scraping ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        {scraping ? "Queuing…" : `Scrape watchlist${staleCount ? ` (${staleCount})` : ""}`}
      </button>
      <span title={SCRAPE_HELP} className="cursor-help text-zinc-600 transition hover:text-zinc-300">
        <HelpCircle size={15} />
      </span>
    </>
  ) : undefined;

  return (
    <Section
      title="Watchlist"
      icon={<Radar size={15} className="text-sky-300" />}
      accent="sky"
      subtitle={`${targets?.length ?? ""}${targets ? " " : ""}companies CoWork auto-scans for new postings`}
      right={scrapeAction}
      storageKey="watchlist"
    >
      <form
        onSubmit={(e) => { e.preventDefault(); queueAdd(); }}
        className="mb-3 flex items-center gap-2"
      >
        <div className="relative max-w-md flex-1">
          <Plus size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            placeholder="Add companies — CoWork researches & configures each"
            title="Comma-separated for several. CoWork finds the ATS/board and target titles, then adds it to the watchlist. (Leveling is fetched later from the fit view.)"
            className="w-full rounded-md bg-zinc-900 py-1.5 pl-8 pr-2.5 text-[13px] text-zinc-200 outline-none ring-1 ring-inset ring-zinc-800 transition placeholder:text-zinc-600 hover:ring-zinc-700 focus:ring-zinc-600"
          />
        </div>
        <button
          type="submit"
          disabled={adding || !addInput.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/15 px-3 py-1.5 text-[13px] font-medium text-sky-300 ring-1 ring-inset ring-sky-500/30 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {adding ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Queue research
        </button>
      </form>

      {queuedMsg && (
        <div className="mb-3 rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] text-zinc-400 ring-1 ring-inset ring-zinc-800">
          {queuedMsg.queued.length > 0 && (
            <span>
              Queued research for <span className="text-zinc-200">{queuedMsg.queued.join(", ")}</span> — CoWork will
              configure and watchlist {queuedMsg.queued.length === 1 ? "it" : "them"}. Track it in the queue.
            </span>
          )}
          {queuedMsg.queued.length === 0 && queuedMsg.skipped.length > 0 && (
            <span>Already watchlisted or queued: <span className="text-zinc-300">{queuedMsg.skipped.join(", ")}</span>.</span>
          )}
          {queuedMsg.queued.length > 0 && queuedMsg.skipped.length > 0 && (
            <span className="ml-1 text-zinc-600">Skipped {queuedMsg.skipped.join(", ")} (already watchlisted or queued).</span>
          )}
        </div>
      )}

      {scrapeMsg && (
        <div className="mb-3 rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] text-zinc-400 ring-1 ring-inset ring-zinc-800">
          {scrapeMsg}
        </div>
      )}

      {undoName && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] text-zinc-400 ring-1 ring-inset ring-zinc-800">
          <span>Removed <span className="text-zinc-200">{undoName}</span> from the watchlist.</span>
          <button
            onClick={undo}
            className="ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium text-emerald-300 transition hover:bg-emerald-500/15"
          >
            <Undo2 size={11} /> Undo
          </button>
        </div>
      )}

      {targets && targets.length > 0 && (
        <div className="mb-3 flex items-center">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter…"
            className="w-64 rounded-md bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-300 outline-none ring-1 ring-inset ring-zinc-800 transition placeholder:text-zinc-600 hover:ring-zinc-700 focus:ring-zinc-600"
          />
          {filter && (
            <button onClick={() => setFilter("")} title="Clear filter" className="ml-1 text-zinc-500 hover:text-zinc-300">
              <X size={12} />
            </button>
          )}
        </div>
      )}

      <div className="max-h-96 overflow-auto">
        {targets === null ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-zinc-500">
            <Loader2 size={13} className="animate-spin" /> loading watchlist…
          </div>
        ) : targets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800/80 py-6 text-center text-[13px] text-zinc-600">
            nothing on the watchlist — add a company above, or open one and hit “Watch”
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800/80 py-6 text-center text-[13px] text-zinc-600">
            no matches for “{filter}”
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-left" style={{ tableLayout: "fixed", minWidth: total(WL_COLS) }}>
            <thead>
              <tr>
                {([["company", "Company"], ["tier", "Tier"], ["titles", "Target titles"], ["location", "Location"], ["scraped", "Last scraped"], ["pipeline", "Pipeline"]] as const).map(([key, label]) => (
                  <ResTh
                    key={key}
                    width={widths[key]}
                    onResize={onMouseDown(key)}
                    onSort={WL_UNSORTABLE.has(key) ? undefined : () => toggleSort(key)}
                    sortDir={sort?.key === key ? sort.dir : null}
                  >
                    {label}
                  </ResTh>
                ))}
                <ResTh width={widths.actions}> </ResTh>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const c = counts.get(t.name);
                const link = t.careersUrl || t.endpoint || undefined;
                const tm = TIER_META[t.tier];
                return (
                  <Fragment key={t.id}>
                  <tr
                    onClick={() => onSelect(t.name)}
                    className="group cursor-pointer text-[13px] text-zinc-300 transition hover:bg-zinc-900/50"
                  >
                    <Td>
                      <div className="flex items-start gap-1.5">
                        <button onClick={(e) => { e.stopPropagation(); toggleExpand(t.id); }} title="Scan config" className="mt-0.5 shrink-0 text-zinc-600 transition hover:text-zinc-300">
                          <ChevronRight size={13} className={`transition-transform duration-200 ${expanded.has(t.id) ? "rotate-90" : ""}`} />
                        </button>
                        <div className="min-w-0">
                          <span className="block truncate font-medium text-zinc-100" title={t.name}>{t.name}{t.notes && <span className="ml-1.5 text-[12px] text-zinc-600" title={t.notes}>ⓘ</span>}</span>
                          {c && <TrackerTag items={c.items} />}
                        </div>
                      </div>
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tm.dot}`} />
                        <select
                          value={t.tier}
                          onChange={(e) => update(t.name, { tier: e.target.value })}
                          className="rounded bg-transparent text-[13px] text-zinc-400 outline-none transition hover:bg-zinc-800/50 focus:bg-zinc-900"
                        >
                          {TIERS.map((tr) => (
                            <option key={tr} value={tr} className="bg-zinc-900 text-zinc-200">{TIER_META[tr].label}</option>
                          ))}
                        </select>
                      </span>
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <EditField value={t.titles?.join(", ") ?? ""} placeholder="any title" onCommit={(v) => update(t.name, { titles: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <EditField value={t.location ?? ""} placeholder="any location" onCommit={(v) => update(t.name, { location: v.trim() || null })} />
                    </Td>
                    <Td className="text-zinc-400 tabular-nums">{t.lastScrapedAt ? ago(t.lastScrapedAt) : "—"}</Td>
                    <Td className="tabular-nums">
                      {c && c.total > 0 ? (
                        <span className="text-zinc-400">
                          {c.discovered > 0 && <span className="text-zinc-300">{c.discovered} disc</span>}
                          {c.discovered > 0 && c.applied > 0 && " · "}
                          {c.applied > 0 && <span className="text-sky-300">{c.applied} app</span>}
                          {c.discovered === 0 && c.applied === 0 && `${c.total} tracked`}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); scanOne(t.name); }}
                          disabled={scanningRows.has(t.name)}
                          title={`Scan ${t.name}'s board now (queues a CoWork scan)`}
                          className="rounded p-0.5 text-zinc-700 opacity-0 transition hover:bg-zinc-800 hover:text-sky-300 group-hover:opacity-100 disabled:opacity-40"
                        >
                          {scanningRows.has(t.name) ? <Loader2 size={12} className="animate-spin" /> : <Telescope size={12} />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); remove(t.name); }}
                          title="Remove from watchlist"
                          className="rounded p-0.5 text-zinc-700 opacity-0 transition hover:bg-zinc-800 hover:text-rose-300 group-hover:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                  {expanded.has(t.id) && (
                    <tr className="bg-zinc-900/20" onClick={(e) => e.stopPropagation()}>
                      <Td colSpan={WL_COLS.length}>
                        <div className="grid gap-x-6 gap-y-3 px-1 py-1.5 md:grid-cols-2">
                          <div>
                            <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">Fetch method</p>
                            <span className="inline-flex items-center gap-1 text-[13px] text-zinc-300">
                              {t.fetchMethod || "—"}
                              {link && <a href={link} target="_blank" rel="noopener noreferrer" title={t.endpoint || t.careersUrl || ""} className="text-zinc-600 hover:text-sky-400"><ExternalLink size={11} /></a>}
                            </span>
                          </div>
                          <div>
                            <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">ATS</p>
                            <span className="text-[13px] text-zinc-400">{t.ats || "—"}</span>
                          </div>
                          <div className="md:col-span-2">
                            <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">Fetch recipe</p>
                            <textarea
                              key={t.fetchRecipe ?? ""}
                              defaultValue={t.fetchRecipe ?? ""}
                              placeholder="how to read this board (filters, exclusions, where level comes from)…"
                              rows={2}
                              onBlur={(e) => { if (e.target.value !== (t.fetchRecipe ?? "")) update(t.name, { fetchRecipe: e.target.value.trim() || null }); }}
                              onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.value = t.fetchRecipe ?? ""; e.currentTarget.blur(); } }}
                              className="w-full resize-y rounded bg-zinc-900/60 px-2 py-1 text-[13px] leading-snug text-zinc-300 outline-none ring-1 ring-inset ring-zinc-800 transition placeholder:text-zinc-600 focus:ring-zinc-600"
                            />
                          </div>
                        </div>
                      </Td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Section>
  );
}

function Td({ children, className, onClick, colSpan }: { children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void; colSpan?: number }) {
  return <td colSpan={colSpan} onClick={onClick} className={`border-b border-zinc-900 px-2.5 py-1.5 align-top first:pl-0 ${className ?? ""}`}>{children}</td>;
}

// Inline-editable cell: uncontrolled, commits on blur/Enter, reverts on Escape. Stops click
// from bubbling to the row (which would re-filter Scan Review).
function EditField({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <input
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { e.currentTarget.value = value; e.currentTarget.blur(); }
      }}
      className="w-full min-w-[80px] rounded bg-transparent px-1 text-[13px] text-zinc-300 outline-none transition placeholder:text-zinc-600 hover:bg-zinc-800/50 focus:bg-zinc-900 focus:ring-1 focus:ring-inset focus:ring-zinc-600"
    />
  );
}
