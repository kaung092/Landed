import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAsset } from "@/lib/config";

export const dynamic = "force-dynamic";

// Extensions we preview inline as text in the browser; everything else streams (pdf inline, rest download).
const TEXT_EXT = new Set([
  ".md", ".txt", ".json", ".csv", ".mjs", ".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".yml", ".yaml", ".log", ".env",
]);

// GET /api/assets/file?path=... — read a file under ASSET_ROOT: text/markdown as JSON for inline
// preview, pdf streamed inline, anything else as a download.
export async function GET(request: Request) {
  const rel = new URL(request.url).searchParams.get("path");
  if (!rel) return Response.json({ error: "missing path" }, { status: 400 });
  const full = resolveAsset(rel);
  if (!full) return Response.json({ error: "invalid path" }, { status: 400 });
  const ext = path.extname(full).toLowerCase();
  try {
    if (TEXT_EXT.has(ext)) {
      const content = await readFile(full, "utf8");
      return Response.json({ path: rel, kind: "text", content });
    }
    const buf = await readFile(full);
    const type = ext === ".pdf" ? "application/pdf" : "application/octet-stream";
    const disp = ext === ".pdf" ? "inline" : "attachment";
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": type,
        "content-disposition": `${disp}; filename=${JSON.stringify(path.basename(full))}`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 404 });
  }
}
