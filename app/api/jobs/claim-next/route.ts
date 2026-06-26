import { claimNext } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

// POST /api/jobs/claim-next  body: { by?, type? } — atomically lease the oldest claimable job and
// return it WITH its task/params. The dequeue primitive for CoWork: get a job + its claim in one call,
// so it can't start working before claiming. Pass `type` to drain a specific queue (e.g. "tailoring")
// out of FIFO order. Returns { job } (the claimed job) or { job: null } when nothing is claimable for
// that type right now. Always 200 — an empty queue is a normal answer, not an error.
export async function POST(request: Request) {
  let by: string | undefined;
  let type: string | undefined;
  try {
    const body = await request.json();
    by = body?.by;
    type = body?.type;
  } catch {
    // body is optional
  }
  return Response.json({ job: claimNext(by, type) });
}
