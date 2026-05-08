"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Trash2, Bot, Paperclip, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/db";
import { usePersistentState } from "@/lib/usePersistentState";
import { getAiCalls } from "@/lib/ai/audit";
import { formatCost } from "@/lib/ai/costs";
import { getBrandContentType, getBrandName } from "@/lib/brandConfig";

// ── Model registry ────────────────────────────────────────
const MODELS = [
  { id: "claude-sonnet-4-6",         provider: "anthropic", label: "Sonnet 4.6", desc: "Smart · fast"    },
  { id: "claude-opus-4-7",           provider: "anthropic", label: "Opus 4.7",   desc: "Most capable"   },
  { id: "claude-haiku-4-5-20251001", provider: "anthropic", label: "Haiku 4.5",  desc: "Fastest · cheap" },
  { id: "gpt-4o",                    provider: "openai",    label: "GPT-4o",      desc: "Vision · strong" },
  { id: "gpt-4o-mini",               provider: "openai",    label: "GPT-4o mini", desc: "Fast · cheap"   },
];
const PROVIDER_LABEL = { anthropic: "Claude", openai: "OpenAI" };

const SUGGESTIONS = [
  "What's the pipeline status?",
  "Which stories are ready to script?",
  "Check the production bank",
  "What should we research next?",
];

// ── Pipeline context ──────────────────────────────────────
function buildSystem(stories, tab, metrics, settings) {
  const brandName  = getBrandName(settings);
  const contentType = getBrandContentType(settings);
  const counts = {};
  for (const s of stories) counts[s.status] = (counts[s.status] || 0) + 1;
  const bank = stories.filter(s => ["approved","scripted","produced"].includes(s.status)).length;
  const snapshot = stories
    .filter(s => !["rejected","archived"].includes(s.status))
    .slice(0, 25)
    .map(s => {
      const gate = s.quality_gate_status ? ` [gate:${s.quality_gate_status}]` : "";
      return `  • "${s.title}" [${s.status}]${gate}${s.archetype ? ` · ${s.archetype}` : ""}${s.era ? ` · ${s.era}` : ""} (id:${s.id})`;
    })
    .join("\n");

  const metricsBlock = metrics
    ? `\nAI usage (7d): ${metrics.calls} calls · ${metrics.cost} · ${metrics.failed} failures · top: ${metrics.byType}`
    : "";

  return `You are the pipeline agent for ${brandName}, a ${contentType} content pipeline at Peek Studios.

Pipeline state (${new Date().toLocaleDateString()}):
- Active: ${stories.filter(s => !["rejected","archived"].includes(s.status)).length} · Stages: ${Object.entries(counts).map(([k,v]) => `${k}×${v}`).join(", ")}
- Production bank (approved+scripted+produced): ${bank}
- Current view: ${tab}
${metricsBlock}
Stories:
${snapshot || "(none yet)"}

Navigation — embed to trigger:
  [[nav:pipeline]]  [[nav:research]]  [[nav:create]]  [[nav:calendar]]  [[nav:analyze]]
  [[story:STORY_ID]]  — open story detail

Write actions — ONLY when user explicitly asks:
  [[approve:STORY_ID]]       — move to "approved"
  [[reject:STORY_ID]]        — move to "rejected"
  [[stage:STORY_ID:STATUS]]  — move to: research / scripted / produced / approved / rejected / archived

Rules:
- Narrate every action by title before embedding the tag
- One tag per response unless asked for bulk
- Format with **bold** for key names and bullet lists for multiple items
- Be concise — 2-3 sentences unless more detail is requested`;
}

// ── Action parsing ────────────────────────────────────────
function stripActions(text) {
  return text
    .replace(/\[\[nav:\w+\]\]/g, "")
    .replace(/\[\[story:[a-f0-9-]+\]\]/g, "")
    .replace(/\[\[approve:[a-f0-9-]+\]\]/g, "")
    .replace(/\[\[reject:[a-f0-9-]+\]\]/g, "")
    .replace(/\[\[stage:[a-f0-9-]+:\w+\]\]/g, "")
    .replace(/  +/g, " ").trim();
}

function parseActions(text) {
  const stageMatch = text.match(/\[\[stage:([a-f0-9-]+):(\w+)\]\]/);
  return {
    nav:     text.match(/\[\[nav:(\w+)\]\]/)?.[1]            ?? null,
    story:   text.match(/\[\[story:([a-f0-9-]+)\]\]/)?.[1]   ?? null,
    approve: text.match(/\[\[approve:([a-f0-9-]+)\]\]/)?.[1] ?? null,
    reject:  text.match(/\[\[reject:([a-f0-9-]+)\]\]/)?.[1]  ?? null,
    stageId: stageMatch?.[1] ?? null,
    stageTo: stageMatch?.[2] ?? null,
  };
}

// ── Markdown renderer ─────────────────────────────────────
function fmt(text, keyPrefix = "") {
  const re = /\*\*(.+?)\*\*|`([^`\n]+)`/g;
  const parts = [];
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] != null) parts.push(<strong key={keyPrefix + m.index} style={{ fontWeight: 600 }}>{m[1]}</strong>);
    else if (m[2] != null) parts.push(
      <code key={keyPrefix + m.index} style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em", background: "rgba(128,128,128,0.15)", padding: "1px 5px", borderRadius: 3, letterSpacing: 0 }}>{m[2]}</code>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

function Markdown({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  const output = [];
  let listBuf = [];
  let key = 0;

  const flushList = () => {
    if (!listBuf.length) return;
    output.push(
      <ul key={key++} style={{ paddingLeft: 16, margin: "4px 0", display: "flex", flexDirection: "column", gap: 2 }}>
        {listBuf.map((t, i) => <li key={i} style={{ lineHeight: 1.5 }}>{fmt(t, `li${i}`)}</li>)}
      </ul>
    );
    listBuf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*•]\s+/.test(trimmed)) {
      listBuf.push(trimmed.replace(/^[-*•]\s+/, ""));
    } else if (/^\d+\.\s+/.test(trimmed)) {
      listBuf.push(trimmed.replace(/^\d+\.\s+/, ""));
    } else {
      flushList();
      if (trimmed) {
        output.push(
          <span key={key++} style={{ display: "block", marginTop: output.length ? 5 : 0, lineHeight: 1.55 }}>
            {fmt(trimmed, `s${key}`)}
          </span>
        );
      } else if (output.length) {
        output.push(<span key={key++} style={{ display: "block", height: 5 }} />);
      }
    }
  }
  flushList();
  return <>{output}</>;
}

// ── Typing indicator ──────────────────────────────────────
function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 0" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "var(--t4)",
          display: "inline-block",
          animation: "pulse 1.2s ease infinite",
          animationDelay: `${i * 0.18}s`,
        }} />
      ))}
    </span>
  );
}

// ── Image helpers ─────────────────────────────────────────
async function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve({ data: r.result.split(",")[1], mimeType: file.type, name: file.name });
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ── Message bubble ────────────────────────────────────────
function Bubble({ m, streaming }) {
  const isUser  = m.role === "user";
  const imgs    = Array.isArray(m.content) ? m.content.filter(p => p.type === "image") : [];
  const rawText = Array.isArray(m.content) ? (m.content.find(p => p.type === "text")?.text ?? "") : (m.content ?? "");
  const text    = isUser ? rawText : stripActions(rawText);
  const isError = !isUser && typeof rawText === "string" && rawText.startsWith("Error:");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "90%",
        padding: "8px 11px",
        borderRadius: isUser ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
        background: isUser ? "var(--t1)" : isError ? "var(--error-bg)" : "var(--fill2)",
        color:      isUser ? "var(--bg)" : isError ? "var(--error)" : "var(--t1)",
        fontSize: 13, lineHeight: 1.55,
        border: isUser ? "none" : isError ? "0.5px solid var(--error-border)" : "0.5px solid var(--border)",
        wordBreak: "break-word",
      }}>
        {imgs.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: text ? 6 : 0 }}>
            {imgs.map((img, i) => (
              <img key={i} src={`data:${img.mimeType};base64,${img.data}`}
                style={{ maxWidth: 130, maxHeight: 100, borderRadius: 5, objectFit: "cover", border: "0.5px solid rgba(0,0,0,0.12)" }} />
            ))}
          </div>
        )}
        {m.role === "assistant" && !text && streaming
          ? <TypingDots />
          : isUser
            ? <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
            : <Markdown text={text} />
        }
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────
export default function AgentPanel({ isOpen, onClose, stories, tab, onNavigate, onOpenStory, onUpdateStory, tenant, settings = null }) {
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState("");
  const [streaming,  setStreaming]  = useState(false);
  const [pending,    setPending]    = useState([]);
  const [modelId,    setModelId]    = usePersistentState("agent_model", "claude-sonnet-4-6");
  const [showPicker, setShowPicker] = useState(false);
  const [providers,  setProviders]  = useState({ anthropic: true, openai: false });
  const [dragOver,   setDragOver]   = useState(false);
  const [metrics,    setMetrics]    = useState(null);

  const scrollRef   = useRef(null);
  const fileRef     = useRef(null);
  const panelRef    = useRef(null);
  const textareaRef = useRef(null);

  // Fetch available providers
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      fetch("/api/agent", { headers }).then(r => r.json()).then(setProviders).catch(() => {});
    });
  }, []);

  // Fetch AI usage metrics once per panel open
  useEffect(() => {
    if (!isOpen || metrics) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    getAiCalls({ limit: 500, workspaceId: tenant?.workspace_id, brandProfileId: tenant?.brand_profile_id }).then(calls => {
      const recent = calls.filter(c => c.created_at && new Date(c.created_at).getTime() >= cutoff);
      const cost   = recent.reduce((s, c) => s + (Number(c.cost_estimate) || 0), 0);
      const byType = Object.entries(
        recent.reduce((acc, c) => { const k = c.type || "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}×${n}`).join(", ");
      setMetrics({ calls: recent.length, cost: formatCost(cost), failed: recent.filter(c => !c.success).length, byType: byType || "none" });
    }).catch(() => {});
  }, [isOpen, metrics, tenant?.workspace_id, tenant?.brand_profile_id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => { if (!panelRef.current?.contains(e.target)) setShowPicker(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const selectedModel = MODELS.find(m => m.id === modelId) || MODELS[0];

  const addImages = useCallback(async (files) => {
    const valid = Array.from(files)
      .filter(f => f.type.startsWith("image/") && f.size <= 5 * 1024 * 1024)
      .slice(0, 4 - pending.length);
    if (!valid.length) return;
    const converted = await Promise.all(valid.map(toBase64));
    setPending(p => [...p, ...converted].slice(0, 4));
  }, [pending.length]);

  const onDrop      = useCallback((e) => { e.preventDefault(); setDragOver(false); addImages(e.dataTransfer.files); }, [addImages]);
  const onDragOver  = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = (e) => { if (!panelRef.current?.contains(e.relatedTarget)) setDragOver(false); };

  const onPaste = useCallback((e) => {
    const files = Array.from(e.clipboardData?.items || [])
      .filter(i => i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); addImages(files); }
  }, [addImages]);

  const handleInput = useCallback((e) => {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }
  }, []);

  const runActions = useCallback((text) => {
    const { nav, story, approve, reject, stageId, stageTo } = parseActions(text);
    if (nav)     onNavigate(nav);
    if (story)   { const s = stories.find(x => x.id === story); if (s) onOpenStory(s); }
    if (approve) onUpdateStory?.(approve, { status: "approved" });
    if (reject)  onUpdateStory?.(reject,  { status: "rejected" });
    if (stageId && stageTo) onUpdateStory?.(stageId, { status: stageTo });
  }, [onNavigate, onOpenStory, onUpdateStory, stories]);

  const send = useCallback(async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if ((!text && !pending.length) || streaming) return;
    setInput("");
    setPending([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const content = pending.length
      ? [...pending.map(img => ({ type: "image", data: img.data, mimeType: img.mimeType })), ...(text ? [{ type: "text", text }] : [])]
      : text;

    const history = [...messages, { role: "user", content }];
    // Trim to last 20 messages to avoid context overflow
    const apiHistory = history.length > 20 ? history.slice(-20) : history;
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({
          provider:  selectedModel.provider,
          model:     modelId,
          messages:  apiHistory,
          system:    buildSystem(stories, tab, metrics, settings),
          maxTokens: 1500,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let full = ""; let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw);
            if (ev.text) {
              full += ev.text;
              setMessages(m => { const n = [...m]; n[n.length - 1] = { role: "assistant", content: full }; return n; });
            }
          } catch {}
        }
      }
      runActions(full);
    } catch (err) {
      setMessages(m => { const n = [...m]; n[n.length - 1] = { role: "assistant", content: `Error: ${err.message}` }; return n; });
    } finally { setStreaming(false); }
  }, [input, pending, messages, streaming, modelId, selectedModel, stories, tab, metrics, settings, runActions]);

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const btnIcon = { width: 24, height: 24, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
  const groups  = Object.entries(MODELS.reduce((acc, m) => { (acc[m.provider] = acc[m.provider] || []).push(m); return acc; }, {}));
  const canSend = (input.trim() || pending.length) && !streaming;

  return (
    <aside
      ref={panelRef}
      onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
      style={{
        width: isOpen ? 320 : 0,
        flexShrink: 0, overflow: "hidden",
        background: dragOver ? "var(--fill2)" : "var(--bg2)",
        borderLeft: `0.5px solid ${dragOver ? "var(--gold)" : "var(--border)"}`,
        display: "flex", flexDirection: "column", zIndex: 15,
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), background 0.1s, border-color 0.1s",
      }}
    >
      <div style={{ width: 320, height: "100%", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, position: "relative" }}>
          <Bot size={14} color="var(--gold)" style={{ flexShrink: 0 }} />

          <button onClick={() => setShowPicker(s => !s)} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "3px 7px",
            borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--fill2)",
            cursor: "pointer", color: "var(--t2)", fontSize: 11, fontWeight: 500,
          }}>
            {selectedModel.label}
            <ChevronDown size={10} color="var(--t4)" />
          </button>

          <div style={{ flex: 1 }} />

          {messages.length > 0 && (
            <button onClick={() => setMessages([])} title="Clear conversation" style={{ ...btnIcon, color: "var(--t4)" }}><Trash2 size={12} /></button>
          )}
          <button onClick={onClose} title="Close (⌘⌥A)" style={{ ...btnIcon, color: "var(--t3)" }}><X size={13} /></button>

          {showPicker && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "var(--sheet)", border: "0.5px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-lg)", padding: "6px 0", margin: "4px 8px 0" }}>
              {groups.map(([provider, models]) => (
                <div key={provider}>
                  <div style={{ padding: "6px 12px 3px", fontSize: 10, fontWeight: 700, color: "var(--t4)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {PROVIDER_LABEL[provider] || provider}
                    {!providers[provider] && <span style={{ marginLeft: 4, color: "var(--error)", fontWeight: 400 }}>· key not set</span>}
                  </div>
                  {models.map(m => {
                    const active   = m.id === modelId;
                    const disabled = !providers[m.provider];
                    return (
                      <button key={m.id} disabled={disabled} onClick={() => { setModelId(m.id); setShowPicker(false); }} style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 8, padding: "7px 12px", border: "none", cursor: disabled ? "not-allowed" : "pointer",
                        background: active ? "var(--fill2)" : "transparent", opacity: disabled ? 0.4 : 1,
                      }}>
                        <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: "var(--t1)", textAlign: "left" }}>{m.label}</span>
                        <span style={{ fontSize: 11, color: "var(--t3)" }}>{m.desc}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Messages ── */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 32, gap: 20 }}>
              <div style={{ color: "var(--t4)", fontSize: 12, textAlign: "center", lineHeight: 1.8 }}>
                Ask about the pipeline,<br />navigate views, or kick off<br />a production step.
                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6 }}>Drop images anytime.</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} style={{
                    padding: "7px 12px", borderRadius: 8, fontSize: 12, textAlign: "left",
                    background: "var(--fill)", border: "0.5px solid var(--border)",
                    color: "var(--t2)", cursor: "pointer", transition: "background 0.1s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--fill2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "var(--fill)"}
                  >{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <Bubble key={i} m={m} streaming={streaming && i === messages.length - 1} />)
          )}
        </div>

        {/* ── Pending image thumbnails ── */}
        {pending.length > 0 && (
          <div style={{ display: "flex", gap: 6, padding: "6px 12px 0", flexWrap: "wrap" }}>
            {pending.map((img, i) => (
              <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                <img src={`data:${img.mimeType};base64,${img.data}`}
                  style={{ width: 52, height: 52, borderRadius: 6, objectFit: "cover", border: "0.5px solid var(--border)", display: "block" }} />
                <button onClick={() => setPending(p => p.filter((_, j) => j !== i))} style={{
                  position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: 99,
                  background: "var(--t1)", color: "var(--bg)", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* ── Input ── */}
        <div style={{ padding: "10px 12px", borderTop: "0.5px solid var(--border)", flexShrink: 0 }}>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { addImages(e.target.files); e.target.value = ""; }} />
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKey}
              onPaste={onPaste}
              placeholder="Ask the agent…"
              rows={1}
              style={{
                flex: 1, resize: "none", overflow: "hidden",
                padding: "8px 10px", borderRadius: 8,
                border: "0.5px solid var(--border-in)", background: "var(--bg)",
                color: "var(--t1)", fontSize: 13, outline: "none",
                fontFamily: "inherit", lineHeight: 1.4,
                minHeight: 36, maxHeight: 120,
              }}
            />
            <button onClick={() => fileRef.current?.click()} title="Attach image" style={{
              ...btnIcon, width: 32, height: 32, border: "0.5px solid var(--border)", color: "var(--t3)",
            }}><Paperclip size={13} /></button>
            <button onClick={() => send()} disabled={!canSend} style={{
              width: 32, height: 32, borderRadius: 8, border: "none", flexShrink: 0,
              background: canSend ? "var(--t1)" : "var(--fill2)",
              color:      canSend ? "var(--bg)" : "var(--t4)",
              cursor:     canSend ? "pointer"   : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.12s",
            }}><Send size={13} /></button>
          </div>
        </div>

      </div>
    </aside>
  );
}
