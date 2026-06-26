"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Bot, ChevronRight, ExternalLink, GitCompareArrows, Loader2, Mail, MessageSquare, MoreHorizontal, Pin, Settings, X } from "lucide-react";
import PopoverPanel, { anchorFrom } from "@/components/Popover";
import { columnOf, fitColor, statusesForColumn, STATUS_CHIP, STATUS_LABEL, type ColumnId } from "@/lib/pipeline";
import TrackerTag from "@/components/TrackerTag";
import { LevelChip } from "@/components/LevelLadder";
import { DEFAULT_LEVELING_REF, hasLadder, type Leveling, type LevelingRef } from "@/lib/leveling";
import { useApplications } from "@/hooks/useApplications";
import { useCoWorkQueue } from "@/components/CoWorkQueueProvider";
import ProfilePanel from "@/components/ProfilePanel";
import LevelingRefPanel from "@/components/LevelingRefPanel";
import TargetsTable, { type TargetCounts } from "@/components/board/TargetsTable";
import CompanyDrawer from "@/components/board/CompanyDrawer";
import ResumeDiffModal from "@/components/ResumeDiff";
import { tailorDiffFor, lastTailoredAt } from "@/lib/jobs/redolog";
import { aggregateCompanies, type CompanyAgg } from "@/lib/board";
import { ResTh } from "@/components/ResizableTable";
import { DISCOVERY_SPINE as SPINE, DISCOVERY_ARCHIVE as ARCHIVE, stepCount, type SpineStep } from "@/lib/discovery";
import type { Comment, Posting, FitAssessment, RedoTurn, Status } from "@/lib/types";
import { JobStatusChip, type WorkStatus } from "@/components/JobStatus";
import { ago } from "@/lib/format";

// Display date for a tracked job — prefer the application date, else last-updated/discovered.
function trackerDate(p: { appliedDate?: string; updatedAt?: string; discoveredAt?: string }): string | undefined {
  return p.appliedDate ?? p.updatedAt ?? p.discoveredAt;
}

const FUNNEL_LABEL: Record<string, string> = { company: "Company", title: "Title", location: "Location", fit: "Fit", lvl: "Lvl", comment: "Note", gaps: "Gaps", resume: "Resume", status: "Status", applied: "Applied", updated: "Last updated", act: "Action" };
// Per-column width bounds (px). The table is auto-layout, so columns flex with their content but
// stay within [min, max] — short text shrinks the column, long text wraps instead of overflowing.
const COL_BOUNDS: Record<string, { min: number; max: number }> = {
  company: { min: 130, max: 190 }, title: { min: 110, max: 230 }, location: { min: 100, max: 170 },
  lvl: { min: 44, max: 56 }, fit: { min: 260, max: 460 }, gaps: { min: 150, max: 300 },
  resume: { min: 90, max: 150 }, comment: { min: 44, max: 58 }, status: { min: 90, max: 130 }, applied: { min: 90, max: 120 },
  updated: { min: 90, max: 130 }, act: { min: 130, max: 170 },
};
const colBound = (k: string) => COL_BOUNDS[k] ?? { min: 90, max: 240 };
const colStyle = (k: string): React.CSSProperties => ({ minWidth: colBound(k).min, maxWidth: colBound(k).max });
// Per-column td className (alignment / tone).
const COL_CLASS: Record<string, string> = {
  company: "text-zinc-400", lvl: "text-center", location: "text-zinc-400",
  resume: "text-[13px] text-zinc-500", applied: "tabular-nums text-zinc-500", updated: "tabular-nums text-zinc-500",
};

// The whole pipeline IS the discovery spine (defined in lib/discovery.ts), drawn as a connected
// arrow ribbon, left → right. The leading steps span candidate scan-store states (Fit Assessment =
// matched + review + fit_queue + assessed; Tailor Resume = tailoring + tailored; Apply Later = apply_later); the last
// three are TRACKER steps that read `postings` (the applications table) filtered by lib/pipeline columnOf, and
// a row click opens the company drawer to manage it.
type ActionKey = "queue-fit" | "discard" | "tailor" | "apply" | "apply-later";
// Tracker steps map a spine key → the pipeline column its postings live in (lib/pipeline columnOf).
const STEP_COLUMN: Record<string, ColumnId> = { applied: "applied", interview: "interviewing", closed: "closed" };
const isTrackerStep = (key: string) => key in STEP_COLUMN;
// Every pipeline step shows the SAME columns, so a row reads consistently across stages (you always
// see fit + résumé, status, etc., wherever you are). Cells render "—" where a column doesn't apply
// to a given row. Order: the four frozen leading columns, then fit/gaps/résumé (the artifacts you
// most want everywhere), then tracker fields, then the per-row action.
const UNIFIED_COLS = ["company", "title", "location", "lvl", "act", "comment", "fit", "gaps", "resume", "status", "applied", "updated"];

// The leading columns are FROZEN (sticky-left) while the rest scroll horizontally — including the
// per-row action, kept pinned right after Lvl so the quick actions are always reachable. Sticky
// cells need a concrete `left`, so the frozen columns get fixed widths and we sum them for each offset.
const FROZEN_COLS = ["company", "title", "location", "lvl", "act"] as const;
const FROZEN_W: Record<string, number> = { company: 190, title: 210, location: 150, lvl: 60, act: 170 };
const LAST_FROZEN = FROZEN_COLS[FROZEN_COLS.length - 1];
const isFrozen = (k: string) => k in FROZEN_W;
const frozenLeft = (k: string): number => {
  let x = 0;
  for (const f of FROZEN_COLS) { if (f === k) return x; x += FROZEN_W[f]; }
  return 0;
};
// Sticky style for a frozen cell (zIndex 20 for the header, 10 for body cells so the header wins).
const frozenStyle = (k: string, z: number): React.CSSProperties => ({
  position: "sticky", left: frozenLeft(k), width: FROZEN_W[k], minWidth: FROZEN_W[k], maxWidth: FROZEN_W[k], zIndex: z,
});
// Opaque, theme-aware background so scrolled cells slide *under* the frozen column cleanly; the last
// frozen column carries a divider. Body cells track row-hover via group-hover.
const frozenCls = (k: string, body: boolean): string =>
  `bg-[var(--background)] ${body ? "group-hover:bg-zinc-900" : ""} ${k === LAST_FROZEN ? "border-r border-zinc-800/80" : ""}`;
// Header cells stick on BOTH axes — top (so the column labels stay put as rows scroll) and, for the
// frozen leading columns, left. They sit above the body cells (z 30 frozen / 25 the rest) and carry
// an opaque bg (frozenCls / the className below) so rows slide cleanly underneath.
const headerStyle = (k: string): React.CSSProperties =>
  isFrozen(k) ? { ...frozenStyle(k, 30), top: 0 } : { position: "sticky", top: 0, zIndex: 25 };
// Row actions per candidate state, PRIMARY FIRST — the first is the quick button, the rest fold
// into a ⋯ menu. A queued row (fit_queue / tailoring) only offers Discard until CoWork writes back.
const ACTIONS_BY_STATE: Record<string, ActionKey[]> = {
  matched: ["queue-fit", "discard"], // freshly scraped, awaiting glance — same triage as `review`
  review: ["queue-fit", "discard"],
  fit_queue: ["discard"],
  assessed: ["tailor", "apply", "apply-later", "discard"],
  apply_later: ["tailor", "apply", "discard"],
  tailoring: ["apply", "discard"],
  tailored: ["apply", "apply-later", "discard"],
  dismissed: ["queue-fit"],
  filtered: ["queue-fit", "discard"],
};
// Text color per tone — for the ⋯ menu items (the inline Btn uses its own fuller styling).
const TONE_TEXT: Record<string, string> = {
  emerald: "text-emerald-300", sky: "text-sky-300", amber: "text-amber-300", rose: "text-rose-300",
};

// Action button presentation, looked up from a step's `actions` list. A Bot icon = CoWork does it
// (the hand-off); a trailing → (`arrow`) = the action advances the row to the next stage. Holds
// (Apply later) and drops (Discard) carry neither.
const ACTION_META: Record<ActionKey, { label: string; tone: "emerald" | "rose" | "sky" | "amber"; title: string; icon?: typeof Bot; arrow?: boolean }> = {
  "queue-fit": { label: "Assess fit", tone: "sky", title: "Hand off to CoWork — assess fit → next stage", icon: Bot, arrow: true },
  tailor: { label: "Tailor", tone: "sky", title: "Hand off to CoWork — tailor a resume → next stage", icon: Bot, arrow: true },
  "apply-later": { label: "Apply later", tone: "amber", title: "Save to the Apply Later list" },
  apply: { label: "Mark applied", tone: "emerald", title: "Mark applied → moves to the tracker", arrow: true },
  discard: { label: "Discard", tone: "rose", title: "Discard — won't resurface" },
};

// "Move to…" jumps a posting straight to any stage, OUT of sequence — surfaced in the ⋯ menu on every
// row (e.g. send a fresh match straight to Applied). Each target is a stage's canonical landing
// state; a row's own stage is hidden from its menu (see STATE_STAGE below). One PATCH to the unified
// posting endpoint handles the move in any stage; the matching side effects mirror the drawer's
// selector (stamp the applied date, flag interviewed).
const MOVE_TARGETS: { label: string; state: string; stage: string }[] = [
  { label: "Fit assessment", state: "review", stage: "fit" },
  { label: "Tailor resume", state: "tailoring", stage: "tailor" },
  { label: "Apply later", state: "apply_later", stage: "later" },
  { label: "Applied", state: "applied", stage: "applied" },
  { label: "Interviewing", state: "interview", stage: "interview" },
  { label: "Rejected", state: "rejected", stage: "closed" },
  { label: "Discarded", state: "dismissed", stage: "dismissed" },
];

type Scanned = {
  id: number; company: string; title: string; location: string | null; url: string | null;
  department: string | null; verdict: string; reason: string | null; state: string; scannedAt: string; updatedAt?: string | null;
  fitScore?: number | null; fit?: FitAssessment; resumeDir?: string | null; leveling?: Leveling; redoLog?: RedoTurn[]; comments?: Comment[]; pinned?: boolean;
};

// One row model for the table, whichever source a step reads (candidate scan store or the tracker).
// `state` is the row's real candidate state — drives its per-row actions within a grouped stage.
// `posting` is set only for tracker rows — it's the full record the drawer manages on row click.
type FRow = {
  id: number; state: string; company: string; title: string; url: string | null; location: string | null;
  department?: string | null; fitScore: number | null; fit?: FitAssessment; resumeDir?: string | null;
  leveling?: Leveling; verdict?: string; reason?: string | null; redoLog?: RedoTurn[]; comments?: Comment[];
  status?: Posting["status"]; appliedDate?: string; updatedAt?: string; discoveredAt?: string; posting?: Posting;
  // When this row entered its current stage (last state change, else first-scan/discovery) — drives the NEW tag.
  addedAt?: string | null;
  // When the posting was first scanned/discovered — drives the "scanned … ago" line in the company cell.
  scannedAt?: string | null;
  pinned?: boolean; // user-pinned → floats to the top of its stage table
};
const fromScanned = (p: Scanned): FRow => ({
  id: p.id, state: p.state, company: p.company, title: p.title, url: p.url, location: p.location, department: p.department,
  fitScore: p.fitScore ?? null, fit: p.fit, resumeDir: p.resumeDir, leveling: p.leveling, verdict: p.verdict, reason: p.reason, redoLog: p.redoLog, comments: p.comments,
  addedAt: p.updatedAt ?? p.scannedAt, scannedAt: p.scannedAt, pinned: p.pinned ?? false,
});
const fromPosting = (p: Posting): FRow => ({
  id: Number(p.id), state: p.status, company: p.company, title: p.role, url: p.url ?? null, location: p.location ?? null,
  fitScore: p.fitScore ?? null, fit: p.fit, resumeDir: p.resumeDir ?? null, leveling: p.leveling, redoLog: p.redoLog, comments: p.comments,
  status: p.status, appliedDate: p.appliedDate, updatedAt: p.updatedAt, discoveredAt: p.discoveredAt, posting: p,
  addedAt: p.updatedAt ?? p.discoveredAt ?? p.appliedDate, scannedAt: p.discoveredAt ?? null, pinned: p.pinned ?? false,
});

// "New" = entered its current stage within the last day (today or yesterday). updatedAt is
// day-granular (set on every state move), scannedAt/discoveredAt are full ISO — normalize both to a
// calendar-day diff so the tag reads the same regardless of source. Drives the NEW badge + top sort.
const NEW_WINDOW_DAYS = 1;
function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(ms) ? null : Math.floor((Date.now() - ms) / 86_400_000);
}
const isNewRow = (p: FRow): boolean => {
  const d = daysSince(p.addedAt);
  return d !== null && d <= NEW_WINDOW_DAYS;
};

// Compact relative age — m / h / d / mo ago — for the "scanned … ago" line in the company cell.
// Handles both full ISO (scan store) and date-only (discoveredAt) by normalizing to UTC midnight.
function relAge(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(ms)) return null;
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}

// Short, locale-independent day label (e.g. "Jun 26") — UTC so server/client render identically (no
// hydration mismatch). Used for the "last tailored" line under the résumé link.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDay(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// Friendly label for a résumé slug (e.g. "databricks-senior-123/v2" → "tailored-v2"). The full slug
// stays in the cell's title for reference; the version suffix is the only part worth showing inline.
function resumeLabel(dir: string): string {
  const m = dir.match(/v(\d+)\s*$/i);
  return m ? `tailored-v${m[1]}` : "tailored";
}

type SortDir = "asc" | "desc";
type Sort = { key: string; dir: SortDir };
// Columns that carry no orderable value — clicking their header does nothing.
const UNSORTABLE = new Set(["act"]);

// A company's level ceiling on the normalized 1–10 scale — the top of its highest band. Used to
// order the Lvl column; no ladder sinks to the bottom.
function levelCeil(l?: Leveling | null): number {
  if (!hasLadder(l)) return -Infinity;
  return Math.max(...Object.values(l.ladder!).map(([, hi]) => hi));
}

// Sort key for a row, per column — one function over the unified FRow (covers both sources).
function sortVal(p: FRow, key: string): string | number {
  switch (key) {
    case "company": return p.company.toLowerCase();
    case "title": return p.title.toLowerCase();
    case "lvl": return levelCeil(p.leveling);
    case "fit": return p.fitScore ?? -Infinity;
    case "location": return (p.location ?? "").toLowerCase();
    case "gaps": return p.fit?.gaps?.length ?? 0;
    case "resume": return (p.resumeDir ?? "").toLowerCase();
    case "status": return p.status ?? "";
    case "applied": return p.appliedDate ?? "";
    case "updated": return p.updatedAt ?? "";
    default: return "";
  }
}
// Display/sort date for a tracker row — application date, else last-updated/discovered.
const rowDate = (p: FRow): string => p.appliedDate ?? p.updatedAt ?? p.discoveredAt ?? "";

// Gmail deep-links. Prefer a DIRECT link to the exact thread when inbox-sync captured its id; else
// fall back to a stage-specific search that lands on the relevant thread(s).
const gmailThread = (id: string) => `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}`;
const gmailSearch = (q: string) => `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;
// A link for one stage: the direct thread if `id` is set, otherwise the search query. `direct` drives
// the icon/tooltip so you can tell an exact-email link from a search.
const stageLink = (label: string, id: string | undefined, query: string): { label: string; url: string; direct: boolean } =>
  id ? { label, url: gmailThread(id), direct: true } : { label, url: gmailSearch(query), direct: false };
// Stage-specific "find the email" links for a tracker row's status — applied → confirmation, closed →
// rejection, interview → one link per round (kind-specific), offer → offer. Empty for pre-apply rows.
function stageEmailLinks(p: FRow): { label: string; url: string; direct: boolean }[] {
  const base = `${p.company} ${p.title}`.trim();
  const refs = p.posting?.emailRefs;
  switch (p.status) {
    case "applied":
      return [stageLink("confirmation", refs?.applied, `${base} (application OR applied OR "thank you for applying" OR received)`)];
    case "interview": {
      const rounds = p.posting?.interviews ?? [];
      if (rounds.length)
        return rounds.map((r, i) =>
          stageLink(
            r.kind ? String(r.kind) : `round ${r.round ?? i + 1}`,
            r.emailId,
            `${base} (${r.kind ?? "interview"} OR interview OR schedule OR invitation OR availability)`,
          ),
        );
      return [stageLink("interview", refs?.interview, `${base} (interview OR schedule OR invitation OR availability)`)];
    }
    case "offer":
      return [stageLink("offer", refs?.offer, `${base} (offer OR congratulations OR "pleased to")`)];
    case "rejected":
      return [stageLink("rejection", refs?.rejected, `${base} (unfortunately OR "not moving forward" OR "other candidates" OR regret OR decided)`)];
    default:
      return [];
  }
}

// Default order for the Fit Assessment tab: un-queued review matches first (your triage), then
// queued (waiting on CoWork), then assessed by score (highest first). Ascending sort.
const fitRank = (p: FRow): number =>
  p.fitScore != null ? 1000 - p.fitScore : p.state === "review" || p.state === "matched" ? 0 : 1;

// Stable comparator: numbers numerically, everything else lexicographically, scaled by direction.
function cmp(a: string | number, b: string | number, dir: SortDir): number {
  const d = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return dir === "asc" ? d : -d;
}

const ALL_STEPS = [...SPINE, ...ARCHIVE];
const stepStates = (key: string): string[] => ALL_STEPS.find((s) => s.key === key)?.states ?? [key];
// Reverse index: a candidate/tracker state → the spine step it lives under. Lets the "Move to" menu
// hide the stage a row already sits in, so the menu only offers real jumps.
const STATE_STAGE: Record<string, string> = {};
for (const s of ALL_STEPS) for (const st of s.states) STATE_STAGE[st] = s.key;

export default function Pipeline() {
  const {
    postings, loading, reload, setStatus, setInterviewed, setCompanyTier,
    setWatchlist, setField, renameCompany, moveJob, deleteJob,
  } = useApplications();
  const { jobs, add, bump, redoNoteFor, isWorking } = useCoWorkQueue();
  // Whether an inbox-sync job is already outstanding (queued or claimed) — one at a time is enough.
  // `syncing` covers the gap between clicking and the queue re-fetch so a fast double-click can't
  // stack two jobs; it clears once the queued job actually shows up.
  const [syncing, setSyncing] = useState(false);
  const inboxSyncQueued = jobs.some((j) => j.type === "inbox-sync");
  useEffect(() => { if (inboxSyncQueued) setSyncing(false); }, [inboxSyncQueued]);
  // A stable signature of the live queue — changes only when a job is added/removed/drained, not on
  // every poll. Deleting a queued fit/tailoring job un-queues its candidate server-side (fit_queue →
  // review, tailoring → assessed), so the funnel must re-read to move that row out of its stage.
  const jobKey = jobs.map((j) => j.id).sort().join(",");

  // Active spine step + its table state. Persisted so a refresh keeps you on the same step (start
  // from the default for a clean SSR/first render, then restore the saved step after mount).
  const [tab, setTab] = useState("review");
  useEffect(() => {
    try {
      const v = localStorage.getItem("pipeline:step");
      if (v && ALL_STEPS.some((s) => s.key === v)) setTab(v);
    } catch { /* ignore */ }
  }, []);
  const pickStep = (key: string) => {
    setTab(key);
    try { localStorage.setItem("pipeline:step", key); } catch { /* ignore */ }
  };
  // Filter tags (committed chips) + the in-progress draft. The effective filter is tags + draft (OR),
  // applied across ALL stages: it filters the active table AND drives the spine's filtered counts.
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const addTag = (t: string) => { const v = t.trim(); if (v && !tags.includes(v)) setTags((ts) => [...ts, v]); setDraft(""); };
  const removeTag = (t: string) => setTags((ts) => ts.filter((x) => x !== t));
  const clearFilter = () => { setTags([]); setDraft(""); };
  // Effective filter terms (committed tags + the live draft), lowercased — drives the table filter
  // AND the spine's filtered counts. `termKey` is a stable dep string for effects.
  const terms = useMemo(() => [...tags, draft.trim()].filter(Boolean).map((t) => t.toLowerCase()), [tags, draft]);
  const termKey = terms.join("");
  const filtering = terms.length > 0;
  const [scanRows, setScanRows] = useState<Scanned[] | null>(null);
  const [bucketCounts, setBucketCounts] = useState<Record<string, number> | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [sort, setSort] = useState<Sort | null>(null);
  const [closedFilter, setClosedFilter] = useState<Status | "all">("all"); // Closed step sub-filter

  // Leveling reference (one fetch) flows to both the editor panel and the funnel's level popover.
  const [levelingRef, setLevelingRef] = useState<LevelingRef | null>(null);

  // Company drawer — the manager for tracker rows (status/tier/interviewed/edit/rename/delete).
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selectJob = (p: Posting) => { setScanPosting(null); setSelectedCompany(p.company); setSelectedJobId(p.id); };
  // A pre-apply candidate (scan-stage row, e.g. tailoring) opened in the editable drawer. Tracker
  // rows come from `postings`; scan rows aren't in that set, so we fetch the full posting by id.
  const [scanPosting, setScanPosting] = useState<Posting | null>(null);
  // Resume diff modal — opened from the Tailor step's resume cell (and the drawer's resume row).
  // Track the row's posting id alongside the slug so the modal can offer "redo with a note".
  const [diffSlug, setDiffSlug] = useState<string | null>(null);
  const [diffPostingId, setDiffPostingId] = useState<string | null>(null);
  const [diffAnnotated, setDiffAnnotated] = useState<RedoTurn["diff"]>(undefined);

  useEffect(() => {
    fetch("/api/leveling-ref").then((r) => r.json()).then((d) => setLevelingRef(d.ref ?? DEFAULT_LEVELING_REF)).catch(() => setLevelingRef(DEFAULT_LEVELING_REF));
  }, []);

  // Optimistic merge + persist the changed slice of the leveling reference.
  const saveRef = (patch: Partial<LevelingRef>) => {
    setLevelingRef((cur) => ({ ...(cur ?? DEFAULT_LEVELING_REF), ...patch }));
    fetch("/api/leveling-ref", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {});
  };

  // Click a header: asc → desc → off. Switching tabs (below) clears it back to the default order.
  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  const isTracker = isTrackerStep(tab);
  const scored = tab === "fit" || tab === "later"; // scored stages show the fit summary + sort by score
  const fcols = UNIFIED_COLS; // every step renders the same columns (first four frozen, rest scroll)

  const loadCounts = useCallback((qTerms: string[]) => {
    const qs = qTerms.length ? `&q=${encodeURIComponent(qTerms.join(","))}` : "";
    fetch(`/api/scanned?counts=1${qs}`).then((r) => r.json()).then((d) => setBucketCounts(d.counts)).catch(() => {});
  }, []);
  // Re-read counts on mount, when the queue set changes (a deleted job un-queues its candidate → it
  // moves stage), and when the filter terms change (so the spine shows filtered per-stage counts).
  // Debounced so typing into the filter doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => loadCounts(terms), 200);
    return () => clearTimeout(id);
  }, [loadCounts, termKey, jobKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRows = useCallback(() => {
    // Tracker steps read `postings`; the Scan Watchlist step shows watchlist + settings (no table).
    if (isTrackerStep(tab) || tab === "review") { setScanRows([]); return; }
    fetch(`/api/scanned?state=${stepStates(tab).join(",")}`).then((r) => r.json()).then((d) => setScanRows(d.postings ?? [])).catch(() => setScanRows([]));
  }, [tab]);
  // Re-read on tab switch AND on `jobKey` change: deleting a queued fit/tailoring job un-queues its
  // candidate server-side (fit_queue → review, tailoring → assessed), so the active step's rows must
  // re-read to drop it — without a manual tab switch.
  useEffect(() => { setScanRows(null); loadRows(); }, [loadRows, jobKey]);
  // Tabs have different columns — a sort key from one needn't exist in the next, so reset.
  useEffect(() => setSort(null), [tab]);

  // Watchlist rollup (discovered/applied/total per company) — derived from the loaded postings.
  const counts = useMemo(() => {
    const m = new Map<string, TargetCounts>();
    for (const p of postings) {
      const c = m.get(p.company) ?? { discovered: 0, applied: 0, total: 0, items: [] };
      c.total++;
      if (p.status === "discovered") c.discovered++;
      if (p.status === "applied") c.applied++;
      c.items.push({ role: p.role, status: p.status, date: trackerDate(p), appliedDate: p.appliedDate, interviewed: p.interviewed });
      m.set(p.company, c);
    }
    return m;
  }, [postings]);

  const matches = (...parts: (string | null | undefined)[]) => {
    if (terms.length === 0) return true;
    const hay = parts.filter(Boolean).join(" ").toLowerCase();
    return terms.some((t) => hay.includes(t));
  };

  // Postings in the active tracker step (before the free-text/closed sub-filter). Closed collapses
  // several outcomes, so it offers a per-status chip filter.
  const trackerBase = isTracker ? postings.filter((p) => columnOf(p) === STEP_COLUMN[tab]) : [];
  const closedPresent = tab === "closed" ? statusesForColumn("closed").filter((s) => trackerBase.some((p) => p.status === s)) : [];
  const effClosed: Status | "all" =
    tab === "closed" && closedFilter !== "all" && trackerBase.some((p) => p.status === closedFilter) ? closedFilter : "all";
  const trackerPostings = effClosed !== "all" ? trackerBase.filter((p) => p.status === effClosed) : trackerBase;

  // The active step's rows, normalized to one model.
  const raw: FRow[] | null = isTracker
    ? trackerPostings.map(fromPosting)
    : scanRows == null ? null : scanRows.map(fromScanned);
  const rows = raw == null ? null : raw
    .filter((p) => matches(p.company, p.title, p.location, p.department, p.reason, p.fit?.summary))
    // Click-to-sort wins; else the per-step default — but newly-arrived rows always float to the top
    // first (so what CoWork just added in this stage is the first thing you see), then the per-step
    // default (tracker = newest, Fit = un-queued review first, then queued, then assessed by score).
    .sort((a, b) => {
      // Pinned rows always lead the table — even over an explicit click-sort.
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (sort) return cmp(sortVal(a, sort.key), sortVal(b, sort.key), sort.dir);
      const an = isNewRow(a), bn = isNewRow(b);
      if (an !== bn) return an ? -1 : 1; // new rows first
      return isTracker ? rowDate(b).localeCompare(rowDate(a))
        : scored ? fitRank(a) - fitRank(b) : 0;
    });

  // Company-level "in tracker" tag (aggregated from real applications — no title matching).
  const trackedByCompany = new Map<string, { role: string; status: Posting["status"]; date?: string; appliedDate?: string; interviewed?: boolean }[]>();
  for (const p of postings) {
    const k = p.company.toLowerCase();
    const list = trackedByCompany.get(k) ?? [];
    list.push({ role: p.role, status: p.status, date: trackerDate(p), appliedDate: p.appliedDate, interviewed: p.interviewed });
    trackedByCompany.set(k, list);
  }
  const renderCompany = (name: string) => (
    <>
      <span className="block truncate">{name}</span>
      <TrackerTag items={trackedByCompany.get(name.toLowerCase()) ?? []} />
    </>
  );

  const act = async (id: number, action: ActionKey) => {
    setScanRows((rs) => (rs ? rs.filter((r) => r.id !== id) : rs)); // optimistic
    await fetch(`/api/scanned/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    loadCounts(terms);
    loadRows(); // reconcile — a row may stay in this stage (e.g. apply-later within Fit Assessment)
    if (action === "queue-fit" || action === "tailor") bump(); // handed work to CoWork — pulse the queue
  };

  // Jump a posting to ANY stage, out of sequence (the ⋯ "Move to" menu — works from every stage, e.g.
  // a fresh match straight to Applied). One PATCH to the unified posting (valid in any stage), filling
  // the same stage side effects as the drawer's selector: stamp the applied date on first apply, flag
  // interviewed on entering the loop. Then re-read counts + the active table + the tracker so the row
  // leaves its old stage and lands in the new one.
  const moveTo = async (p: FRow, state: string) => {
    if (p.state === state) return;
    setScanRows((rs) => (rs ? rs.filter((r) => r.id !== p.id) : rs)); // optimistic for scan-stage rows
    const extra: Record<string, unknown> =
      state === "applied" && !p.appliedDate ? { appliedDate: new Date().toISOString().slice(0, 10) }
        : state === "interview" ? { interviewed: true }
        : {};
    await fetch(`/api/applications/${p.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: state, ...extra }),
    }).catch(() => {});
    loadCounts(terms);
    loadRows(); // reconcile the active scan table
    reload(); // refresh the tracker postings — the row may now live in a tracker step
  };

  // Pin/unpin a posting → it floats to the top of its stage table. Tracker rows go through the
  // optimistic useApplications path; scan-stage rows PATCH directly (they aren't in `postings`).
  const togglePin = async (p: FRow) => {
    const next = !p.pinned;
    if (p.posting) { setField(p.posting, { pinned: next }); return; }
    setScanRows((rs) => (rs ? rs.map((r) => (r.id === p.id ? { ...r, pinned: next } : r)) : rs)); // optimistic
    await fetch(`/api/applications/${p.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ pinned: next }),
    }).catch(() => {});
    loadRows();
  };

  // Inner content per column, over the unified row. The <Td> wrapper (width bounds + class) is
  // applied by the row map below, so this just returns what goes inside the cell.
  // Standard work-status for a row's fit/tailor phase: in-progress (an agent claimed the job) wins,
  // then a queued redo, then the state-based queued status. Drives the unified JobStatusChip below.
  const fitStatusOf = (p: FRow): WorkStatus | null =>
    isWorking(String(p.id), "fit") ? "in_progress"
      : redoNoteFor(String(p.id), "fit") !== null ? "queued_redo"
      : p.state === "fit_queue" ? "queued_fit" : null;
  const tailorStatusOf = (p: FRow): WorkStatus | null =>
    isWorking(String(p.id), "tailor") ? "in_progress"
      : redoNoteFor(String(p.id), "tailor") !== null ? "queued_redo"
      : (p.state === "tailoring" && !p.resumeDir) ? "queued_tailor" : null;

  const cellContent = (k: string, p: FRow): React.ReactNode => {
    switch (k) {
      case "company": {
        const scanned = relAge(p.scannedAt);
        return (
          <span className="flex items-start gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); togglePin(p); }}
              title={p.pinned ? "Unpin" : "Pin to top"}
              className={`mt-0.5 shrink-0 transition ${p.pinned ? "text-amber-300" : "text-zinc-600 opacity-0 hover:text-zinc-300 group-hover:opacity-100"}`}
            >
              <Pin size={12} className={p.pinned ? "fill-amber-300/30" : ""} />
            </button>
            <span className="min-w-0 flex-1">
              {renderCompany(p.company)}
              {scanned && <span className="mt-0.5 block text-[11px] text-zinc-600">scanned {scanned}</span>}
            </span>
            {isNewRow(p) && <NewTag />}
          </span>
        );
      }
      case "title": return <Title text={p.title} url={p.url} />;
      case "lvl": return <LevelChip company={p.company} leveling={p.leveling} levelingRef={levelingRef ?? DEFAULT_LEVELING_REF} />;
      case "fit": {
        const ws = fitStatusOf(p);
        return (
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] leading-snug text-zinc-500">
            {p.fitScore != null && <span className={`rounded-full border px-1.5 py-0.5 text-[12px] font-medium tabular-nums ${fitColor(p.fitScore)}`}>{p.fitScore}</span>}
            {ws && <JobStatusChip status={ws} />}
            {p.fitScore == null && !ws && (p.state === "review" || p.state === "matched") && <span className="text-[12px] text-zinc-600">not assessed yet</span>}
            {p.fit?.summary && <span>{p.fit.summary}</span>}
          </div>
        );
      }
      case "location": return p.location ?? "—";
      case "gaps": return (
        <span className="flex flex-wrap gap-1">
          {(p.fit?.gaps ?? []).map((g, i) => (
            <span key={i} title={g.detail} className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${g.severity === "hard" ? "text-rose-300 bg-rose-500/15" : "text-amber-300 bg-amber-500/15"}`}>{g.text}</span>
          ))}
          {!p.fit?.gaps?.length && <span className="text-zinc-600">—</span>}
        </span>
      );
      case "resume": {
        const ws = tailorStatusOf(p);
        if (!p.resumeDir) return ws ? <JobStatusChip status={ws} /> : "—";
        const tailoredAt = lastTailoredAt(p.redoLog ?? []);
        return (
          <span className="flex flex-col gap-0.5">
            <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); setDiffSlug(p.resumeDir!); setDiffPostingId(String(p.id)); setDiffAnnotated(tailorDiffFor(p.redoLog ?? [], p.resumeDir!)); }}
                title={`Diff ${p.resumeDir} against the base resume`}
                className="inline-flex max-w-full items-center gap-1 truncate text-sky-300 transition hover:text-sky-400 hover:underline"
              >
                <GitCompareArrows size={12} className="shrink-0" /><span className="truncate">{resumeLabel(p.resumeDir)}</span>
              </button>
              {ws && <JobStatusChip status={ws} />}
            </span>
            {tailoredAt && <span className="text-[11px] text-zinc-600" title={shortDay(tailoredAt) ?? undefined}>tailored {relAge(tailoredAt)}</span>}
          </span>
        );
      }
      case "status": {
        // Pre-apply (scan-stage) rows have no tracker status yet.
        if (!p.status) return <span className="text-zinc-600">—</span>;
        const links = stageEmailLinks(p);
        return (
          <span className="flex flex-col items-start gap-1">
            <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${STATUS_CHIP[p.status] ?? "text-zinc-400 bg-zinc-700/40"}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
            {links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={l.direct ? `Open the ${l.label} email in Gmail` : `Search Gmail for the ${l.label} email`}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-500 transition hover:text-sky-300"
              >
                <Mail size={10} className="shrink-0" /> {l.label} <ExternalLink size={9} className="shrink-0" />
              </a>
            ))}
          </span>
        );
      }
      case "applied": return p.appliedDate ?? "—";
      case "updated": return p.updatedAt ?? "—";
      case "comment": return <CommentCell id={p.id} comments={p.comments ?? []} onChanged={() => { reload(); loadRows(); }} />;
      case "act": return <ActionCell actions={ACTIONS_BY_STATE[p.state] ?? []} state={p.state} onAct={(a) => act(p.id, a)} onMove={(s) => moveTo(p, s)} />;
      default: return null;
    }
  };

  // Per-step badge count. When a filter is active it's the count of MATCHING postings in that step
  // (tracker steps filter the client-side `postings`; pre-apply steps read `bucketCounts`, which the
  // server already filtered by the same terms) — so the spine reads as a "where is this company?" map.
  const count = (s: SpineStep): number | undefined =>
    s.key === "review" ? undefined // Scan Watchlist = config, no posting count badge
      : isTrackerStep(s.key)
      ? postings.filter((p) => columnOf(p) === STEP_COLUMN[s.key] && matches(p.company, p.role, p.location)).length
      : bucketCounts ? stepCount(s, bucketCounts) : undefined;
  const tableLoading = isTracker ? loading : tab === "review" ? false : scanRows === null;
  const empty = (!rows || rows.length === 0) && !tableLoading;

  // Drawer wiring — reuse the board aggregate so the drawer gets the whole company group.
  const companies = useMemo(() => aggregateCompanies(postings), [postings]);
  const companyGroup = companies.find((c) => c.company === selectedCompany) || null;
  const closeDrawer = () => { setSelectedCompany(null); setSelectedJobId(null); };

  // Open a pre-apply (scan-stage) row in the same drawer: fetch the full posting (it isn't in the
  // tracker `postings` set), clearing any tracker selection first.
  const openScanRow = async (id: number) => {
    setSelectedCompany(null); setSelectedJobId(null);
    const r = await fetch(`/api/applications/${id}`).catch(() => null);
    if (r?.ok) setScanPosting((await r.json()).posting ?? null);
  };
  // The scan-stage drawer edits persist by id through PATCH (works for any stage) and update the
  // drawer from the response; then we refresh the scan rows + counts so the funnel reflects it.
  const refreshScan = () => { loadRows(); loadCounts(terms); reload(); };
  const scanEdit = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/applications/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) setScanPosting((await r.json()).posting ?? null);
    refreshScan();
  };
  // A one-item company aggregate for the drawer (it renders just the focused posting now).
  const scanAgg: CompanyAgg | null = scanPosting
    ? { company: scanPosting.company, tier: scanPosting.tier, items: [scanPosting], newCount: 0, statusCounts: {}, skipped: false, watchlist: !!scanPosting.watchlist }
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden text-zinc-100">
        {/* The spine — fixed page chrome (pulled OUT of the scroll area), so the stage nav AND the
            sticky table header below both stay put while the rows scroll. */}
        <div className="shrink-0 border-b border-zinc-800/80 bg-[var(--background)] px-6 pb-4 pt-5">
          <div className="flex items-stretch overflow-x-auto pb-1">
            {SPINE.map((s, i) => {
              const n = count(s);
              return (
                <ArrowStep
                  key={s.key} step={s} first={i === 0} count={n} active={tab === s.key}
                  muted={filtering && s.key !== "review" && (n ?? 0) === 0}
                  hit={filtering && (n ?? 0) > 0}
                  onClick={() => pickStep(s.key)}
                />
              );
            })}
          </div>
          {filtering && (() => {
            const total = SPINE.reduce((sum, s) => sum + (isTrackerStep(s.key) || s.key !== "review" ? (count(s) ?? 0) : 0), 0);
            const stages = SPINE.filter((s) => (count(s) ?? 0) > 0).length;
            return (
              <p className="mt-1 px-0.5 text-[12px] text-zinc-500">
                <span className="text-amber-300">{terms.join(", ")}</span> — {total} posting{total === 1 ? "" : "s"} across {stages} stage{stages === 1 ? "" : "s"}
              </p>
            );
          })()}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowArchive((v) => !v)}
              className="group flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wider text-zinc-500 transition hover:text-zinc-300"
            >
              <ChevronRight size={13} className={`transition-transform duration-200 ${showArchive ? "rotate-90" : ""}`} /> Archive
            </button>
            {showArchive && ARCHIVE.map((s) => <StepBtn key={s.key} step={s} count={count(s)} active={tab === s.key} onClick={() => pickStep(s.key)} />)}
            <div className="ml-auto flex items-center gap-2">
              {/* Queue an inbox-sync job for CoWork (read Gmail → update statuses/interviews/dates).
                  Disabled while one is already outstanding so clicks don't stack duplicates. */}
              {(() => { const queued = inboxSyncQueued || syncing; return (
              <button
                onClick={() => { if (!queued) { setSyncing(true); add({ type: "inbox-sync" }); } }}
                disabled={queued}
                title={queued ? "An inbox sync is already queued — run your CoWork queue" : "Queue an inbox sync for CoWork"}
                className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-zinc-300 ring-1 ring-inset ring-zinc-800 transition hover:text-zinc-100 hover:ring-zinc-700 disabled:cursor-default disabled:text-zinc-600 disabled:ring-zinc-800/60 disabled:hover:text-zinc-600"
              >
                <Mail size={13} className={queued ? "text-zinc-600" : "text-sky-300"} />
                {queued ? "Sync queued" : "Sync inbox"}
              </button>
              ); })()}
              {/* Filter as deletable tags: type a company → Enter pins it as a chip; the filter
                  applies across ALL stages (table + the spine heatmap). Backspace on an empty box
                  removes the last chip. */}
              <div className="flex min-w-56 flex-wrap items-center gap-1 rounded-md bg-zinc-900 px-1.5 py-1 ring-1 ring-inset ring-zinc-800 transition focus-within:ring-zinc-600 hover:ring-zinc-700">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[12px] font-medium text-amber-200">
                    {t}
                    <button onClick={() => removeTag(t)} title="Remove" className="text-amber-300/70 hover:text-amber-100"><X size={11} /></button>
                  </span>
                ))}
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draft.trim()) { e.preventDefault(); addTag(draft); }
                    else if (e.key === "Backspace" && !draft && tags.length) { e.preventDefault(); removeTag(tags[tags.length - 1]); }
                  }}
                  placeholder={tags.length ? "" : "filter by company…"}
                  className="min-w-[7rem] flex-1 bg-transparent px-1 py-0.5 text-[13px] text-zinc-300 outline-none placeholder:text-zinc-600"
                />
              </div>
              {filtering && (
                <button onClick={clearFilter} title="Clear filter" className="ml-1 text-zinc-500 hover:text-zinc-300">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scan Watchlist step = scan settings + watchlist (no postings table; matches now live in Fit). */}
        {tab === "review" && (
          <div className="flex-1 overflow-auto">
            <div className="flex items-center gap-1.5 px-6 pb-1 pt-4 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              <Settings size={13} /> Scan settings
            </div>
            <ProfilePanel />
            <LevelingRefPanel value={levelingRef} onSave={saveRef} />
            <TargetsTable counts={counts} onSelect={addTag} />
          </div>
        )}

        {/* The rows scroll here (both axes). The spine above is fixed chrome and the table header is
            sticky-top, so only the body moves. px-6 lives on THIS scroll container so the frozen
            sticky-left columns line up with the table; the top gutter is an inner pad (container
            padding-top would leave a strip above the pinned header). */}
        {tab !== "review" && (
        <div className="flex-1 overflow-auto px-6 pb-8">
          <div className="pt-4">
            {/* Closed collapses several outcomes — offer a per-status sub-filter. */}
            {tab === "closed" && closedPresent.length >= 2 && (
              <ClosedFilter present={closedPresent} base={trackerBase} active={effClosed} onChange={setClosedFilter} />
            )}
            {tableLoading ? (
              <div className="flex items-center gap-2 py-8 text-[13px] text-zinc-500"><Loader2 size={14} className="animate-spin" /> loading…</div>
            ) : empty ? (
              <div className="rounded-xl border border-dashed border-zinc-800/80 py-10 text-center text-[13px] text-zinc-600">nothing in this step</div>
            ) : (
              <table className="border-separate border-spacing-0 text-left" style={{ minWidth: fcols.reduce((s, k) => s + (isFrozen(k) ? FROZEN_W[k] : colBound(k).min), 0) }}>
                <thead>
                  <tr>
                    {fcols.map((k) => (
                      <ResTh
                        key={k}
                        min={colBound(k).min}
                        max={colBound(k).max}
                        style={headerStyle(k)}
                        className={isFrozen(k) ? frozenCls(k, false) : "bg-[var(--background)]"}
                        onSort={UNSORTABLE.has(k) ? undefined : () => toggleSort(k)}
                        sortDir={sort?.key === k ? sort.dir : null}
                      >{FUNNEL_LABEL[k]}</ResTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((p) => (
                    <tr
                      key={p.id}
                      onClick={p.posting ? () => selectJob(p.posting!) : () => openScanRow(p.id)}
                      className="group cursor-pointer text-[13px] text-zinc-300 odd:bg-zinc-900/30 hover:bg-zinc-800/50"
                    >
                      {fcols.map((k) => (
                        <Td
                          key={k}
                          style={isFrozen(k) ? frozenStyle(k, 10) : colStyle(k)}
                          className={`${COL_CLASS[k] ?? ""} ${isFrozen(k) ? frozenCls(k, true) : ""}`}
                        >{cellContent(k, p)}</Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        )}

      {companyGroup && (
        <CompanyDrawer
          key={selectedJobId}
          c={companyGroup}
          focusId={selectedJobId}
          onClose={closeDrawer}
          onSetStatus={setStatus}
          onSetInterviewed={setInterviewed}
          onTier={(tier) => setCompanyTier(companyGroup.company, tier)}
          onToggleWatchlist={(on) => setWatchlist(companyGroup.company, on)}
          onEditField={setField}
          onMove={moveJob}
          onDelete={(p) => {
            deleteJob(p);
            if (selectedJobId === p.id || companyGroup.items.length === 1) closeDrawer();
          }}
          onRename={(name) => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== companyGroup.company) {
              renameCompany(companyGroup.company, trimmed);
              setSelectedCompany(trimmed); // keep the drawer pointed at the renamed company
            }
          }}
        />
      )}

      {/* Pre-apply (scan-stage) row → same drawer, edits persisted by id via PATCH. */}
      {scanAgg && scanPosting && (
        <CompanyDrawer
          key={scanPosting.id}
          c={scanAgg}
          focusId={scanPosting.id}
          onClose={() => setScanPosting(null)}
          onSetStatus={(p, status) => scanEdit(p.id, {
            status,
            ...(status === "applied" && !p.appliedDate ? { appliedDate: new Date().toISOString().slice(0, 10) }
              : status === "interview" && !p.interviewed ? { interviewed: true } : {}),
          })}
          onSetInterviewed={(p, on) => scanEdit(p.id, { interviewed: on })}
          onTier={(tier) => scanEdit(scanPosting.id, { tier })}
          onToggleWatchlist={(on) => { setWatchlist(scanPosting.company, on); setScanPosting((cur) => (cur ? { ...cur, watchlist: on } : cur)); }}
          onEditField={(p, changes) => scanEdit(p.id, changes)}
          onMove={(p, company) => scanEdit(p.id, { moveToCompany: company })}
          onDelete={async (p) => { await fetch(`/api/applications/${p.id}`, { method: "DELETE" }).catch(() => {}); setScanPosting(null); refreshScan(); }}
          onRename={(name) => { const t = name.trim(); if (t && t !== scanPosting.company) scanEdit(scanPosting.id, { companyName: t }); }}
        />
      )}

      {diffSlug && <ResumeDiffModal key={diffSlug} slug={diffSlug} postingId={diffPostingId ?? undefined} redoNote={diffPostingId ? redoNoteFor(diffPostingId, "tailor") : null} annotated={diffAnnotated} title={diffSlug} onClose={() => { setDiffSlug(null); setDiffPostingId(null); setDiffAnnotated(undefined); }} />}
    </div>
  );
}

// One segment of the spine ribbon — a right-pointing arrow (clip-path) that interlocks with its
// neighbours. Filled when active, faint tint otherwise. Scaled up so the spine reads as the page's
// primary navigation.
// `muted` = a filter is active and this stage has 0 matches (dim it); `hit` = filter active and this
// stage HAS matches (glow amber) — together the ribbon reads as a "where is this company?" heatmap.
function ArrowStep({ step, count, active, first, muted, hit, onClick }: { step: SpineStep; count?: number; active: boolean; first: boolean; muted?: boolean; hit?: boolean; onClick: () => void }) {
  const A = 14; // arrow depth, px
  const clip = first
    ? `polygon(0 0, calc(100% - ${A}px) 0, 100% 50%, calc(100% - ${A}px) 100%, 0 100%)`
    : `polygon(0 0, calc(100% - ${A}px) 0, 100% 50%, calc(100% - ${A}px) 100%, 0 100%, ${A}px 50%)`;
  const tone = active
    ? "bg-violet-500 text-violet-50 shadow-sm"
    : hit
    ? "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
    : "bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:text-violet-200 [.light_&]:hover:text-violet-700";
  const badge = active ? "bg-violet-50/25 text-violet-50" : hit ? "bg-amber-500/25 text-amber-100" : "bg-violet-500/20 text-violet-300";
  return (
    <div style={{ marginLeft: first ? 0 : -(A - 2) }} className="flex shrink-0">
      <button
        onClick={onClick}
        title={step.hint}
        style={{ clipPath: clip }}
        className={`relative flex items-center gap-2 py-2.5 pr-5 text-[14px] font-semibold transition ${first ? "pl-4" : "pl-7"} ${tone} ${muted ? "opacity-40" : ""}`}
      >
        {step.label}
        {count != null && (
          <span className={`rounded-full px-1.5 text-[12px] font-bold tabular-nums ${badge}`}>{count}</span>
        )}
      </button>
    </div>
  );
}

// A pill step button (the archive row); the count badge inverts when active.
function StepBtn({ step, count, active, onClick }: { step: SpineStep; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={step.hint}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium ring-1 ring-inset transition ${
        active ? "bg-zinc-200 text-zinc-900 ring-transparent" : "text-zinc-400 ring-zinc-800 hover:bg-zinc-800/60"
      }`}
    >
      {step.label}
      {count != null && <span className={`rounded-full px-1 text-[11px] tabular-nums ${active ? "bg-zinc-400 text-zinc-700" : "bg-zinc-800 text-zinc-500"}`}>{count}</span>}
    </button>
  );
}

// Per-status sub-filter for the Closed step — "all" plus each present closed status, with counts.
function ClosedFilter({ present, base, active, onChange }: { present: Status[]; base: Posting[]; active: Status | "all"; onChange: (s: Status | "all") => void }) {
  const chip = (key: Status | "all", label: string, n: number) => {
    const on = active === key;
    return (
      <button
        key={key}
        onClick={() => onChange(key)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${
          on ? "border-transparent bg-zinc-100 text-zinc-900" : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
        }`}
      >
        {label}
        <span className={`tabular-nums ${on ? "text-zinc-500" : "text-zinc-600"}`}>{n}</span>
      </button>
    );
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {chip("all", "all", base.length)}
      {present.map((s) => chip(s, STATUS_LABEL[s], base.filter((p) => p.status === s).length))}
    </div>
  );
}

function Title({ text, url, hint }: { text: string; url?: string | null; hint?: string }) {
  const [preview, setPreview] = useState(false);
  // Break the title onto a new line after each comma (e.g. "Senior Software Engineer, Gemini").
  const parts = text.split(",");
  const body = parts.map((part, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {part.trim()}{i < parts.length - 1 ? "," : ""}
    </span>
  ));
  return (
    <span title={hint}>
      {/* Clicking the title opens the in-app iframe preview. stopPropagation so it doesn't also
          fire the row's drawer click. No URL → plain text. */}
      {url ? (
        <button
          onClick={(e) => { e.stopPropagation(); setPreview(true); }}
          title="Preview posting"
          className="text-left text-zinc-100 transition hover:text-sky-300 hover:underline"
        >
          {body}
        </button>
      ) : (
        <span className="text-zinc-100">{body}</span>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open in new tab"
          className="ml-1.5 inline text-zinc-600 hover:text-sky-400"
        >
          <ExternalLink size={11} className="inline" />
        </a>
      )}
      {preview && url && <LinkPreview url={url} title={text} onClose={() => setPreview(false)} />}
    </span>
  );
}

// In-app preview of a job posting — an iframe modal so you can skim without leaving the funnel.
// Many ATS/job boards forbid framing (X-Frame-Options / frame-ancestors). A blocked frame still
// fires `load`, so we can't detect it client-side — instead we probe the headers server-side
// (/api/embeddable) and, when embedding is blocked, show an "open in new tab" fallback.
function LinkPreview({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const [embeddable, setEmbeddable] = useState<boolean | null>(null); // null = still checking

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/embeddable?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setEmbeddable(Boolean(d.embeddable)); })
      .catch(() => { if (alive) setEmbeddable(false); });
    return () => { alive = false; };
  }, [url]);

  // Portal to <body>: this modal is rendered deep inside a FROZEN (position:sticky, z-index:10) table
  // cell, which is its own stacking context — so the modal's z-[60] would only compete *within* that
  // cell and the sticky spine (z-30, root context) paints over it. Portaling escapes to the root
  // stacking context where z-[60] wins over all the page chrome.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2.5">
          <span className="flex-1 truncate text-[13px] font-medium text-zinc-200">{title}</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[12px] text-zinc-400 transition hover:text-sky-300"
          >
            <ExternalLink size={12} /> Open in new tab
          </a>
          <button onClick={onClose} title="Close (Esc)" className="shrink-0 text-zinc-500 transition hover:text-zinc-200"><X size={16} /></button>
        </div>
        {embeddable === null ? (
          <div className="flex flex-1 items-center justify-center gap-2 bg-zinc-900 text-sm text-zinc-500">
            <Loader2 size={16} className="animate-spin" /> loading…
          </div>
        ) : embeddable ? (
          <iframe src={url} title={title} className="w-full flex-1 bg-white" />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-900 px-6 text-center">
            <p className="max-w-sm text-[13px] leading-relaxed text-zinc-400">
              This site blocks embedding, so the posting can’t be previewed here. Open it in a new tab to view the full listing.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-500 px-3 py-1.5 text-[13px] font-medium text-violet-50 transition hover:bg-violet-400"
            >
              <ExternalLink size={14} /> Open in new tab
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Btn({ tone, onClick, title, children }: { tone: "emerald" | "rose" | "sky" | "amber"; onClick: () => void; title: string; children: React.ReactNode }) {
  const cls = tone === "emerald" ? "text-emerald-300 ring-emerald-500/30 hover:bg-emerald-500/15"
    : tone === "sky" ? "text-sky-300 ring-sky-500/30 hover:bg-sky-500/15"
    : tone === "amber" ? "text-amber-300 ring-amber-500/30 hover:bg-amber-500/15"
    : "text-rose-300 ring-rose-500/30 hover:bg-rose-500/15";
  return (
    <button onClick={onClick} title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[13px] font-medium ring-1 ring-inset transition ${cls}`}>
      {children}
    </button>
  );
}

// Row actions: the first (primary) as a quick button, the rest behind a ⋯ menu so the column
// stays uncrowded. A single-action row shows just the button; no actions → nothing.
// The comment cell: a MessageSquare icon (+ count when there are comments) that opens a portaled
// popover with the thread + an input to add. Comments persist via /api/applications/:id/comment;
// `onChanged` refreshes the row so the count updates.
function CommentCell({ id, comments, onChanged }: { id: number; comments: Comment[]; onChanged: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [list, setList] = useState<Comment[]>(comments);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Seeded once from props; thereafter local is the source of truth (the cell is keyed by posting id
  // at the row level, and add/delete update `list` from the API response — so no prop-resync needed).

  const send = async (method: "POST" | "DELETE", body: object) => {
    setBusy(true);
    const r = await fetch(`/api/applications/${id}/comment`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) { const d = await r.json(); setList(d.posting?.comments ?? []); onChanged(); }
    setBusy(false);
  };
  const add = () => { const t = draft.trim(); if (t) { setDraft(""); send("POST", { text: t }); } };
  const n = list.length;

  return (
    <span className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setPos(pos ? null : anchorFrom(e)); }}
        title={n ? `${n} comment${n === 1 ? "" : "s"}` : "Add a comment"}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] transition ${n ? "text-amber-300 hover:text-amber-200" : "text-zinc-600 hover:text-zinc-300"}`}
      >
        <MessageSquare size={13} className={n ? "fill-amber-300/15" : ""} />
        {n > 0 && <span className="font-medium tabular-nums">{n}</span>}
      </button>
      {pos && (
        <PopoverPanel at={pos} onClose={() => setPos(null)} className="w-72 p-2">
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {list.length === 0 && <p className="px-1 py-2 text-center text-[12px] text-zinc-600">No comments yet.</p>}
            {list.map((c, i) => (
              <div key={i} className="group rounded-md bg-zinc-800/50 px-2 py-1.5">
                <div className="flex items-start gap-2">
                  <p className="flex-1 whitespace-pre-wrap break-words text-[13px] text-zinc-200">{c.text}</p>
                  <button onClick={() => send("DELETE", { index: i })} title="Delete" className="shrink-0 text-zinc-600 opacity-0 transition hover:text-rose-300 group-hover:opacity-100"><X size={12} /></button>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">{ago(c.at)}</p>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 border-t border-zinc-800 pt-1.5">
            <input
              autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="Add a comment…"
              className="min-w-0 flex-1 rounded bg-zinc-800 px-2 py-1 text-[13px] text-zinc-200 outline-none ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-600 focus:ring-zinc-500"
            />
            <button onClick={add} disabled={busy || !draft.trim()} className="shrink-0 rounded bg-violet-500 px-2 py-1 text-[12px] font-medium text-violet-50 transition enabled:hover:bg-violet-400 disabled:opacity-40">Add</button>
          </div>
        </PopoverPanel>
      )}
    </span>
  );
}

function ActionCell({ actions, state, onAct, onMove }: { actions: ActionKey[]; state: string; onAct: (a: ActionKey) => void; onMove: (state: string) => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // Just the PRIMARY action as a quick button; every secondary action folds into the ⋯ menu, which
  // also carries "Move to" (jump to any stage out of sequence). One button + the ⋯ fits the fixed
  // action-column width with no overflow, and the ⋯ shows on every row — even tracker rows with no
  // contextual quick action.
  const inline = actions.slice(0, 1);
  const more = actions.slice(1);
  const moves = MOVE_TARGETS.filter((t) => t.stage !== STATE_STAGE[state]);
  const hasMenu = more.length > 0 || moves.length > 0;
  return (
    <span className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {inline.map((a) => {
        const m = ACTION_META[a];
        const I = m.icon;
        return (
          <Btn key={a} tone={m.tone} onClick={() => onAct(a)} title={m.title}>{I && <I size={12} className="-ml-0.5" />}{m.label}{m.arrow && <ArrowRight size={12} className="-mr-0.5" />}</Btn>
        );
      })}
      {hasMenu && (
        <button
          onClick={(e) => { e.stopPropagation(); setPos(pos ? null : anchorFrom(e)); }}
          title="More actions — including move to any stage"
          className="rounded-md p-1 text-zinc-500 ring-1 ring-inset ring-zinc-800 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          <MoreHorizontal size={14} />
        </button>
      )}
      {pos && (
        <PopoverPanel at={pos} onClose={() => setPos(null)} className="p-1">
          <div className="flex flex-col gap-0.5">
            {more.map((a) => {
              const m = ACTION_META[a];
              const I = m.icon;
              return (
                <button
                  key={a}
                  onClick={() => { onAct(a); setPos(null); }}
                  title={m.title}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium transition hover:bg-zinc-800 ${TONE_TEXT[m.tone]}`}
                >
                  {I && <I size={13} />}{m.label}{m.arrow && <ArrowRight size={13} className="ml-auto" />}
                </button>
              );
            })}
            {more.length > 0 && moves.length > 0 && <div className="my-0.5 border-t border-zinc-800" />}
            {moves.length > 0 && (
              <div className="px-2.5 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Move to</div>
            )}
            {moves.map((t) => (
              <button
                key={t.state}
                onClick={() => { onMove(t.state); setPos(null); }}
                title={`Move to ${t.label}`}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-zinc-300 transition hover:bg-zinc-800"
              >
                <ChevronRight size={13} className="text-zinc-500" />{t.label}
              </button>
            ))}
          </div>
        </PopoverPanel>
      )}
    </span>
  );
}

// A quiet "waiting on CoWork" status. How to actually run the queue lives once in the floating
// queue panel (its command center), so the rows stay uncluttered.
// "NEW" — a row that entered its current stage within the last day (see isNewRow). Draws the eye to
// what CoWork just added to this stage; the row also floats to the top and carries a faint tint.
function NewTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300" title="Added to this stage in the last day">
      New
    </span>
  );
}

function Td({ children, className, style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <td style={style} className={`border-b border-zinc-900 px-2.5 py-2.5 align-top first:pl-0 ${className ?? ""}`}>{children}</td>;
}
