import "./setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { reset, seedCandidate } from "./helpers";
import { setConfig } from "@/lib/db/config-store";
import { onboardingStatus, onboardingComplete } from "@/lib/onboarding";

beforeEach(() => reset());

// A fresh install: nothing done yet, so the checklist stays visible.
test("onboardingStatus is all-false on an empty install", () => {
  const s = onboardingStatus();
  assert.equal(s.profile, false);
  assert.equal(s.resume, false);
  assert.equal(s.firstJob, false);
  assert.equal(onboardingComplete(s), false);
});

// Saving the profile ticks that step; adding a posting ticks firstJob.
test("saving the profile and adding a posting tick their steps", () => {
  setConfig("profile", JSON.stringify({ level: "Staff" }));
  seedCandidate({ company: "Acme", title: "Senior Software Engineer" });
  const s = onboardingStatus();
  assert.equal(s.profile, true);
  assert.equal(s.firstJob, true);
});

// The essentials gate completion: profile + résumé + first job. Résumé needs a real file (not
// present in tests), so completion stays false even with profile + a posting.
test("onboardingComplete requires all three essentials (résumé file absent in tests)", () => {
  setConfig("profile", JSON.stringify({ level: "Staff" }));
  seedCandidate({ company: "Acme", title: "Senior Software Engineer" });
  const s = onboardingStatus();
  assert.equal(s.resume, false);
  assert.equal(onboardingComplete(s), false);
});
