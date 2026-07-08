import fs from "node:fs";
import path from "node:path";
import { ASSET_ROOT } from "@/lib/config";

// Shared setup for launching the local `claude` CLI as a headless agent on the user's SUBSCRIPTION
// (OAuth, no metered API). Used by the one-shot drain runner and the interactive chat endpoint.

export const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

// Write (idempotently) an MCP config pointing the run at the jobhunt server, labeled "Claude Code"
// so its activity shows up as a distinct agent in the CoWork view. Returns the file path.
export function mcpConfigPath(): string {
  const root = process.cwd();
  const dataDir = path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const p = path.join(dataDir, "claude-code.mcp.json");

  const mcpServers: Record<string, unknown> = {
    jobhunt: {
      command: process.execPath,
      args: [path.join(root, "mcp", "jobhunt-server.mjs")],
      env: { JOBHUNT_THREAD_LABEL: "Claude Code", JOBHUNT_URL: process.env.JOBHUNT_URL || "http://localhost:3000" },
    },
  };

  // Opt-in browser control (for linkedin-import): a Playwright MCP driving a PERSISTENT Chrome profile
  // that stays logged into LinkedIn. Wired in ONLY when LINKEDIN_PROFILE_DIR is set, so the other
  // agents (fit/tailoring/…) aren't burdened with a browser server they never use. Seed the profile's
  // login once with `npm run linkedin:login`.
  const profile = process.env.LINKEDIN_PROFILE_DIR;
  if (profile) {
    mcpServers.playwright = {
      command: process.execPath,
      args: [path.join(root, "node_modules", "@playwright", "mcp", "cli.js"), "--browser", "chrome", "--user-data-dir", profile],
      env: {},
    };
  }

  fs.writeFileSync(p, JSON.stringify({ mcpServers }, null, 2));
  return p;
}

// Env for the spawned run: drop ANTHROPIC_API_KEY (else it overrides OAuth and bills per-token) and
// make sure ~/.local/bin (where `claude` lives) is on PATH under launchd's minimal environment.
export function claudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  env.PATH = `${env.HOME}/.local/bin:${env.PATH ?? ""}`;
  return env;
}

// Flags shared by every headless run: which MCP servers (only jobhunt), no interactive permission
// prompts, and write access to the asset folder for résumé tailoring.
export const baseArgs = (mcp: string): string[] => [
  "--mcp-config", mcp,
  "--strict-mcp-config",
  "--permission-mode", "bypassPermissions",
  "--add-dir", ASSET_ROOT,
];
