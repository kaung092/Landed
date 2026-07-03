import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { CLAUDE_BIN, mcpConfigPath, claudeEnv, baseArgs } from "@/lib/agents/claude-code";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a turn can take a while (model + tool calls)

const run = promisify(execFile);

// One chat turn. A NEW session (no `resume`) is created with a fixed id and the scoping `context`
// appended to its system prompt; a RESUME continues an existing session (its system prompt is
// already baked in). Returns the parsed Claude Code JSON. Throws on a non-zero exit (the caller
// inspects the message to tell a dead session apart from a real failure).
async function runTurn(opts: { message: string; sid: string; resume: boolean; context?: string }) {
  const args = [
    "-p", opts.message,
    ...(opts.resume ? ["-r", opts.sid] : ["--session-id", opts.sid]),
    ...(!opts.resume && opts.context?.trim() ? ["--append-system-prompt", opts.context.trim()] : []),
    "--output-format", "json",
    ...baseArgs(mcpConfigPath()),
  ];
  const { stdout } = await run(CLAUDE_BIN, args, { cwd: process.cwd(), env: claudeEnv(), maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout) as { session_id?: string; result?: string; is_error?: boolean };
}

// A resume that failed because the session no longer exists (expired / pruned / never persisted) —
// as opposed to a real model/tool error. We recover from THIS by silently starting a fresh session;
// other errors surface as-is so we don't throw away a live session on a transient hiccup.
const isDeadSession = (msg: string) =>
  /no conversation found|session( id)? .*(not found|does not exist|expired|invalid)|--resume|no such session/i.test(msg);

// POST /api/agents/chat  body: { message, sessionId?, context? } — one turn of an INTERACTIVE
// Claude Code chat with the jobhunt MCP server + asset-folder write access. First message omits
// sessionId (we mint one); later messages pass it back to resume the same conversation (`-r`).
//
// `context` scopes the chat (appended to the system prompt when a session is created). ALWAYS send
// it — it's used both on the first turn and on background recovery. If a resume fails because the
// session is dead, we transparently start a fresh, re-seeded session and answer the same message,
// returning `recovered: true` so the client can swap in the new id + show a subtle note. Runs on
// your subscription. Returns { sessionId, reply, isError, recovered? }.
export async function POST(request: Request) {
  let message: string | undefined;
  let sessionId: string | undefined;
  let context: string | undefined;
  try {
    const b = await request.json();
    message = b?.message;
    sessionId = b?.sessionId;
    context = typeof b?.context === "string" ? b.context : undefined;
  } catch {
    // ignore
  }
  if (!message?.trim()) return Response.json({ error: "missing message" }, { status: 400 });

  // First turn — just create a scoped session.
  if (!sessionId) {
    const fresh = randomUUID();
    try {
      const d = await runTurn({ message, sid: fresh, resume: false, context });
      return Response.json({ sessionId: d.session_id ?? fresh, reply: d.result ?? "", isError: !!d.is_error });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return Response.json({ sessionId: fresh, error: `Claude Code run failed: ${msg.slice(0, 400)}`, isError: true });
    }
  }

  // Resume turn — try to continue the session; auto-recover if it's dead.
  try {
    const d = await runTurn({ message, sid: sessionId, resume: true });
    return Response.json({ sessionId: d.session_id ?? sessionId, reply: d.result ?? "", isError: !!d.is_error });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isDeadSession(msg)) {
      // A real failure on a live session — surface it; don't discard the session.
      return Response.json({ sessionId, error: `Claude Code run failed: ${msg.slice(0, 400)}`, isError: true });
    }
    // Session is gone — start a fresh, re-seeded one and answer the same message.
    const fresh = randomUUID();
    try {
      const d = await runTurn({ message, sid: fresh, resume: false, context });
      return Response.json({ sessionId: d.session_id ?? fresh, reply: d.result ?? "", isError: !!d.is_error, recovered: true });
    } catch (e2) {
      const m2 = e2 instanceof Error ? e2.message : String(e2);
      return Response.json({ sessionId: fresh, error: `Claude Code run failed: ${m2.slice(0, 400)}`, isError: true, recovered: true });
    }
  }
}
