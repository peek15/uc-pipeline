"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Trash2, Bot } from "lucide-react";
import { supabase } from "@/lib/db";

// ── Context ──────────────────────────────────────────────
function buildSystem(stories, tab) {
  const counts = {};
  for (const s of stories) counts[s.status] = (counts[s.status] || 0) + 1;
  const bank = stories.filter(s => ["approved","scripted","produced"].includes(s.status)).length;

  const snapshot = stories
    .filter(s => !["rejected","archived"].includes(s.status))
    .slice(0, 25)
    .map(s => `  • "${s.title}" [${s.status}]${s.archetype ? ` · ${s.archetype}` : ""}${s.era ? ` · ${s.era}` : ""} (id:${s.id})`)
    .join("\n");

  return `You are the pipeline agent for Uncle Carter, an NBA storytelling brand at Peek Studios. You help navigate and operate the content production pipeline.

Pipeline state (${new Date().toLocaleDateString()}):
- Active stories: ${stories.filter(s => !["rejected","archived"].includes(s.status)).length} total
- Stages: ${Object.entries(counts).map(([k,v]) => `${k}×${v}`).join(", ")}
- Production bank (approved+scripted+produced): ${bank}
- Current view: ${tab}

Stories:
${snapshot || "(none yet)"}

You can take actions by embedding tags in your response:
  [[nav:pipeline]]  [[nav:research]]  [[nav:script]]
  [[nav:production]]  [[nav:calendar]]  [[nav:analyze]]
  [[story:STORY_ID]]   — open a story's detail panel

When navigating, narrate it: "Taking you to Production —" then include [[nav:production]].
Be concise. One short paragraph max unless detail is specifically requested.`;
}

// ── Helpers ───────────────────────────────────────────────
function stripActions(text) {
  return text.replace(/\[\[nav:\w+\]\]/g, "").replace(/\[\[story:[a-f0-9-]+\]\]/g, "").replace(/  +/g, " ").trim();
}

function parseActions(text) {
  const nav   = text.match(/\[\[nav:(\w+)\]\]/)?.[1] ?? null;
  const story = text.match(/\[\[story:([a-f0-9-]+)\]\]/)?.[1] ?? null;
  return { nav, story };
}

// ── Component ─────────────────────────────────────────────
export default function AgentPanel({ isOpen, onClose, stories, tab, onNavigate, onOpenStory }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const runActions = useCallback((text) => {
    const { nav, story } = parseActions(text);
    if (nav) onNavigate(nav);
    if (story) {
      const s = stories.find(x => x.id === story);
      if (s) onOpenStory(s);
    }
  }, [onNavigate, onOpenStory, stories]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const history = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/agent", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          messages:  history,
          system:    buildSystem(stories, tab),
          maxTokens: 600,
          stream:    true,
        }),
      });

      if (!res.ok) throw new Error(`Agent API ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buf  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              full += ev.delta.text;
              setMessages(m => {
                const next = [...m];
                next[next.length - 1] = { role: "assistant", content: full };
                return next;
              });
            }
          } catch {}
        }
      }
      runActions(full);
    } catch {
      setMessages(m => {
        const next = [...m];
        next[next.length - 1] = { role: "assistant", content: "Something went wrong — try again." };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming, stories, tab, runActions]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <aside style={{
      width: isOpen ? 320 : 0,
      flexShrink: 0,
      overflow: "hidden",
      transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
      background: "var(--bg2)",
      borderLeft: "0.5px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      zIndex: 15,
    }}>
      <div style={{ width: 320, height: "100%", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Bot size={14} color="var(--gold)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", flex: 1 }}>Agent</span>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              title="Clear conversation"
              style={{ width: 24, height: 24, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t4)" }}
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={onClose}
            title="Close (⌘⌥A)"
            style={{ width: 24, height: 24, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)" }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ color: "var(--t4)", fontSize: 12, textAlign: "center", paddingTop: 40, lineHeight: 2 }}>
              Ask about the pipeline,<br />navigate views, or kick off<br />a production step.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "88%",
                padding: "8px 11px",
                borderRadius: m.role === "user" ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
                background: m.role === "user" ? "var(--t1)" : "var(--fill2)",
                color: m.role === "user" ? "var(--bg)" : "var(--t1)",
                fontSize: 13,
                lineHeight: 1.55,
                border: m.role === "assistant" ? "0.5px solid var(--border)" : "none",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {m.role === "assistant" && !m.content && streaming
                  ? <span style={{ color: "var(--t4)", letterSpacing: 2 }}>···</span>
                  : stripActions(m.content)}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div style={{ padding: "10px 12px", borderTop: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask the agent…"
              rows={1}
              style={{
                flex: 1, resize: "none", padding: "8px 10px", borderRadius: 8,
                border: "0.5px solid var(--border-in)", background: "var(--bg)",
                color: "var(--t1)", fontSize: 13, outline: "none",
                fontFamily: "inherit", lineHeight: 1.4,
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || streaming}
              style={{
                width: 32, height: 32, borderRadius: 8, border: "none", flexShrink: 0,
                background: input.trim() && !streaming ? "var(--t1)" : "var(--fill2)",
                color: input.trim() && !streaming ? "var(--bg)" : "var(--t4)",
                cursor: input.trim() && !streaming ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.12s",
              }}
            >
              <Send size={13} />
            </button>
          </div>
        </div>

      </div>
    </aside>
  );
}
