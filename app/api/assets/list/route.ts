import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ASSET_ROOT, resolveAsset } from "@/lib/config";

export const dynamic = "force-dynamic";

export type AssetEntry = { name: string; type: "dir" | "file"; bytes: number; mtime: string; path: string };

// GET /api/assets/list?path=interview-prep — the immediate children of a folder under ASSET_ROOT
// (empty path = the asset root itself). Backs the settings-page asset browser (lazy, one level).
export async function GET(request: Request) {
  const rel = new URL(request.url).searchParams.get("path") ?? "";
  const dir = rel ? resolveAsset(rel) : ASSET_ROOT;
  if (!dir) return Response.json({ error: "invalid path" }, { status: 400 });
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const out: AssetEntry[] = [];
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const s = await stat(path.join(dir, e.name));
      out.push({
        name: e.name,
        type: e.isDirectory() ? "dir" : "file",
        bytes: e.isDirectory() ? 0 : s.size,
        mtime: s.mtime.toISOString(),
        path: childRel,
      });
    }
    // Folders first, then files, each alphabetical.
    out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    return Response.json({ path: rel, root: ASSET_ROOT, entries: out });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 404 });
  }
}
