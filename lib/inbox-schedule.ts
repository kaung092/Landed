// Decide whether a daily inbox-sync should be auto-queued right now. Pure so the UI timer can call
// it on every tick and the logic stays directly testable (no clock/DOM). "Daily" means once per
// local calendar day: fire the first check on a day whose date differs from the last sync's date.

// Persisted (localStorage) opt-in key. Configured on /settings; the home page reads it to drive the
// auto-queue timer and to show the on/off state inside the Sync-inbox button.
export const INBOX_DAILY_SYNC_KEY = "landed.inbox.dailySync";

// Local calendar-day key (YYYY-MM-DD in the viewer's timezone) — the watermark is a full ISO
// timestamp, but "daily" is a calendar-day question, matched in local time like the rest of the UI.
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function shouldAutoSyncInbox(opts: {
  enabled: boolean; // the user's "Daily" toggle
  lastSynced: string | null | undefined; // `inbox_last_synced` watermark (ISO), or null if never
  outstanding: boolean; // an inbox-sync job is already queued/wip — never stack a second
  now: Date;
}): boolean {
  const { enabled, lastSynced, outstanding, now } = opts;
  if (!enabled || outstanding) return false;
  if (!lastSynced) return true; // never synced → due
  const last = new Date(lastSynced);
  if (Number.isNaN(last.getTime())) return true; // unparseable watermark → treat as due, re-stamp
  return localDayKey(last) !== localDayKey(now); // due once the calendar day rolls over
}
