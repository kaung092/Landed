import { getConfig, setConfig } from "./config-store";
import { DEFAULT_LEVELING_REF, type LevelingRef } from "@/lib/leveling";

// The candidate's search identity — the source of truth for what counts as a fit. Read by the
// scan's second pass (CoWork) and the fit playbook's leveling. Stored as one JSON blob in
// app_config under "profile"; editable on the Discovery page.
export type Profile = {
  levelBaseline: string; // who I am, level-wise
  levelRule: string; // how to pick the target level per company
  includeDisciplines: string[]; // SWE disciplines that count as a match
  excludeDisciplines: string[]; // disciplines to drop even if the title says "engineer"
  locations: string; // where I'll work
  notes: string; // freeform extra context for CoWork
};

const PROFILE_KEY = "profile";

export const DEFAULT_PROFILE: Profile = {
  levelBaseline: "ex-Amazon L6 (Senior SDE), ~2 years at L6",
  levelRule:
    "Target Senior at big / rigorous-leveling companies (FAANG-scale, strict ladders); Staff at smaller companies / startups. Senior Staff+ / Principal = stretch.",
  includeDisciplines: ["backend", "fullstack", "platform", "infrastructure", "distributed systems", "SRE / production"],
  excludeDisciplines: [
    "ML / AI research",
    "security",
    "mobile (iOS / Android)",
    "compilers / PL / formal methods",
    "low-latency / HFT",
    "hardware / embedded",
    "data engineering",
    "IT / sysadmin",
  ],
  locations: "US (incl. remote-US)",
  notes: "",
};

export function getProfile(): Profile {
  const raw = getConfig(PROFILE_KEY);
  if (!raw) return DEFAULT_PROFILE;
  try {
    return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

// Merge a partial patch over the current profile and persist.
export function setProfile(patch: Partial<Profile>): Profile {
  const next = { ...getProfile(), ...patch };
  setConfig(PROFILE_KEY, JSON.stringify(next));
  return next;
}

// The leveling reference — the anchor ladder every company is drawn against. Stored alongside the
// profile in app_config; defaults to Amazon (DEFAULT_LEVELING_REF) until the user customizes it.
const LEVELING_REF_KEY = "leveling_ref";

export function getLevelingRef(): LevelingRef {
  const raw = getConfig(LEVELING_REF_KEY);
  if (!raw) return DEFAULT_LEVELING_REF;
  try {
    return { ...DEFAULT_LEVELING_REF, ...(JSON.parse(raw) as Partial<LevelingRef>) };
  } catch {
    return DEFAULT_LEVELING_REF;
  }
}

export function setLevelingRef(patch: Partial<LevelingRef>): LevelingRef {
  const next = { ...getLevelingRef(), ...patch };
  setConfig(LEVELING_REF_KEY, JSON.stringify(next));
  return next;
}
