import { ASSET_ROOT, INSTRUCTIONS_ROOT } from "@/lib/config";

export const dynamic = "force-dynamic";

// GET /api/config/paths — the resolved asset/instructions roots, for display on the settings page.
// Read-only: relocating ASSET_ROOT is a .env edit + restart (it's an import-time constant).
export async function GET() {
  return Response.json({ assetRoot: ASSET_ROOT, instructionsRoot: INSTRUCTIONS_ROOT });
}
