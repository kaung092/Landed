// One-time: open a dedicated Chrome profile and let you log into LinkedIn, so the LinkedIn Scout
// agent's Playwright MCP (same profile) can read authenticated recommended feeds + full JDs.
// Run: LINKEDIN_PROFILE_DIR=./data/linkedin-profile npm run linkedin:login   (or set it in .env)
import path from "node:path";
import { chromium } from "playwright";

const dir = process.env.LINKEDIN_PROFILE_DIR || path.join(process.cwd(), "data", "linkedin-profile");
console.log(`\nOpening Chrome with the LinkedIn profile at:\n  ${dir}\n`);

const ctx = await chromium.launchPersistentContext(dir, { headless: false, channel: "chrome", viewport: null });
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto("https://www.linkedin.com/feed/").catch(() => {});

console.log("→ Log into LinkedIn in the window that just opened.");
console.log("→ When you can see your feed, come back here and press Enter to save the session and close.\n");

process.stdin.resume();
process.stdin.once("data", async () => {
  await ctx.close().catch(() => {});
  console.log("Saved. The LinkedIn Scout can now use this profile. (Set LINKEDIN_PROFILE_DIR in .env, then restart the app.)");
  process.exit(0);
});
