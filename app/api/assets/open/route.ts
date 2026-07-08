import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolveAsset } from "@/lib/config";

export const dynamic = "force-dynamic";

// POST /api/assets/open  body: { path } — reveal a file/folder under ASSET_ROOT in the OS file
// browser. Local-only convenience (server runs on the same machine), best-effort.
export async function POST(request: Request) {
  let body: { path?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const rel = body.path?.trim();
  if (!rel) return Response.json({ error: "missing path" }, { status: 400 });
  const full = resolveAsset(rel);
  if (!full) return Response.json({ error: "bad path" }, { status: 400 });
  if (!existsSync(full)) return Response.json({ error: "not found" }, { status: 404 });

  if (process.platform === "darwin") execFile("open", ["-R", full], () => {}); // reveal in Finder
  else execFile(process.platform === "win32" ? "explorer" : "xdg-open", [full], () => {});
  return Response.json({ ok: true });
}
