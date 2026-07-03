"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, User, Trash2, PanelRightClose } from "lucide-react";

// A full-height chat with a headless Claude Code agent (runs on your subscription, has the jobhunt
// MCP server + asset-folder access). Designed to fill a docked side panel. Keyed by `storageId` so
// each company's chat persists separately; `context` is sent on the first turn and appended to the
// agent's system prompt, scoping it to this company so you can iterate and ask questions
// ("give me 3 variations of this problem", "what would the staff bar look like here?").
// `note` = a system line (e.g. "session refreshed") rendered muted + centered, not a chat bubble.
type Msg = { role: "user" | "assistant" | "note"; text: string; error?: boolean };

export default function PrepChat({
  storageId,
  context,
  placeholder = "Ask Claude Code…  (Enter to send, Shift+Enter for newline)",
  intro,
  onCollapse,
}: {
  storageId: string; // stable per company — keys the persisted history + session
  context: string; // appended to the system prompt on the first turn (company + loop + questions)
  placeholder?: string;
  intro?: string; // empty-state hint
  onCollapse?: () => void; // show a collapse control in the header
}) {
  const MSGS_KEY = `landed.prepchat.${storageId}.msgs`;
  const SID_KEY = `landed.prepchat.${storageId}.sid`;

  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try { const a = JSON.parse(localStorage.getItem(MSGS_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sid, setSid] = useState<string | null>(() => (typeof window === "undefined" ? null : localStorage.getItem(SID_KEY)));
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy]);
  useEffect(() => {
    try { localStorage.setItem(MSGS_KEY, JSON.stringify(msgs.slice(-200))); } catch { /* quota — skip */ }
  }, [msgs, MSGS_KEY]);
  useEffect(() => { if (sid) localStorage.setItem(SID_KEY, sid); }, [sid, SID_KEY]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Always send the scope: it seeds the first turn AND any background recovery (if the session
        // died, the server starts a fresh one re-seeded with this context).
        body: JSON.stringify({ message: text, sessionId: sid, context }),
      });
      const d = await r.json();
      if (d.sessionId) setSid(d.sessionId);
      setMsgs((m) => [
        ...m,
        ...(d.recovered ? [{ role: "note" as const, text: "↻ The previous session had expired — refreshed it automatically. Your history above is kept here." }] : []),
        { role: "assistant" as const, text: d.reply || d.error || "(no reply)", error: !!d.error || !!d.isError },
      ]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Couldn't reach Claude Code.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setMsgs([]);
    setSid(null);
    try { localStorage.removeItem(MSGS_KEY); localStorage.removeItem(SID_KEY); } catch { /* ignore */ }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950/40">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800/60 px-4 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 ring-1 ring-sky-500/30"><Bot size={12} className="text-sky-300" /></span>
        <h3 className="text-[13px] font-semibold text-zinc-100">Claude Code</h3>
        <span className="ml-auto text-[11px] text-zinc-500">{sid ? "session live" : "new session"}</span>
        {msgs.length > 0 && (
          <button onClick={reset} title="Clear this chat" className="rounded p-1 text-zinc-600 transition hover:bg-zinc-800 hover:text-rose-300">
            <Trash2 size={12} />
          </button>
        )}
        {onCollapse && (
          <button onClick={onCollapse} title="Collapse chat" className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200">
            <PanelRightClose size={14} />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && (
          <p className="py-6 text-center text-[12px] leading-relaxed text-zinc-500">{intro ?? "Chat with Claude Code about this company — it has your tracker, postings, and résumé tools."}</p>
        )}
        {msgs.map((m, i) =>
          m.role === "note" ? (
            <p key={i} className="px-2 py-1 text-center text-[11px] leading-relaxed text-zinc-600">{m.text}</p>
          ) : (
            <div key={i} className={`flex items-start gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ${m.role === "user" ? "bg-zinc-700 ring-zinc-600" : "bg-sky-500/15 ring-sky-500/30"}`}>
                {m.role === "user" ? <User size={12} className="text-zinc-300" /> : <Bot size={12} className="text-sky-300" />}
              </span>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-[12px] leading-relaxed ${
                m.role === "user" ? "rounded-br-md bg-sky-600 text-white" : m.error ? "rounded-bl-md bg-rose-500/20 text-rose-100" : "rounded-bl-md bg-zinc-800 text-zinc-100"
              }`}>
                {m.text}
              </div>
            </div>
          )
        )}
        {busy && (
          <div className="flex items-center gap-2 text-[12px] text-zinc-400">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/15 ring-1 ring-sky-500/30"><Bot size={12} className="text-sky-300" /></span>
            <Loader2 size={13} className="animate-spin" /> thinking…
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-zinc-800/60 px-3 py-2.5">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder={placeholder}
          className="max-h-32 flex-1 resize-none rounded-xl bg-zinc-900 px-3 py-2 text-[13px] text-zinc-100 outline-none ring-1 ring-inset ring-zinc-800 placeholder:text-zinc-600 focus:ring-sky-500/40"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white transition enabled:hover:bg-sky-500 disabled:opacity-40"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}
