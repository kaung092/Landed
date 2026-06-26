import { scannedAction, getPosting, setPostingJd, getPostingJd } from "@/lib/db/queries";
import { createJob, enqueueTailoring } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

// GET /api/scanned/:id — the posting's saved JD (lazily loaded by the fit detail modal).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) return Response.json({ error: "bad id" }, { status: 400 });
  return Response.json({ jd: getPostingJd(n) });
}

// PUT /api/scanned/:id/jd  body: { jd } — persist the posting's JD (CoWork's savePostingJd tool,
// called at the fit stage with the JD it fetched). Kept off submitJobResult so the (often large) JD
// is a deliberate write, not a verbatim echo CoWork tends to drop.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) return Response.json({ error: "bad id" }, { status: 400 });
  let body: { jd?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.jd !== "string" || !body.jd.trim())
    return Response.json({ error: "jd is required" }, { status: 400 });
  const p = setPostingJd(n, body.jd);
  return p ? Response.json({ ok: true, id: n }) : Response.json({ error: "not found" }, { status: 404 });
}

// POST /api/scanned/:id  body: { action: "discard" | "queue-fit" | "tailor" | "apply" | "apply-later" }
//   Discovery-stage moves: discard → discard pile · queue-fit → fit queue (+ enqueue a fit job;
//   JD fetched from the URL by CoWork) · tailor → tailoring · apply-later → saved hold pile ·
//   apply → graduate to the tracker (creates an applications row).
const ACTIONS = ["discard", "queue-fit", "tailor", "apply", "apply-later"] as const;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) return Response.json({ error: "bad id" }, { status: 400 });
  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!ACTIONS.includes(body.action as (typeof ACTIONS)[number]))
    return Response.json({ error: `action must be ${ACTIONS.join(" | ")}` }, { status: 400 });

  const r = scannedAction(n, body.action as (typeof ACTIONS)[number]);
  if (r.ok && r.fit) {
    createJob({
      type: "fit",
      createdBy: "You",
      task: "Assess fit for the posting below. Use the JD in params if present, else fetch it from the URL; then score per fit.md.",
      params: { postings: [{ id: r.fit.id, company: r.fit.company, role: r.fit.role, url: r.fit.url, jd: r.fit.jd ?? "" }] },
    });
  }
  if (r.ok && r.tailor) {
    // Route through enqueueTailoring so the job uses the stable `tailoring-app-<id>` id and the
    // versioned target slug (resume/<base>/v<N>) the rest of the system expects — NOT an ad-hoc
    // generated-id job with no slug, which drifts and strands the candidate at "Queued for tailoring…".
    const p = getPosting(r.tailor.id);
    if (p) enqueueTailoring(p);
  }
  return r.ok ? Response.json(r) : Response.json({ error: "not found" }, { status: 404 });
}
