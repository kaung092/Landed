import test from "node:test";
import assert from "node:assert/strict";
import { shouldAutoSyncInbox } from "@/lib/inbox-schedule";

const now = new Date("2026-07-24T09:00:00");

test("never synced → due when enabled", () => {
  assert.equal(shouldAutoSyncInbox({ enabled: true, lastSynced: null, outstanding: false, now }), true);
});

test("synced earlier today → not due", () => {
  assert.equal(
    shouldAutoSyncInbox({ enabled: true, lastSynced: "2026-07-24T01:00:00", outstanding: false, now }),
    false,
  );
});

test("synced yesterday → due (calendar day rolled over)", () => {
  assert.equal(
    shouldAutoSyncInbox({ enabled: true, lastSynced: "2026-07-23T23:30:00", outstanding: false, now }),
    true,
  );
});

test("disabled toggle → never due", () => {
  assert.equal(shouldAutoSyncInbox({ enabled: false, lastSynced: null, outstanding: false, now }), false);
});

test("already queued/wip → never stack a second", () => {
  assert.equal(
    shouldAutoSyncInbox({ enabled: true, lastSynced: "2026-07-01T00:00:00", outstanding: true, now }),
    false,
  );
});

test("unparseable watermark → treat as due", () => {
  assert.equal(shouldAutoSyncInbox({ enabled: true, lastSynced: "not-a-date", outstanding: false, now }), true);
});
