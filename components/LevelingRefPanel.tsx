"use client";

import { Gauge } from "lucide-react";
import Section from "@/components/Section";
import Field from "@/components/Field";
import { type LevelingRef } from "@/lib/leveling";

// Editable leveling reference — the anchor every company is matched against in the level popover.
// The ref is owned by the Pipeline page (one fetch, shared with the funnel) and persisted there; this
// panel just edits the human-readable identity (company · role · level). The underlying 1–10 ladder
// is collected from levels.fyi, not edited here. `value` is null while it's still loading.
export default function LevelingRefPanel({ value, onSave }: { value: LevelingRef | null; onSave: (patch: Partial<LevelingRef>) => void }) {
  if (!value) return null;
  const ref = value;
  const save = onSave;

  const targetMissing = !ref.ladder[ref.targetBand];

  return (
    <Section
      title="Leveling reference"
      icon={<Gauge size={15} className="text-sky-300" />}
      accent="sky"
      subtitle={`${ref.company} · ${ref.role} · ${ref.targetBand}`}
      storageKey="leveling-ref"
      defaultOpen={false}
    >
      <div className="grid max-w-2xl gap-x-8 gap-y-5 sm:grid-cols-3">
        <Field accent="sky" label="Company" value={ref.company} onCommit={(v) => save({ company: v })} placeholder="e.g. Amazon" />
        <Field accent="sky" label="Role" value={ref.role} onCommit={(v) => save({ role: v })} placeholder="e.g. Software Engineer" />
        <Field accent="sky" label="Level" value={ref.targetBand} onCommit={(v) => save({ targetBand: v.trim() })} placeholder="e.g. L6"
          hint={targetMissing ? "⚠ no rung by this name in the levels.fyi ladder" : "your target level"} />
        <p className="mt-1 border-t border-zinc-800/70 pt-3 text-[12px] text-zinc-500 sm:col-span-3">
          The company ladder behind this is collected from levels.fyi. Changing your reference re-draws the level popover instantly — no re-scan needed.
        </p>
      </div>
    </Section>
  );
}
