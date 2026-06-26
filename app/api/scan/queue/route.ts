import { queueStaleWatchlistScans } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

// POST /api/scan/queue  body { staleDays?: number }
// Queues a `watchlist-scan` job per watchlisted company not scraped in the last `staleDays` (default
// 3, or never), skipping any already in the queue. The Scrape-watchlist button calls this so scanning
// runs through the CoWork queue (claim → scanCompany + glance → close), not as an inline app scan.
export async function POST(request: Request) {
  let body: { staleDays?: number };
  try { body = await request.json(); } catch { body = {}; }
  const staleDays = typeof body.staleDays === "number" && body.staleDays >= 0 ? body.staleDays : 3;
  try {
    return Response.json(queueStaleWatchlistScans(staleDays));
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
