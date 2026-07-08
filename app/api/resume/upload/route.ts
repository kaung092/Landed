import { mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { PATHS } from "@/lib/config";

export const dynamic = "force-dynamic";

// GET /api/resume/upload — status of the base résumé docx (the tailoring source of truth).
export async function GET() {
  const dest = PATHS.baseResume("docx");
  if (!existsSync(dest)) return Response.json({ exists: false, name: path.basename(dest) });
  const s = await stat(dest);
  return Response.json({ exists: true, name: path.basename(dest), bytes: s.size, mtime: s.mtime.toISOString() });
}

// POST /api/resume/upload — multipart form with `file` (a .docx). Saves it as the base résumé.
// docx only: the docx is the source; the docx+pdf pair is generated PER TAILORED resume by CoWork.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "expected multipart form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "missing file" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".docx"))
    return Response.json({ error: "base résumé must be a .docx" }, { status: 400 });

  const dest = PATHS.baseResume("docx");
  await mkdir(path.dirname(dest), { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(dest, buf);
  return Response.json({ ok: true, name: path.basename(dest), bytes: buf.length });
}
