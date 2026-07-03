"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Holds every live agent conversation ABOVE the page tree (mounted in the root layout), so chats —
// and any in-flight stream — survive navigating between pages. Without this, the chat lived inside
// the CoWork page and got torn down (losing the transcript and killing the run) on every navigation.
// Transcripts + session ids also persist to localStorage so they survive a full reload.

export type Entry =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; at?: string } // at = ISO time the message started
  | { id: number; role: "tool"; name: string; input: unknown; result?: { ok: boolean; preview: string } }
  | { id: number; role: "note"; text: string; error?: boolean };

export type ChatState = { entries: Entry[]; sessionId: string | null; running: boolean };
const EMPTY: ChatState = { entries: [], sessionId: null, running: false };

const ENTRIES_PREFIX = "landed.agent.entries.";
const SESSION_PREFIX = "landed.agent.session.";

// Rehydrate all persisted chats from localStorage at mount (keys written below).
function loadInitial(): Record<string, ChatState> {
  if (typeof window === "undefined") return {};
  const out: Record<string, ChatState> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(ENTRIES_PREFIX)) continue;
    const type = k.slice(ENTRIES_PREFIX.length);
    let entries: Entry[] = [];
    try { const a = JSON.parse(localStorage.getItem(k) || "[]"); if (Array.isArray(a)) entries = a; } catch { /* ignore */ }
    out[type] = { entries, sessionId: localStorage.getItem(SESSION_PREFIX + type), running: false };
  }
  return out;
}

type Ctx = {
  get: (type: string) => ChatState;
  lastEventAt: (type: string) => number | undefined; // ms epoch of this agent's last stream event
  open: string | null;
  setOpen: (t: string | null) => void;
  start: (type: string, message?: string) => void;
  stop: (type: string) => void;
  clear: (type: string) => void;
};

const AgentChatsContext = createContext<Ctx | null>(null);

export function useAgentChats(): Ctx {
  const c = useContext(AgentChatsContext);
  if (!c) throw new Error("useAgentChats must be used within AgentChatsProvider");
  return c;
}

export default function AgentChatsProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Record<string, ChatState>>(loadInitial);
  const [open, setOpen] = useState<string | null>(null);
  const chatsRef = useRef(chats);
  const aborts = useRef<Record<string, AbortController | null>>({});
  const lastEventRef = useRef<Record<string, number>>({}); // last stream-event time per agent (stall detection)
  // One monotonic id source, seeded past any restored history so React keys never collide.
  const idRef = useRef(Object.values(chats).flatMap((c) => c.entries).reduce((m, e) => Math.max(m, e.id), 0));
  const nextId = () => ++idRef.current;

  useEffect(() => { chatsRef.current = chats; }, [chats]);
  // Debounced persistence: coalesce the burst of stream updates into one write per idle tick.
  useEffect(() => {
    const id = setTimeout(() => {
      for (const [type, c] of Object.entries(chats)) {
        try {
          localStorage.setItem(ENTRIES_PREFIX + type, JSON.stringify(c.entries.slice(-400)));
          if (c.sessionId) localStorage.setItem(SESSION_PREFIX + type, c.sessionId);
        } catch { /* quota — skip */ }
      }
    }, 400);
    return () => clearTimeout(id);
  }, [chats]);

  const patch = useCallback((type: string, fn: (c: ChatState) => ChatState) => {
    setChats((prev) => ({ ...prev, [type]: fn(prev[type] ?? EMPTY) }));
  }, []);

  const pushNote = useCallback((type: string, text: string, error = false) => {
    patch(type, (c) => ({ ...c, entries: [...c.entries, { id: nextId(), role: "note", text, error }] }));
  }, [patch]);

  // One SSE frame → transcript update for `type`.
  const handleEvent = useCallback((type: string, e: { kind: string; [k: string]: unknown }) => {
    lastEventRef.current[type] = Date.now(); // any frame = the run is alive (resets the stall clock)
    switch (e.kind) {
      case "session":
        if (typeof e.sessionId === "string") patch(type, (c) => ({ ...c, sessionId: e.sessionId as string }));
        break;
      case "text":
        patch(type, (c) => {
          const last = c.entries[c.entries.length - 1];
          if (last?.role === "assistant") return { ...c, entries: [...c.entries.slice(0, -1), { ...last, text: last.text + String(e.text) }] };
          return { ...c, entries: [...c.entries, { id: nextId(), role: "assistant", text: String(e.text), at: new Date().toISOString() }] };
        });
        break;
      case "tool":
        patch(type, (c) => ({ ...c, entries: [...c.entries, { id: nextId(), role: "tool", name: String(e.name), input: e.input }] }));
        break;
      case "tool_result":
        patch(type, (c) => {
          const es = [...c.entries];
          for (let i = es.length - 1; i >= 0; i--) {
            const en = es[i];
            if (en.role === "tool" && !en.result) { es[i] = { ...en, result: { ok: !!e.ok, preview: String(e.preview ?? "") } }; break; }
          }
          return { ...c, entries: es };
        });
        break;
      case "result":
        if (e.isError) pushNote(type, typeof e.text === "string" && e.text ? e.text : "the agent reported an error", true);
        break;
      case "error": {
        const msg = String(e.message ?? "error");
        // A resume that references a session Claude no longer has → drop the stale id so the next run
        // (or a steer) starts fresh instead of failing the same way.
        if (/no conversation found/i.test(msg)) {
          patch(type, (c) => ({ ...c, sessionId: null }));
          try { localStorage.removeItem(SESSION_PREFIX + type); } catch { /* ignore */ }
          pushNote(type, "the previous session expired — cleared it. Click “Work queue” to start fresh.", true);
        } else {
          pushNote(type, msg, true);
        }
        break;
      }
      case "exit":
        if (e.code && e.code !== 0) pushNote(type, `agent exited (code ${e.code})`, true);
        break;
    }
  }, [patch, pushNote]);

  const start = useCallback((type: string, message?: string) => {
    // Don't double-spawn a genuinely-running agent (two rapid clicks — e.g. the floating button + the
    // Agents page). BUT a leftover AbortController with no live run (a wedged previous start) must NOT
    // block a fresh start — that's the "won't start" bug — so clear it and proceed instead of no-op'ing.
    if (chatsRef.current[type]?.running) return;
    if (aborts.current[type]) { try { aborts.current[type]!.abort(); } catch { /* already done */ } aborts.current[type] = null; }
    const ac = new AbortController();
    aborts.current[type] = ac;
    lastEventRef.current[type] = Date.now(); // start the stall clock at launch
    patch(type, (c) => ({
      ...c,
      running: true,
      entries: message ? [...c.entries, { id: nextId(), role: "user", text: message }] : c.entries,
    }));
    (async () => {
      try {
        const res = await fetch("/api/agents/live", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Resume the conversation ONLY when steering (a typed message). A bare "Work queue" drain
          // starts a FRESH session — otherwise it tries to resume a stored sessionId that may no longer
          // exist on Claude's side (after a restart), which fails with "No conversation found" and the
          // agent can't start at all. (The server mints + returns a new id, which we then store.)
          body: JSON.stringify({ type, message, sessionId: message ? (chatsRef.current[type]?.sessionId ?? undefined) : undefined }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({}));
          pushNote(type, err.error || `failed to start (${res.status})`, true);
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            try { handleEvent(type, JSON.parse(dataLine.slice(5).trim())); } catch { /* skip malformed */ }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") pushNote(type, String((err as Error).message ?? err), true);
      } finally {
        patch(type, (c) => ({ ...c, running: false }));
        aborts.current[type] = null;
      }
    })();
  }, [patch, pushNote, handleEvent]);

  // Abort the stream AND force `running` false + clear the controller immediately — don't rely solely
  // on the fetch's `finally` (a wedged/already-dead stream might never reach it, leaving Stop stuck and
  // the agent un-restartable). The fetch's own finally is idempotent with this.
  const stop = useCallback((type: string) => {
    aborts.current[type]?.abort();
    aborts.current[type] = null;
    patch(type, (c) => ({ ...c, running: false }));
  }, [patch]);

  const clear = useCallback((type: string) => {
    aborts.current[type]?.abort();
    setChats((prev) => { const n = { ...prev }; delete n[type]; return n; });
    try { localStorage.removeItem(ENTRIES_PREFIX + type); localStorage.removeItem(SESSION_PREFIX + type); } catch { /* ignore */ }
  }, []);

  const get = useCallback((type: string) => chats[type] ?? EMPTY, [chats]);
  const lastEventAt = useCallback((type: string) => lastEventRef.current[type], []);

  return (
    <AgentChatsContext.Provider value={{ get, lastEventAt, open, setOpen, start, stop, clear }}>
      {children}
    </AgentChatsContext.Provider>
  );
}
