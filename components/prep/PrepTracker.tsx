"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { usePrep } from "@/hooks/usePrep";
import type { PrepQuestion } from "@/lib/db/prep";
import QuestionRow from "./QuestionRow";

// The coding curriculum tracker: questions grouped by category/pattern (from plan
// metadata), with an overall progress bar, per-category collapsibles, noted/redo flags,
// and a redo queue. DB-backed via usePrep — progress persists server-side.
export default function PrepTracker({ track, company }: { track: string; company?: string }) {
  const { questions, loading, logAttempt, undoLast, setNoted, setRedo } = usePrep(track, company);
  const [openCat, setOpenCat] = useState<string | null>(null);

  const planned = useMemo(() => questions.filter((q) => q.plan?.pattern), [questions]);
  // Group by category/pattern, ordering categories by where they first appear (sortOrder).
  const categories = useMemo(() => {
    const byCat = new Map<string, PrepQuestion[]>();
    for (const q of planned) {
      const cat = q.plan!.pattern!;
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(q);
    }
    return [...byCat.entries()].sort(
      (a, b) => (a[1][0].sortOrder ?? 0) - (b[1][0].sortOrder ?? 0)
    );
  }, [planned]);

  const total = planned.length;
  const done = planned.filter((q) => q.done).length;
  const noted = planned.filter((q) => q.noted).length;
  const redoList = planned.filter((q) => q.redo);
  const pct = total ? Math.round((done / total) * 100) : 0;

  if (loading)
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
        <Loader2 size={16} className="animate-spin" /> loading…
      </div>
    );

  return (
    <div className="space-y-5">
      {/* progress summary */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-zinc-300">
            {done}/{total} solved
            {noted > 0 && <span className="ml-2 text-cyan-400">· {noted} noted</span>}
            {redoList.length > 0 && <span className="ml-2 text-amber-400">· {redoList.length} in redo</span>}
          </span>
          <span className={`font-mono text-sm font-bold ${pct === 100 ? "text-emerald-400" : "text-emerald-300"}`}>
            {pct}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
          <div
            className={`h-full rounded transition-all duration-500 ${pct === 100 ? "bg-emerald-400" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        {categories.map(([cat, probs]) => {
          const open = openCat === cat;
          const cDone = probs.filter((p) => p.done).length;
          const allDone = probs.length > 0 && cDone === probs.length;
          return (
            <div
              key={cat}
              className={`overflow-hidden rounded-xl border transition ${
                open ? "border-zinc-700 bg-zinc-900/40" : "border-zinc-800/70"
              }`}
            >
              <button
                onClick={() => setOpenCat(open ? null : cat)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex-1 text-sm font-medium text-zinc-200">{cat}</span>
                <span className={`font-mono text-[13px] ${allDone ? "font-bold text-emerald-400" : "text-zinc-500"}`}>
                  {allDone ? "✓ done" : `${cDone}/${probs.length}`}
                </span>
                <ChevronDown size={15} className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="border-t border-zinc-800/70 px-4 py-1">
                  {probs.map((q) => (
                    <QuestionRow
                      key={q.id}
                      q={q}
                      onLog={logAttempt}
                      onUndo={undoLast}
                      onNoted={setNoted}
                      onRedo={setRedo}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {redoList.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 border-b border-amber-500/20 px-4 py-3 text-sm font-semibold text-amber-300">
            <RotateCcw size={14} /> Redo queue — {redoList.length}
          </div>
          <div className="px-4 py-1">
            {redoList.map((q) => (
              <QuestionRow key={q.id} q={q} onLog={logAttempt} onUndo={undoLast} onNoted={setNoted} onRedo={setRedo} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
