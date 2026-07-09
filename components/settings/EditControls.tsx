"use client";

import { Pencil, Check } from "lucide-react";

// Shared view/edit affordances for the settings panels: an Edit toggle, a Save (confirm) toggle,
// and read-only preview cells. Values persist on field blur; Save just returns to the preview.

export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1 text-[12px] font-medium text-zinc-300 ring-1 ring-inset ring-zinc-700 transition hover:bg-zinc-700"
    >
      <Pencil size={12} /> Edit
    </button>
  );
}

export function SaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1 text-[12px] font-medium text-emerald-950 transition hover:bg-emerald-400"
    >
      <Check size={12} /> Save
    </button>
  );
}

export function PreviewItem({ label, value, full }: { label: string; value?: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-[12px] font-medium text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-[13px] leading-relaxed text-zinc-200">
        {value?.trim() ? value : <span className="text-zinc-600">—</span>}
      </dd>
    </div>
  );
}

export function ChipsPreview({ label, items, tone, full }: { label: string; items: string[]; tone: "emerald" | "rose"; full?: boolean }) {
  const chip = tone === "emerald" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300";
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-[12px] font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 flex flex-wrap gap-1">
        {items.length ? (
          items.map((t) => <span key={t} className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${chip}`}>{t}</span>)
        ) : (
          <span className="text-[13px] text-zinc-600">—</span>
        )}
      </dd>
    </div>
  );
}
