import { deleteQueuedJob } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

// DELETE /api/jobs/:id — drop a queued job from the CoWork queue. Only `queued` jobs can be
// removed (ingested rows are history); a no-op delete returns 404.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  const ok = deleteQueuedJob(id);
  return ok ? Response.json({ ok }) : Response.json({ error: "not found or not queued" }, { status: 404 });
}
