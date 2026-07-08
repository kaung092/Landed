// Headless levels.fyi leveling scraper — the Claude-Code route's replacement for the "Claude in
// Chrome geometry method" (which needs an attached browser the CoWork/queue context doesn't have).
// Drives headless Chromium via Playwright, reads each level bar's DOM geometry (getBoundingClientRect
// — exact, not pixel-guessed), self-calibrates against Amazon's L4→L8, and emits the `leveling` object
// the leveling job feeds to upsertCompanies. No paid API.
//
//   node scripts/levels-scrape.mjs "Snowflake"
//
// stdout = a single JSON object (the `leveling` value):
//   { "source":"levels.fyi-geometry", "ladder":{...}, "titles":{...} }   ← has a ladder
//   { "source":"none", "note":"Amazon rendered; <Co> has no column (<date>)" }  ← confirmed no ladder
//   { "error":"...", "retryable":true }  (+ exit 1)  ← couldn't load (try again / different token)
// Diagnostics go to stderr so stdout stays parseable.
import { chromium } from "playwright";

const COMPANY = process.argv[2];
if (!COMPANY) { console.error('usage: node scripts/levels-scrape.mjs "<Company>"'); process.exit(2); }
const URL = `https://www.levels.fyi/?tab=levels&compare=Amazon,${encodeURIComponent(COMPANY)}`;

const emitErr = (msg, retryable = true) => { console.log(JSON.stringify({ error: msg, retryable })); };

function groupByCol(all) {
  const byX = new Map();
  for (const b of all) (byX.get(b.colX) ?? byX.set(b.colX, []).get(b.colX)).push(b);
  return [...byX.values()];
}
function levelingFor(amazon, co) {
  const aL4 = amazon.find((b) => b.code === "L4"), aL8 = amazon.find((b) => b.code === "L8");
  const scale = (y) => 1 + (y - aL4.top) * (9.3 - 1) / (aL8.bottom - aL4.top);
  const round = (n) => Math.round(n * 10) / 10;
  const ladder = {}, titles = {};
  for (const b of [...co].sort((a, b) => a.top - b.top)) {
    ladder[b.code] = [round(scale(b.top)), round(scale(b.bottom))];
    if (b.title) titles[b.code] = b.title;
  }
  return { source: "levels.fyi-geometry", ladder, titles };
}
const noneResult = () => ({ source: "none", note: `Amazon renders but ${COMPANY} has no levels.fyi column (${new Date().toISOString().slice(0, 10)})` });

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      viewport: { width: 1440, height: 1700 },
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Every level bar = a <button> with a colored bg whose text carries a code — the code may lead
    // (Snowflake "IC3 Senior…") or trail (Amazon "SDE II L5"). Codes vary by company: L# (Amazon),
    // IC# (Snowflake), E# (Meta E3–E9), and L#-with-suffix (Confluent L5a/L5b) — match all of them so
    // an unusual ladder isn't dropped as a false "no column".
    const readBars = () => page.evaluate(() => {
      const out = [];
      for (const el of Array.from(document.querySelectorAll("button"))) {
        const bg = getComputedStyle(el).backgroundColor;
        if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") continue;
        const t = (el.innerText || "").replace(/\s+/g, " ").trim();
        const m = t.match(/\b(IC\d+|E\d+|L\d+[a-z]?)\b/);
        if (!m) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 10) continue;
        out.push({ code: m[1], title: t.replace(m[0], "").replace(/\s+/g, " ").trim(), colX: Math.round(r.x), top: r.top, bottom: r.bottom });
      }
      return out;
    });

    // Poll patiently (levels.fyi renders in 30–50s). Ready = Amazon's L4 & L8 anchors present; then give
    // the company column a few extra polls before concluding "no ladder" (the classic false-negative is
    // sampling before the slow company column resolves).
    let amazonReady = false, coMissingPolls = 0;
    for (let i = 0; i < 45; i++) {
      const groups = groupByCol(await readBars());
      const amazon = groups.find((g) => g.some((b) => b.code === "L4") && g.some((b) => b.code === "L8"));
      if (amazon) {
        amazonReady = true;
        const co = groups.filter((g) => g !== amazon).sort((a, b) => b.length - a.length)[0];
        if (co && co.length >= 1) {
          const lv = levelingFor(amazon, co);
          console.error(`OK ${COMPANY}: ${Object.keys(lv.ladder).length} rungs (${Object.keys(lv.ladder).join(",")})`);
          return console.log(JSON.stringify(lv));
        }
        if (++coMissingPolls >= 8) { console.error(`NONE ${COMPANY}: Amazon rendered, no company column`); return console.log(JSON.stringify(noneResult())); }
      }
      await page.waitForTimeout(1500);
    }
    if (!amazonReady) { emitErr("Amazon anchor never rendered (levels.fyi slow/blocked) — retry", true); process.exitCode = 1; return; }
    console.error(`NONE ${COMPANY}: Amazon rendered, no company column (budget exhausted)`);
    console.log(JSON.stringify(noneResult()));
  } finally {
    await browser.close();
  }
}

try { await run(); } catch (e) { emitErr(String(e?.message ?? e), true); process.exitCode = 1; }
