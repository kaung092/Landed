"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// The candidate profile prose (résumé text) the fit/leveling playbooks judge against — stored under
// the `fitlab_profile` app_config key. This is the identity source the genericized playbooks read
// (via getContext), so it lives here alongside the structured Profile + Leveling reference.
export default function CandidateProfilePanel() {
  const [profile, setProfile] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/fitlab/profile").then((r) => r.json()).then((d) => setProfile(d.profile ?? "")).catch(() => setProfile(""));
  }, []);

  const save = async () => {
    if (profile == null) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/fitlab/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile }) });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (profile == null) return <p className="text-[13px] text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-2.5">
      <textarea
        value={profile}
        onChange={(e) => { setProfile(e.target.value); setSaved(false); }}
        rows={12}
        className="w-full rounded-lg bg-zinc-900/60 px-3 py-2 font-mono text-[12px] leading-relaxed text-zinc-200 outline-none ring-1 ring-inset ring-zinc-800 focus:ring-zinc-600"
        placeholder="Paste your résumé / background prose here…"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-[13px] font-medium text-violet-50 transition enabled:hover:bg-violet-400 disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Save profile
        </button>
        {saved && <span className="text-[12px] text-emerald-400">Saved</span>}
      </div>
    </div>
  );
}
