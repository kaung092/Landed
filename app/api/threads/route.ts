import { listThreads, backlogByType } from "@/lib/threads";

export const dynamic = "force-dynamic";

// GET /api/threads — the CoWork chats seen recently, each with the jobs it's running + a recent
// step trace. Powers the floating-robot thread strip and the CoWork page's thread timeline.
// Optional `?steps=N` caps the per-thread trace; `?sinceHours=H` widens the lookback.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const stepLimit = Number(url.searchParams.get("steps")) || undefined;
    const sinceHours = Number(url.searchParams.get("sinceHours"));
    const sinceMs = Number.isFinite(sinceHours) && sinceHours > 0 ? sinceHours * 3_600_000 : undefined;
    return Response.json({ threads: listThreads({ stepLimit, sinceMs }), backlog: backlogByType() });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
