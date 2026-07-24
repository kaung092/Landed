import { applyGlance, type GlanceInput } from "@/lib/db/queries";
import { createJob } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

// POST /api/scanned/glance  body: { verdicts: GlanceInput[] }
// the agent's superficial second pass (title + location, no JD). Per posting: high | low | drop.
//   high → a discovered application + a fit job are created (the agent fetches the JD when it runs the
//   fit job); low → review; drop → discarded. Creates the scanned row if it didn't exist yet.
export async function POST(request: Request) {
  let body: { verdicts?: GlanceInput[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const verdicts = Array.isArray(body?.verdicts) ? body.verdicts : [];
  let queued = 0, review = 0, discarded = 0, failed = 0;

  for (const v of verdicts) {
    if (!v?.company || (v.glance !== "high" && v.glance !== "low" && v.glance !== "drop")) { failed++; continue; }
    const r = applyGlance(v);
    if (!r.ok) { failed++; continue; }
    if (r.fit) {
      createJob({
        type: "fit",
        createdBy: "CoWork",
        task: "Assess fit for the posting below. Use the JD in params if present, else fetch it from the URL; then score per fit.md.",
        params: { postings: [{ id: r.fit.id, company: r.fit.company, role: r.fit.role, url: r.fit.url, jd: r.fit.jd ?? "" }] },
      });
    }
    if (r.outcome === "queued") queued++;
    else if (r.outcome === "review") review++;
    else discarded++;
  }

  return Response.json({ ok: true, queued, review, discarded, failed });
}
