"use client";

import { usePersistentState } from "@/hooks/usePersistentState";
import { INBOX_DAILY_SYNC_KEY } from "@/lib/inbox-schedule";

// Daily inbox-sync opt-in. Persisted app-wide (localStorage, broadcast in-tab) so the Pipeline's
// Sync-inbox button reflects this state and its in-app timer queues one sync per day when on.
export default function InboxSyncSettings() {
  const [daily, setDaily] = usePersistentState<boolean>(INBOX_DAILY_SYNC_KEY, false);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-zinc-200">Auto-sync daily</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">
          Queue an inbox sync once a day (while the app is open) so tracker statuses, interview rounds,
          and dates stay current without a manual click.
        </p>
      </div>
      <button
        onClick={() => setDaily(!daily)}
        role="switch"
        aria-checked={daily}
        title={daily ? "Daily auto-sync is on — click to turn off" : "Turn on daily auto-sync"}
        className="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 text-[12px] font-medium text-zinc-300 transition hover:bg-zinc-900"
      >
        <span className={`relative h-4 w-7 rounded-full transition ${daily ? "bg-sky-500" : "bg-zinc-700"}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${daily ? "left-3.5" : "left-0.5"}`} />
        </span>
        {daily ? "On" : "Off"}
      </button>
    </div>
  );
}
