import { dismissThread } from "@/lib/threads";

export const dynamic = "force-dynamic";

// DELETE /api/threads/:id — soft-dismiss a chat from the view (it returns if it acts again). We
// don't hard-delete: the thread's jobs + step trace stay as history; this just hides the chat.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  dismissThread(id);
  return Response.json({ ok: true });
}
