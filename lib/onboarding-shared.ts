// Client-safe onboarding shapes + helpers — NO server imports (fs/db/gmail), so both the client
// checklist and the server status reader (lib/onboarding.ts) can use them.
export type OnboardingStatus = {
  profile: boolean; // the search profile has been saved at least once (else it's the shipped default)
  resume: boolean; // a base résumé .docx has been uploaded
  firstJob: boolean; // at least one posting exists (pasted a JD, scanned, or synced)
  gmail: boolean; // Gmail is wired (stored app password or env)
  agent: boolean; // the CoWork agent has run at least once
};

// The three steps that gate "is the app usable" — the checklist stays visible until these are done.
export const ONBOARDING_ESSENTIALS = ["profile", "resume", "firstJob"] as const;

export const onboardingComplete = (s: OnboardingStatus): boolean =>
  ONBOARDING_ESSENTIALS.every((k) => s[k]);
