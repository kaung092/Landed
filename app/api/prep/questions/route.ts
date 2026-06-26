import { listQuestions } from "@/lib/db/prep";

export const dynamic = "force-dynamic";

// GET /api/prep/questions?track=&company=  -> questions + derived progress
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const track = searchParams.get("track") || undefined;
    const company = searchParams.get("company") || undefined;
    return Response.json({ questions: listQuestions({ track, company }) });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
