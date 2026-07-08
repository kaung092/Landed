import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { jobDef } from "@/lib/jobs/registry";
import { CLAUDE_BIN, mcpConfigPath, claudeEnv, baseArgs } from "@/lib/agents/claude-code";
import { drainPrompt } from "@/lib/agents/personas";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // a full queue drain + tool calls can run for minutes

// POST /api/agents/live  body: { type, message?, sessionId? }
// Launch (or resume) a Claude Code agent scoped to one job type and STREAM everything it does back to
// the browser as Server-Sent Events — assistant text, every MCP tool call, tool results, and the
// final result. This is the live, conversational version of /api/agents/run: same MCP server + asset
// access, runs on the OAuth subscription, but you watch (and can steer) it in real time.
//
// First message of a conversation: omit `sessionId` (we mint one and emit it back), and omit
// `message` to use the type's "drain the queue" kickoff. Later turns: pass the `sessionId` to resume
// (`-r`) and a `message` to steer. The client aborts the fetch to stop the run (we kill the child).
//
// Emitted SSE frames (one JSON object per `data:` line):
//   { kind: "session", sessionId }                         — resume handle (first thing out)
//   { kind: "text", text }                                 — a chunk of assistant prose
//   { kind: "tool", name, input }                          — an MCP/native tool call
//   { kind: "tool_result", ok, preview }                   — that tool's result (truncated)
//   { kind: "result", text, isError, costUsd, turns }      — the turn finished
//   { kind: "error", message }  |  { kind: "exit", code }  — failure / process end

const PREVIEW = 2000; // cap tool-result text we forward, so a big listApplications doesn't flood the UI
const IDLE_MS = 300_000; // kill a run that emits nothing for 5 min (stalled tool/model) so it can't spin forever

export async function POST(request: Request) {
  let body: { type?: string; message?: string; sessionId?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const type = body.type;
  if (!type || !jobDef(type)) return Response.json({ error: `unknown or missing type: ${type}` }, { status: 400 });

  const sid = body.sessionId || randomUUID();
  const prompt = body.message?.trim() || drainPrompt(type);
  const args = [
    "-p", prompt,
    ...(body.sessionId ? ["-r", body.sessionId] : ["--session-id", sid]),
    "--output-format", "stream-json",
    "--verbose", // required by the CLI for stream-json in print (-p) mode
    ...baseArgs(mcpConfigPath()),
  ];

  const child = spawn(CLAUDE_BIN, args, { cwd: process.cwd(), env: claudeEnv() });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* stream gone */ }
      };
      const close = () => { if (closed) return; closed = true; try { controller.close(); } catch { /* already closed */ } };

      // Resume handle first, so the client can continue this conversation even before any output.
      send({ kind: "session", sessionId: sid });

      // Idle watchdog: a hung tool/model would otherwise keep the stream open forever (the "stuck
      // spinning" symptom). If nothing is emitted for IDLE_MS, kill the child so the run ends and the
      // robot stops spinning. Reset on every chunk of output.
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const bumpIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          send({ kind: "error", message: `no activity for ${Math.round(IDLE_MS / 60000)} min — stopping the stalled run.` });
          try { child.kill("SIGTERM"); } catch { /* already gone */ }
        }, IDLE_MS);
      };
      const clearIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };

      // Kill the child if the client disconnects / hits Stop (aborts the fetch).
      const onAbort = () => { clearIdle(); try { child.kill("SIGTERM"); } catch { /* already gone */ } };
      request.signal.addEventListener("abort", onAbort);

      // Parse the CLI's stream-json (newline-delimited JSON) into our simplified SSE events.
      let buf = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        bumpIdle();
        buf += chunk;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) translate(line, send);
        }
      });

      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (c: string) => { bumpIdle(); stderr += c; });

      bumpIdle(); // arm it before any output arrives

      child.on("error", (e) => { clearIdle(); send({ kind: "error", message: `failed to launch claude: ${e.message}` }); close(); });
      child.on("close", (code) => {
        clearIdle();
        if (buf.trim()) translate(buf.trim(), send); // flush a trailing partial line
        if (code && code !== 0 && stderr.trim()) send({ kind: "error", message: stderr.trim().slice(0, 600) });
        send({ kind: "exit", code: code ?? 0 });
        request.signal.removeEventListener("abort", onAbort);
        close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// Map one CLI stream-json line to zero+ outbound SSE events.
function translate(line: string, send: (obj: unknown) => void) {
  let msg: Record<string, unknown>;
  try { msg = JSON.parse(line); } catch { return; } // ignore non-JSON noise
  const t = msg.type;

  if (t === "system" && msg.subtype === "init") {
    if (msg.session_id) send({ kind: "session", sessionId: msg.session_id, model: typeof msg.model === "string" ? msg.model : undefined });
    return;
  }

  if (t === "assistant") {
    const content = (msg.message as { content?: unknown[] } | undefined)?.content ?? [];
    for (const block of content as Record<string, unknown>[]) {
      if (block.type === "text" && typeof block.text === "string") send({ kind: "text", text: block.text });
      else if (block.type === "tool_use") send({ kind: "tool", name: block.name, input: block.input });
    }
    return;
  }

  if (t === "user") {
    const content = (msg.message as { content?: unknown[] } | undefined)?.content ?? [];
    for (const block of content as Record<string, unknown>[]) {
      if (block.type === "tool_result") {
        send({ kind: "tool_result", ok: !block.is_error, preview: previewOf(block.content) });
      }
    }
    return;
  }

  if (t === "result") {
    // `usage.input_tokens + cache_read_input_tokens` on the final turn ≈ the whole context the model
    // was fed for a resumed session — i.e. how big this agent's context has grown. Surface it so a
    // long-lived session's context pressure is visible instead of silent (the CLI auto-compacts, but
    // gives no warning).
    const usage = (msg.usage ?? {}) as Record<string, unknown>;
    const inTok = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
    const cacheTok = typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0;
    send({
      kind: "result",
      text: typeof msg.result === "string" ? msg.result : "",
      isError: !!msg.is_error,
      costUsd: typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : undefined,
      turns: typeof msg.num_turns === "number" ? msg.num_turns : undefined,
      contextTokens: inTok + cacheTok || undefined,
    });
  }
}

// A short, plain-text preview of a tool_result's content (string or content-block array).
function previewOf(content: unknown): string {
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content
      .map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : ""))
      .filter(Boolean)
      .join("\n");
  } else if (content != null) {
    text = JSON.stringify(content);
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > PREVIEW ? `${text.slice(0, PREVIEW)}…` : text;
}
