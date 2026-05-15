"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Trash2, Paperclip, ChevronDown, Database, Link, FileText, Image, AtSign } from "lucide-react";
import { supabase } from "@/lib/db";
import { usePersistentState } from "@/lib/usePersistentState";
import { getAiCalls } from "@/lib/ai/audit";
import { auditRead } from "@/lib/ai/tools/audit-read";
import { formatCost } from "@/lib/ai/costs";
import { getBrandName, getContentType, contentObjective, contentChannel } from "@/lib/brandConfig";
import { friendlyAiError } from "@/lib/errorMessages";
import { getContextSummary, getViewLabel } from "@/lib/agent/agentContext";
import { TASK_TYPES } from "@/lib/agent/taskTypes";
import { CEMark } from "@/components/CEMark";

// ── Model registry ────────────────────────────────────────
const MODELS = [
  { id: "claude-sonnet-4-6",         provider: "anthropic", label: "Sonnet 4.6", desc: "Smart · fast"    },
  { id: "claude-opus-4-7",           provider: "anthropic", label: "Opus 4.7",   desc: "Most capable"   },
  { id: "claude-haiku-4-5-20251001", provider: "anthropic", label: "Haiku 4.5",  desc: "Fastest · cheap" },
  { id: "gpt-4o",                    provider: "openai",    label: "GPT-4o",      desc: "Vision · strong" },
  { id: "gpt-4o-mini",               provider: "openai",    label: "GPT-4o mini", desc: "Fast · cheap"   },
];
const PROVIDER_LABEL = { anthropic: "Claude", openai: "OpenAI" };

const DEFAULT_SUGGESTIONS = [
  "Approve all stories with score above 70",
  "What's ready for production?",
  "Show me recent AI failures",
  "Pipeline status",
];

// ── Context sources ───────────────────────────────────────
const CONTEXT_SOURCES = [
  { key: "all_scores",  label: "All scores",  desc: "Scores for every story — enables filter queries like 'approve score > 70'" },
  { key: "debug",       label: "Debug logs",  desc: "Recent AI failures and errors from the pipeline" },
  { key: "cost_detail", label: "Cost detail", desc: "Spend breakdown by workflow and provider" },
];

// ── History key ───────────────────────────────────────────
function historyKey(tenant) {
  return `agent_history_${tenant?.brand_profile_id || "default"}`;
}

// ── Build context block for system prompt ─────────────────
function buildContextBlock(agentCtx) {
  if (!agentCtx) return "";
  const lines = [];
  if (agentCtx.task_type && agentCtx.task_type !== "general_help") {
    const tt = TASK_TYPES[agentCtx.task_type];
    lines.push(`Current task: ${tt?.label || agentCtx.task_type}${tt?.description ? ` — ${tt.description}` : ""}`);
  }
  if (agentCtx.source_view)        lines.push(`View: ${getViewLabel(agentCtx.source_view)}`);
  if (agentCtx.source_entity_type) lines.push(`Entity: ${agentCtx.source_entity_type}${agentCtx.source_entity_id ? ` (id: ${agentCtx.source_entity_id})` : ""}`);
  if (agentCtx.task_intent)        lines.push(`Intent: ${agentCtx.task_intent}`);
  if (agentCtx.selected_text)      lines.push(`Selected text: "${String(agentCtx.selected_text).slice(0, 300)}"`);
  if (agentCtx.billing_snapshot)   lines.push(`Billing: plan=${agentCtx.billing_snapshot.plan_key}, status=${agentCtx.billing_snapshot.subscription_status}`);
  if (agentCtx.provider_snapshot)  lines.push(`Providers: ${JSON.stringify(agentCtx.provider_snapshot).slice(0, 200)}`);
  if (agentCtx.brand_snapshot)     lines.push(`Brand: ${JSON.stringify(agentCtx.brand_snapshot).slice(0, 200)}`);
  if (!lines.length) return "";
  return `\nACTIVE CONTEXT:\n${lines.map(l => `  ${l}`).join("\n")}`;
}

// ── Pipeline context ──────────────────────────────────────
function buildSystem(stories, tab, metrics, settings, extraCtx, agentCtx) {
  const brandName = getBrandName(settings);
  const counts = {};
  for (const s of stories) counts[s.status] = (counts[s.status] || 0) + 1;
  const bank = stories.filter(s => ["approved","scripted","produced"].includes(s.status)).length;

  const snapshot = stories
    .filter(s => !["rejected","archived"].includes(s.status))
    .slice(0, 25)
    .map(s => {
      const score = s.score != null ? ` [score:${s.score}]` : "";
      const gate  = s.quality_gate_status ? ` [gate:${s.quality_gate_status}]` : "";
      const type  = getContentType(s, settings);
      const obj   = contentObjective(s);
      const ch    = contentChannel(s);
      const meta  = [type, ch, obj].filter(Boolean).join(" · ");
      return `  • "${s.title}" [${s.status}]${score}${gate}${meta ? ` · ${meta}` : ""} (id:${s.id})`;
    })
    .join("\n");

  const metricsBlock = metrics
    ? `\nAI usage (7d): ${metrics.calls} calls · ${metrics.cost} · ${metrics.failed} failures · top: ${metrics.byType}`
    : "";

  let extraBlocks = "";
  if (extraCtx.all_scores) {
    const allScored = stories
      .filter(s => !["rejected","archived"].includes(s.status) && s.score != null)
      .sort((a, b) => b.score - a.score)
      .map(s => `  ${s.score} — "${s.title}" [${s.status}] (id:${s.id})`)
      .join("\n");
    extraBlocks += `\nAll story scores (high→low):\n${allScored || "(none with scores)"}`;
  }
  if (extraCtx.debug)       extraBlocks += `\nRecent AI failures:\n${extraCtx.debug || "(none)"}`;
  if (extraCtx.cost_detail) extraBlocks += `\nCost breakdown:\n${extraCtx.cost_detail}`;

  const contextBlock = buildContextBlock(agentCtx);

  return `You are the Creative Engine assistant${brandName ? ` for ${brandName}` : ""}.

Pipeline state (${new Date().toLocaleDateString()}):
- Active: ${stories.filter(s => !["rejected","archived"].includes(s.status)).length} · Stages: ${Object.entries(counts).map(([k,v]) => `${k}×${v}`).join(", ")}
- Production bank (approved+scripted+produced): ${bank}
- Current view: ${tab}
${metricsBlock}
Stories (top 25):
${snapshot || "(none yet)"}
${extraBlocks}
${contextBlock}
Navigation — embed to trigger:
  [[nav:pipeline]]  [[nav:research]]  [[nav:create]]  [[nav:calendar]]  [[nav:analyze]]
  [[story:STORY_ID]]  — open story detail

Write actions — embed when user asks. Multiple tags allowed for bulk:
  [[approve:STORY_ID]]       — move to "approved"
  [[reject:STORY_ID]]        — move to "rejected"
  [[stage:STORY_ID:STATUS]]  — move to: research / scripted / produced / approved / rejected / archived

Tools (call via tool-use when useful):
- write_insight — persist a durable finding into intelligence_insights
- db_read(table, filter?, limit?) — query stories, performance_snapshots, or intelligence_insights
- audit_read(source, story_id?, since?, failures_only?) — read ai_calls or audit_log

Rules:
- For bulk operations, embed one tag per matching story
- Always narrate what you're doing before the tags
- Use **bold** for key names, bullet lists for multiple items
- Be concise — 2-3 sentences unless more detail is requested
- If a task_type context is active, focus on that task before pivoting`;
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

function parseAllActions(text) {
  return {
    nav:     text.match(/\[\[nav:(\w+)\]\]/)?.[1] ?? null,
    stories: [...text.matchAll(/\[\[story:([a-f0-9-]+)\]\]/g)].map(m => m[1]),
    approve: [...text.matchAll(/\[\[approve:([a-f0-9-]+)\]\]/g)].map(m => m[1]),
    reject:  [...text.matchAll(/\[\[reject:([a-f0-9-]+)\]\]/g)].map(m => m[1]),
    stages:  [...text.matchAll(/\[\[stage:([a-f0-9-]+):(\w+)\]\]/g)].map(m => ({ id: m[1], to: m[2] })),
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
      <code key={keyPrefix + m.index} style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em", background: "var(--ce-fill-2)", padding: "1px 5px", borderRadius: 3, letterSpacing: 0 }}>{m[2]}</code>
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
        output.push(<span key={key++} style={{ display: "block", marginTop: output.length ? 5 : 0, lineHeight: 1.55 }}>{fmt(trimmed, `s${key}`)}</span>);
      } else if (output.length) {
        output.push(<span key={key++} style={{ display: "block", height: 5 }} />);
      }
    }
  }
  flushList();
  return <>{output}</>;
}

// ── Typing dots ───────────────────────────────────────────
function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 0" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--ce-text-4)", display: "inline-block", animation: "pulse 1.2s ease infinite", animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

// ── Image helpers ─────────────────────────────────────────
async function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve({ data: reader.result.split(",")[1], mimeType: file.type }); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Message row — flat CE style ───────────────────────────
function MessageRow({ m, streaming }) {
  const isUser = m.role === "user";
  const imgs   = Array.isArray(m.content) ? m.content.filter(p => p.type === "image") : [];
  const text   = Array.isArray(m.content) ? (m.content.find(p => p.type === "text")?.text ?? "") : (m.content ?? "");

  return (
    <div className="ce-slide-up" style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 9.5, fontFamily: "var(--font-mono)", color: "var(--ce-text-4)",
        textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 5,
      }}>
        {isUser ? "You" : "Engine"}
      </div>
      {imgs.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {imgs.map((img, i) => (
            <img key={i} src={`data:${img.mimeType};base64,${img.data}`}
              style={{ maxWidth: 120, maxHeight: 90, borderRadius: 5, objectFit: "cover", border: "0.5px solid var(--ce-line-2)" }} />
          ))}
        </div>
      )}
      <div style={{ fontSize: 12.5, color: isUser ? "var(--ce-text)" : "var(--ce-text-2)", lineHeight: 1.55 }}>
        {m.role === "assistant" && !text && streaming
          ? <TypingDots />
          : isUser
            ? <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
            : <Markdown text={text} />}
      </div>
      {m.role === "assistant" && m.memoryMeta?.count > 0 && (
        <div style={{ fontSize: 10, color: "var(--ce-text-5)", display: "flex", alignItems: "center", gap: 4, marginTop: 5, fontFamily: "var(--font-mono)" }}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--ce-text-5)", flexShrink: 0, display: "inline-block" }} />
          {m.memoryMeta.count} workspace {m.memoryMeta.count === 1 ? "memory" : "memories"}
        </div>
      )}
    </div>
  );
}

// ── Context toggle pill ───────────────────────────────────
function ContextPill({ source, active, loading, onToggle }) {
  return (
    <button onClick={() => onToggle(source.key)} title={source.desc} style={{
      padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 500, cursor: "pointer",
      background: active ? "var(--ce-fill-3)" : "var(--ce-fill)",
      color:      active ? "var(--ce-text-2)" : "var(--ce-text-4)",
      border:     active ? "0.5px solid var(--ce-line-3)" : "0.5px solid var(--ce-line-2)",
      opacity:    loading ? 0.5 : 1,
      transition: "all var(--ce-dur-1) var(--ce-ease)",
      fontFamily: "inherit",
    }}>
      {loading ? "…" : source.label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────
export default function AgentPanel({
  isOpen, onClose, stories, tab, onNavigate, onOpenStory, onUpdateStory, tenant, settings = null,
  agent_context = null, onClearContext = null,
}) {
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState("");
  const [streaming,   setStreaming]   = useState(false);
  const [pending,     setPending]     = useState([]);
  const [modelId,     setModelId]     = usePersistentState("agent_model", "claude-sonnet-4-6");
  const [showPicker,  setShowPicker]  = useState(false);
  const [providers,   setProviders]   = useState({ anthropic: true, openai: false });
  const [dragOver,    setDragOver]    = useState(false);
  const [metrics,     setMetrics]     = useState(null);
  const [ctxActive,   setCtxActive]   = useState({});
  const [ctxLoading,  setCtxLoading]  = useState({});
  const [extraCtx,    setExtraCtx]    = useState({});

  const scrollRef    = useRef(null);
  const fileRef      = useRef(null);
  const panelRef     = useRef(null);
  const textareaRef  = useRef(null);
  const historyReady = useRef(false);
  const memoryMetaRef = useRef(null);

  // ── Load history
  useEffect(() => {
    if (historyReady.current) return;
    historyReady.current = true;
    try {
      const saved = localStorage.getItem(historyKey(tenant));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
    } catch {}
  }, [tenant]);

  // ── Persist history (text only, max 30)
  useEffect(() => {
    if (!historyReady.current) return;
    try {
      const toSave = messages.slice(-30).map(m => ({
        role: m.role,
        content: Array.isArray(m.content) ? m.content.filter(p => p.type === "text") : m.content,
      }));
      localStorage.setItem(historyKey(tenant), JSON.stringify(toSave));
    } catch {}
  }, [messages, tenant]);

  // ── Fetch providers
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      const bpid = tenant?.brand_profile_id;
      const url  = bpid ? `/api/agent?brand_profile_id=${bpid}` : "/api/agent";
      fetch(url, { headers }).then(r => r.json()).then(setProviders).catch(() => {});
    });
  }, [tenant?.brand_profile_id]);

  // ── Fetch base metrics once per open
  useEffect(() => {
    if (!isOpen || metrics) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    getAiCalls({ limit: 500, workspaceId: tenant?.workspace_id, brandProfileId: tenant?.brand_profile_id }).then(calls => {
      const recent = calls.filter(c => c.created_at && new Date(c.created_at).getTime() >= cutoff);
      const cost   = recent.reduce((s, c) => s + (Number(c.cost_estimate) || 0), 0);
      const byType = Object.entries(
        recent.reduce((acc, c) => { const k = c.type || "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}×${n}`).join(", ");
      setMetrics({ calls: recent.length, cost: formatCost(cost), failed: recent.filter(c => !c.success).length, byType: byType || "none", raw: calls });
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

  // ── Toggle context source
  const toggleContext = useCallback(async (key) => {
    if (ctxActive[key]) {
      setCtxActive(s => ({ ...s, [key]: false }));
      setExtraCtx(s => ({ ...s, [key]: null }));
      return;
    }
    setCtxLoading(s => ({ ...s, [key]: true }));
    try {
      let data = null;
      if (key === "all_scores") {
        data = true;
      } else if (key === "debug") {
        const rawCalls = metrics?.raw?.length
          ? metrics.raw
          : await auditRead({ source: "ai_calls", failures_only: false, limit: 100, workspace_id: tenant?.workspace_id, brand_profile_id: tenant?.brand_profile_id });
        const failures = rawCalls.filter(c => !c.success).slice(0, 10);
        const failureBlock = failures.length
          ? failures.map(c => `  [${c.type}] ${c.error_message || c.error_type || "unknown"} (${c.created_at ? new Date(c.created_at).toLocaleDateString() : "?"})`).join("\n")
          : "(no recent AI failures)";
        const { data: insights } = await supabase
          .from("intelligence_insights")
          .select("summary,status,created_at,agent_name")
          .eq("category", "debug")
          .eq("brand_profile_id", tenant?.brand_profile_id || "")
          .in("status", ["open", "reviewed"])
          .order("created_at", { ascending: false })
          .limit(5);
        const insightBlock = insights?.length
          ? insights.map(i => `  [insight·${i.status}] ${i.summary} (${new Date(i.created_at).toLocaleDateString()})`).join("\n")
          : "";
        data = [failureBlock, insightBlock].filter(Boolean).join("\n") || "(no debug data)";
      } else if (key === "cost_detail") {
        const calls = metrics?.raw || await getAiCalls({ limit: 500 });
        const byWorkflow = Object.entries(
          calls.reduce((acc, c) => {
            const k = c.type || "unknown";
            acc[k] = acc[k] || { calls: 0, cost: 0 };
            acc[k].calls++;
            acc[k].cost += Number(c.cost_estimate) || 0;
            return acc;
          }, {})
        ).sort((a, b) => b[1].cost - a[1].cost).slice(0, 10)
         .map(([k, v]) => `  ${k}: ${v.calls} calls · ${formatCost(v.cost)}`).join("\n");
        data = byWorkflow || "(no data)";
      }
      setExtraCtx(s => ({ ...s, [key]: data }));
      setCtxActive(s => ({ ...s, [key]: true }));
    } catch {}
    finally { setCtxLoading(s => ({ ...s, [key]: false })); }
  }, [ctxActive, metrics, tenant]);

  const selectedModel = MODELS.find(m => m.id === modelId) || MODELS[0];

  const addImages = useCallback(async (files) => {
    const valid = Array.from(files).filter(f => f.type.startsWith("image/") && f.size <= 5 * 1024 * 1024).slice(0, 4 - pending.length);
    if (!valid.length) return;
    const converted = await Promise.all(valid.map(toBase64));
    setPending(p => [...p, ...converted].slice(0, 4));
  }, [pending.length]);

  const onDrop      = useCallback((e) => { e.preventDefault(); setDragOver(false); addImages(e.dataTransfer.files); }, [addImages]);
  const onDragOver  = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = (e) => { if (!panelRef.current?.contains(e.relatedTarget)) setDragOver(false); };

  const onPaste = useCallback((e) => {
    const files = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); addImages(files); }
  }, [addImages]);

  const handleInput = useCallback((e) => {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }
  }, []);

  const runActions = useCallback((text) => {
    const { nav, stories: storyIds, approve, reject, stages } = parseAllActions(text);
    if (nav) onNavigate(nav);
    storyIds.forEach(id => { const s = stories.find(x => x.id === id); if (s) onOpenStory(s); });
    approve.forEach(id => onUpdateStory?.(id, { status: "approved" }));
    reject.forEach(id  => onUpdateStory?.(id, { status: "rejected" }));
    stages.forEach(({ id, to }) => onUpdateStory?.(id, { status: to }));
  }, [onNavigate, onOpenStory, onUpdateStory, stories]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem(historyKey(tenant)); } catch {}
  }, [tenant]);

  const send = useCallback(async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if ((!text && !pending.length) || streaming) return;
    memoryMetaRef.current = null;
    setInput("");
    setPending([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const content = pending.length
      ? [...pending.map(img => ({ type: "image", data: img.data, mimeType: img.mimeType })), ...(text ? [{ type: "text", text }] : [])]
      : text;

    const history = [...messages, { role: "user", content }];
    const apiHistory = history.length > 20 ? history.slice(-20) : history;
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);

    const extraCtxForSystem = ctxActive.all_scores
      ? { all_scores: true, debug: extraCtx.debug, cost_detail: extraCtx.cost_detail }
      : { debug: extraCtx.debug, cost_detail: extraCtx.cost_detail };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({
          provider:              selectedModel.provider,
          model:                 modelId,
          messages:              apiHistory,
          system:                buildSystem(stories, tab, metrics, settings, extraCtxForSystem, agent_context),
          maxTokens:             1500,
          brand_profile_id:      tenant?.brand_profile_id,
          workspace_id:          tenant?.workspace_id,
          task_type:             agent_context?.task_type || null,
          source_view:           agent_context?.source_view || null,
          source_entity_type:    agent_context?.source_entity_type || null,
          source_entity_id:      agent_context?.source_entity_id || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }

      const reader = res.body.getReader();
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
            if (ev.type === "memory_context") {
              memoryMetaRef.current = { count: ev.count };
            } else if (ev.text) {
              full += ev.text;
              setMessages(m => { const n = [...m]; n[n.length - 1] = { role: "assistant", content: full }; return n; });
            }
          } catch {}
        }
      }
      if (memoryMetaRef.current) {
        setMessages(m => { const n = [...m]; n[n.length - 1] = { ...n[n.length - 1], content: full, memoryMeta: memoryMetaRef.current }; return n; });
      }
      runActions(full);
    } catch (err) {
      setMessages(m => { const n = [...m]; n[n.length - 1] = { role: "assistant", content: friendlyAiError(err.message) }; return n; });
    } finally { setStreaming(false); }
  }, [input, pending, messages, streaming, modelId, selectedModel, stories, tab, metrics, settings, ctxActive, extraCtx, agent_context, tenant, runActions]);

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const groups  = Object.entries(MODELS.reduce((acc, m) => { (acc[m.provider] = acc[m.provider] || []).push(m); return acc; }, {}));
  const canSend = (input.trim() || pending.length) && !streaming;

  const contextSummary   = getContextSummary(agent_context);
  const suggestedActions = agent_context?.suggested_actions;
  const emptyStateSuggestions = suggestedActions?.length
    ? suggestedActions
    : DEFAULT_SUGGESTIONS.map(s => ({ id: s, label: s }));

  const iconBtn = {
    width: 26, height: 26, borderRadius: 6, border: "none",
    background: "transparent", cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: "var(--ce-text-4)", transition: "color var(--ce-dur-1) var(--ce-ease)",
    fontFamily: "inherit",
  };

  // ── Collapsed: 52px strip with CEMark
  if (!isOpen) {
    return (
      <aside style={{
        width: 52, flexShrink: 0, height: "100%",
        borderLeft: "0.5px solid var(--ce-line)",
        background: "var(--ce-bg-2)",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "14px 0", gap: 12, zIndex: 15,
        transition: "width var(--ce-dur-3) var(--ce-ease)",
      }}>
        <button onClick={onClose} title="Expand Engine (⌘⌥A)" style={{
          width: 32, height: 32, borderRadius: 7,
          background: "transparent", border: "0.5px solid transparent",
          color: "var(--ce-text)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} className="ce-hover">
          <CEMark size={15} strokeWidth={1.2}
            color={streaming ? "var(--ce-live)" : "var(--ce-text)"}
            breathe={streaming} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{
          writingMode: "vertical-rl", fontSize: 9.5, color: "var(--ce-text-5)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          fontFamily: "var(--font-mono)",
        }}>Engine</span>
      </aside>
    );
  }

  // ── Expanded: 360px rail
  return (
    <aside
      ref={panelRef}
      onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
      style={{
        width: 360, flexShrink: 0, height: "100%",
        borderLeft: `0.5px solid ${dragOver ? "var(--ce-line-3)" : "var(--ce-line)"}`,
        background: dragOver ? "var(--ce-fill)" : "var(--ce-bg-2)",
        display: "flex", flexDirection: "column", zIndex: 15,
        transition: "background var(--ce-dur-1) var(--ce-ease), border-color var(--ce-dur-1) var(--ce-ease)",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        height: 44, flexShrink: 0, borderBottom: "0.5px solid var(--ce-line)",
        display: "flex", alignItems: "center", padding: "0 12px", gap: 10, position: "relative",
      }}>
        <button onClick={onClose} title="Collapse Engine (⌘⌥A)" style={{
          background: "transparent", border: "none", padding: 0,
          cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
          color: "var(--ce-text)", flex: 1,
        }}>
          <CEMark size={14} strokeWidth={1.1}
            breathe={streaming}
            color={streaming ? "var(--ce-live)" : "var(--ce-text)"} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ce-text)" }}>Engine</div>
            {contextSummary && (
              <div style={{ fontSize: 9.5, color: "var(--ce-text-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 1 }}>{contextSummary}</div>
            )}
          </div>
        </button>

        {/* Model picker trigger */}
        <button onClick={() => setShowPicker(s => !s)} style={{
          display: "flex", alignItems: "center", gap: 4, padding: "3px 7px",
          borderRadius: 5, border: "0.5px solid var(--ce-line-2)", background: "var(--ce-fill)",
          cursor: "pointer", color: "var(--ce-text-3)", fontSize: 10.5, fontWeight: 500,
          fontFamily: "inherit",
        }}>
          {selectedModel.label}
          <ChevronDown size={10} color="var(--ce-text-4)" />
        </button>

        {messages.length > 0 && (
          <button onClick={clearHistory} title="Clear conversation" style={{ ...iconBtn }}>
            <Trash2 size={12} />
          </button>
        )}

        {/* Model picker dropdown */}
        {showPicker && (
          <div style={{
            position: "absolute", top: "100%", right: 8, zIndex: 50, width: 220,
            background: "var(--ce-elevated)", border: "0.5px solid var(--ce-line-2)",
            borderRadius: 10, boxShadow: "var(--ce-shadow-3)", padding: "6px 0", marginTop: 4,
          }}>
            {groups.map(([provider, models]) => (
              <div key={provider}>
                <div style={{ padding: "6px 12px 3px", fontSize: 9.5, fontWeight: 700, color: "var(--ce-text-4)", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                  {PROVIDER_LABEL[provider] || provider}
                  {!providers[provider] && <span style={{ marginLeft: 4, color: "var(--ce-danger)", fontWeight: 400 }}> · key not set</span>}
                </div>
                {models.map(m => {
                  const active = m.id === modelId, disabled = !providers[m.provider];
                  return (
                    <button key={m.id} disabled={disabled} onClick={() => { setModelId(m.id); setShowPicker(false); }} style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: 8, padding: "7px 12px", border: "none", cursor: disabled ? "not-allowed" : "pointer",
                      background: active ? "var(--ce-fill-2)" : "transparent", opacity: disabled ? 0.4 : 1,
                      fontFamily: "inherit",
                    }}>
                      <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: "var(--ce-text)" }}>{m.label}</span>
                      <span style={{ fontSize: 11, color: "var(--ce-text-3)" }}>{m.desc}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Context strip (active task) ── */}
      {contextSummary && onClearContext && (
        <div style={{
          padding: "5px 14px", borderBottom: "0.5px solid var(--ce-line)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--ce-fill)", flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: "var(--ce-text-3)", fontWeight: 500 }}>
            {TASK_TYPES[agent_context?.task_type]?.label
              ? `${TASK_TYPES[agent_context.task_type].label} · ${contextSummary}`
              : contextSummary}
          </span>
          <button onClick={onClearContext} title="Clear context" style={{ background: "none", border: "none", color: "var(--ce-text-4)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>
      )}

      {/* ── Context bar ── */}
      <div style={{ padding: "7px 14px", borderBottom: "0.5px solid var(--ce-line)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
        <Database size={10} style={{ color: "var(--ce-text-5)", flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: "var(--ce-text-5)", fontFamily: "var(--font-mono)", marginRight: 2 }}>Context</span>
        {CONTEXT_SOURCES.map(src => (
          <ContextPill key={src.key} source={src} active={!!ctxActive[src.key]} loading={!!ctxLoading[src.key]} onToggle={toggleContext} />
        ))}
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} className="ce-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 14px 8px" }}>
        {messages.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", paddingTop: 16, gap: 14 }}>
            <div style={{ fontSize: 12, color: "var(--ce-text-4)", lineHeight: 1.7 }}>
              {contextSummary
                ? <>Working on <strong style={{ color: "var(--ce-text-3)" }}>{contextSummary}</strong>.<br />How can I help?</>
                : <>Ask about the pipeline,<br />navigate views, or run bulk actions.</>
              }
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {emptyStateSuggestions.map(s => {
                const label = typeof s === "string" ? s : s.label;
                const key   = typeof s === "string" ? s : (s.id || s.label);
                const msg   = typeof s === "string" ? s : (s.initial_message || s.label);
                return (
                  <button key={key} onClick={() => send(msg)} style={{
                    padding: "7px 10px", borderRadius: 7, fontSize: 11.5, textAlign: "left",
                    background: "var(--ce-fill)", border: "0.5px solid var(--ce-line-2)",
                    color: "var(--ce-text-3)", cursor: "pointer", fontFamily: "inherit",
                    transition: "background var(--ce-dur-1) var(--ce-ease)",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--ce-fill-2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "var(--ce-fill)"}
                  >{label}</button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageRow key={i} m={m} streaming={streaming && i === messages.length - 1} />)
        )}
      </div>

      {/* ── Pending images ── */}
      {pending.length > 0 && (
        <div style={{ display: "flex", gap: 6, padding: "6px 14px 0", flexWrap: "wrap" }}>
          {pending.map((img, i) => (
            <div key={i} style={{ position: "relative", flexShrink: 0 }}>
              <img src={`data:${img.mimeType};base64,${img.data}`}
                style={{ width: 48, height: 48, borderRadius: 5, objectFit: "cover", border: "0.5px solid var(--ce-line-2)", display: "block" }} />
              <button onClick={() => setPending(p => p.filter((_, j) => j !== i))} style={{
                position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: 99,
                background: "var(--ce-text)", color: "var(--ce-bg)", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700,
              }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Composer ── */}
      <div style={{ padding: 12, borderTop: "0.5px solid var(--ce-line)", flexShrink: 0 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={e => { addImages(e.target.files); e.target.value = ""; }} />
        <div style={{
          borderRadius: 10, border: "0.5px solid var(--ce-line-2)",
          background: "var(--ce-surface-2)", padding: 10,
          transition: "border-color var(--ce-dur-2) var(--ce-ease)",
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKey}
            onPaste={onPaste}
            placeholder={contextSummary ? `Ask about ${contextSummary.toLowerCase()}…` : "Ask, plan, or paste a source…"}
            rows={2}
            style={{
              width: "100%", resize: "none", overflow: "hidden",
              border: "none", outline: "none",
              background: "transparent", color: "var(--ce-text)",
              fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.5,
              minHeight: 40, maxHeight: 120,
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
            <button title="Attach image" onClick={() => fileRef.current?.click()} style={iconBtn}><Paperclip size={12} /></button>
            <button title="Source URL" style={iconBtn}><Link size={12} /></button>
            <button title="Mention" style={iconBtn}><AtSign size={12} /></button>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: "var(--ce-text-5)", fontFamily: "var(--font-mono)" }}>⌘↵</span>
            <button onClick={() => send()} disabled={!canSend} style={{
              padding: "5px 9px", borderRadius: 6, border: "none", flexShrink: 0,
              background: canSend ? "var(--ce-text)" : "var(--ce-fill-2)",
              color:      canSend ? "var(--ce-bg)" : "var(--ce-text-4)",
              cursor:     canSend ? "pointer" : "default",
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
              transition: "background var(--ce-dur-1) var(--ce-ease)",
            }}>
              <Send size={11} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
