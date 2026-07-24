import type { EmailRefs, InterviewKind, InterviewRound, Status } from "@/lib/types";
import { str } from "@/lib/coerce";
import type { IncomingApp } from "../types";

// inbox-sync statuses -> our pipeline enum. (No 'offer' status yet → treat as in-process.)
const STATUS_MAP: Record<string, Status> = {
  rejected: "rejected",
  no_response: "ghost",
  applied: "applied",
  interviewing: "interview",
  offer: "interview",
  expired: "expired",
};

// Coarse round types the agent may emit, mapped onto our enum; anything unrecognized → "other".
const KIND_MAP: Record<string, InterviewKind> = {
  recruiter_screen: "recruiter_screen", recruiter: "recruiter_screen", recruiter_call: "recruiter_screen", screen: "recruiter_screen",
  phone_screen: "phone_screen", phone: "phone_screen",
  technical: "technical", coding: "technical", tech: "technical",
  system_design: "system_design", design: "system_design",
  behavioral: "behavioral", values: "behavioral",
  onsite: "onsite", loop: "onsite",
  hiring_manager: "hiring_manager", hm: "hiring_manager", manager: "hiring_manager",
  final: "final",
};
const toKind = (v: unknown): InterviewKind | undefined => {
  const k = str(v)?.toLowerCase().replace(/[\s-]+/g, "_");
  return k ? KIND_MAP[k] ?? "other" : undefined;
};
const toOutcome = (v: unknown): InterviewRound["outcome"] | undefined => {
  const o = str(v)?.toLowerCase();
  return o === "passed" || o === "rejected" || o === "pending" ? o : undefined;
};

// Map a record's `interviews` array (loose JSON from the agent) → normalized InterviewRound[].
function incomingRounds(raw: unknown): InterviewRound[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rounds = raw
    .map((r, i): InterviewRound => {
      const o = (r ?? {}) as Record<string, unknown>;
      const n = Number(o.round);
      return {
        round: Number.isFinite(n) && n > 0 ? n : i + 1,
        kind: toKind(o.kind ?? o.type),
        date: str(o.date) ?? str(o.scheduledFor),
        outcome: toOutcome(o.outcome ?? o.status),
        notes: str(o.notes) ?? str(o.note),
        emailId: str(o.emailId) ?? str(o.threadId) ?? str(o.gmailThreadId),
      };
    })
    .filter((r) => r.kind || r.date || r.notes || r.emailId); // drop fully-empty entries
  return rounds.length ? rounds : undefined;
}

// Pull per-stage Gmail thread ids from a record (best-effort): an `emailRefs` map, else flat keys
// The agent may emit. Empty → undefined, so it never overwrites stored ids with nothing.
function incomingEmailRefs(r: Record<string, unknown>): EmailRefs | undefined {
  const m = (r.emailRefs ?? r.emails) as Record<string, unknown> | undefined;
  const out: EmailRefs = {};
  const put = (k: keyof EmailRefs, v: unknown) => { const s = str(v); if (s) out[k] = s; };
  if (m && typeof m === "object") {
    put("applied", m.applied); put("rejected", m.rejected); put("offer", m.offer); put("interview", m.interview);
  }
  put("applied", r.confirmationEmailId ?? r.appliedEmailId);
  put("rejected", r.rejectionEmailId);
  put("offer", r.offerEmailId);
  return Object.keys(out).length ? out : undefined;
}

// Map inbox-sync result records (the JSON `results[]`) → normalized IncomingApp for reconcile.
export function incomingFromInboxRecords(records: Record<string, unknown>[]): IncomingApp[] {
  return records.map((r): IncomingApp => {
    const note = str(r.note) ?? "";
    return {
      company: str(r.company) ?? "",
      role: str(r.role),
      level: str(r.level),
      team: str(r.team),
      location: str(r.location),
      status: STATUS_MAP[String(r.status ?? "")] ?? "applied",
      interviewed: r.interviewed === true || r.interviewed === "yes",
      appliedDate: str(r.appliedDate),
      updatedAt: str(r.lastUpdate) ?? str(r.appliedDate),
      channel: r.channel === "referral" ? "referral" : r.channel === "direct" ? "direct" : undefined,
      source: str(r.source),
      url: str(r.url),
      note: note || undefined,
      needsReview: /unclear if application submitted/i.test(note),
      interviews: incomingRounds(r.interviews ?? r.rounds),
      emailRefs: incomingEmailRefs(r),
    };
  });
}
