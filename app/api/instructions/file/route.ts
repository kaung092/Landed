import { readFile, writeFile } from "node:fs/promises";
import { resolveInstruction } from "@/lib/config";

export const dynamic = "force-dynamic";

// GET /api/instructions/file?path=cowork/tailoring.md -> { content }
export async function GET(request: Request) {
  const rel = new URL(request.url).searchParams.get("path");
  if (!rel) return Response.json({ error: "missing path" }, { status: 400 });
  const full = resolveInstruction(rel);
  if (!full) return Response.json({ error: "invalid path" }, { status: 400 });
  try {
    const content = await readFile(full, "utf8");
    return Response.json({ path: rel, content });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 404 });
  }
}

// PUT /api/instructions/file  body: { path, content } -> writes the file
export async function PUT(request: Request) {
  let body: { path?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.path || typeof body.content !== "string")
    return Response.json({ error: "missing path or content" }, { status: 400 });
  const full = resolveInstruction(body.path);
  if (!full) return Response.json({ error: "invalid path" }, { status: 400 });
  try {
    await writeFile(full, body.content, "utf8");
    return Response.json({ ok: true, path: body.path });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
