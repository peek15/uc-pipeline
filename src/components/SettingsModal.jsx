"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import { X, Check, AlertCircle, ChevronRight, Plus, Trash2, GripVertical, Zap, RefreshCw, ArrowRight } from "lucide-react";
import { CONTENT_TYPES, FORMATS, FORMAT_MAP, ARCHETYPES } from "@/lib/constants";
import { getWorkspaceBilling, normalizeBilling } from "@/lib/billing/db";
import { ORDERED_PLANS } from "@/lib/billing/plans";
import { getPlanLabel, entitlementLabel } from "@/lib/billing/entitlements";
import { supabase } from "@/lib/db";
import { runPrompt } from "@/lib/ai/runner";
import { useAssistant } from "@/lib/agent/AssistantContext";
import { buildAgentContext } from "@/lib/agent/agentContext";
import { writeInsight } from "@/lib/ai/tools/write-insight";
import ProvidersSection from "@/components/ProvidersSection";
import ErrorBoundary from "@/components/ErrorBoundary";
import { uploadAsset, listAssets, deleteAsset, updateAssetSummary, extractTextFromFile, ASSET_TYPES } from "@/lib/assets";
import { normalizeTenant, tenantStorageKey } from "@/lib/brand";
import { getAppName, getBrandLanguages } from "@/lib/brandConfig";
import { DATA_CLASSES, PRIVACY_MODES } from "@/lib/privacy/privacyTypes";

const DEFAULT_SETTINGS = {
  brand: {
    name: "",
    tagline: "",
    short_description: "",
    industry: "",
    products_services: "",
    target_audience: "",
    markets: "",
    voice: "",
    visual_style: "",
    avoid: "",
    brand_values: "",
    differentiators: "",
    competitors_or_references: "",
    locked_elements: [],
    content_type: "narrative",
    goal_primary: "community",
    goal_secondary: "reach",
    language_primary: "EN",
    languages_secondary: [],
  },
  strategy: {
    weekly_cadence: 4,
    format_mix: {},
    sequence_rules: {
      no_consecutive_same_format: false,
    },
    rules: [],
    alerts: {
      stock_healthy: 20,
      stock_low:     10,
      horizon_days:  21,
    },
    defaults: {
      auto_translate:    true,
      auto_score:        true,
      default_language:  "EN",
      default_hook_type: "",
    },
    content_goals: "",
    target_platforms: [],
    content_pillars: [],
    key_messages: "",
    preferred_angles: "",
    avoid_angles: "",
    calls_to_action: "",
    claims_to_use_carefully: "",
    compliance_sensitivities: "",
    programmes: [],
    content_templates: [],
  },
  taxonomy: {
    eras: [],
    subjects: [],
    research_angles: [],
  },
  prompts: {
    script_system: "",
  },
  quality_gate: {
    factual_anchor_terms: [],
    profiles: {},
  },
  appearance: {
    theme:       "system",
    density:     "comfortable",
    default_tab: "pipeline",
  },
  providers: {
    script:   { provider:"anthropic", model:"claude-haiku-4-5-20251001", status:"configured" },
    voice:    { provider:"elevenlabs", voice_id:"", model_id:"eleven_multilingual_v2", stability:0.5, similarity_boost:0.75, status:"needs_key" },
    visual:   { provider:"stub", model:"", status:"not_configured" },
    assembly: { provider:"capcut_export", status:"configured" },
  },
  strategy_recommendations: [],
};

// Defensive merge: ensures all top-level keys from DEFAULT_SETTINGS exist
// even when initialSettings (loaded from Supabase) is partial or has a
// stale shape. Prevents undefined-access crashes like settings.brand.name.
function mergeSettings(incoming) {
  if (typeof incoming === "string") {
    try { incoming = JSON.parse(incoming); } catch { incoming = null; }
  }
  if (!incoming || typeof incoming !== "object") return DEFAULT_SETTINGS;
  const merged = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const def = DEFAULT_SETTINGS[k];
    const inc = incoming[k];
    if (inc && typeof inc === "object" && !Array.isArray(inc) && def && typeof def === "object" && !Array.isArray(def)) {
      merged[k] = { ...def, ...inc };
    } else if (inc !== undefined) {
      merged[k] = inc;
    } else {
      merged[k] = def;
    }
  }
  // Carry any extra keys from incoming we didn't know about (forward compat)
  for (const k of Object.keys(incoming)) {
    if (!(k in merged)) merged[k] = incoming[k];
  }
  return merged;
}

// ── Rule definitions ──
const RULE_TYPES = [
  { key:"format_day",     label:"Format on day",        desc:"Schedule a format on specific days only" },
  { key:"format_freq",    label:"Format frequency",     desc:"Min/max of a format per week" },
  { key:"score_priority", label:"Score priority",       desc:"If score condition met, assign to specific slot" },
  { key:"archetype_seq",  label:"Archetype sequence",   desc:"Prevent or require archetype patterns" },
  { key:"format_seq",     label:"Format sequence",      desc:"Prevent consecutive formats" },
  { key:"day_restrict",   label:"Day restriction",      desc:"No publishing on certain days" },
];

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const SCORE_FIELDS = [
  { key:"score_total",  label:"Community score" },
  { key:"reach_score",  label:"Reach score" },
  { key:"predicted_score", label:"Predicted score" },
];
const OPERATORS = [">",">=","<","<=","="];
const FREQ_TYPES = ["at least","at most","exactly"];

function ruleDescription(rule) {
  switch(rule.type) {
    case "format_day":
      return `${FORMAT_MAP[rule.format]?.label||rule.format} → ${rule.days?.join(", ")||"any day"} only`;
    case "format_freq":
      return `${FREQ_TYPES[rule.freq_type_idx]||"at least"} ${rule.count||1} ${FORMAT_MAP[rule.format]?.label||rule.format} per week`;
    case "score_priority":
      return `If ${SCORE_FIELDS.find(f=>f.key===rule.score_field)?.label||"score"} ${rule.operator||">"} ${rule.threshold||70} → ${rule.target_days?.join("/")||"priority slot"}`;
    case "archetype_seq":
      return `No consecutive ${rule.archetype||"archetype"} stories`;
    case "format_seq":
      return `No consecutive ${FORMAT_MAP[rule.format]?.label||rule.format} stories`;
    case "day_restrict":
      return `No publishing on ${rule.days?.join(", ")||"selected days"}`;
    default:
      return "Custom rule";
  }
}

function detectConflicts(rules) {
  const conflicts = [];
  for (let i=0; i<rules.length; i++) {
    for (let j=i+1; j<rules.length; j++) {
      const a = rules[i]; const b = rules[j];
      // Format day + score priority on same day
      if (a.type==="format_day" && b.type==="score_priority") {
        const sharedDays = (a.days||[]).filter(d=>(b.target_days||[]).includes(d));
        if (sharedDays.length) conflicts.push({ i, j, reason:`Rule ${i+1} reserves ${sharedDays.join("/")} for ${FORMAT_MAP[a.format]?.label}, but Rule ${j+1} may assign high-score stories to same days` });
      }
      // Two format_freq with same format
      if (a.type==="format_freq" && b.type==="format_freq" && a.format===b.format) {
        conflicts.push({ i, j, reason:`Rules ${i+1} and ${j+1} both set frequency for ${FORMAT_MAP[a.format]?.label||a.format} — may conflict` });
      }
      // format_seq + format_day same format
      if (a.type==="format_seq" && b.type==="format_day" && a.format===b.format && (b.days||[]).length>3) {
        conflicts.push({ i, j, reason:`Rule ${i+1} prevents consecutive ${FORMAT_MAP[a.format]?.label}, but Rule ${j+1} schedules it most days — may force violations` });
      }
    }
  }
  return conflicts;
}

function slugifyTemplateId(value) {
  const base = String(value || "content_template")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || `template_${Date.now()}`;
}

function normalizeTemplate(template, existing = []) {
  const idBase = slugifyTemplateId(template?.id || template?.name);
  const used = new Set(existing.map(t => t.id).filter(Boolean));
  let id = idBase;
  let n = 2;
  while (used.has(id)) {
    id = `${idBase}_${n}`;
    n += 1;
  }
  return {
    id,
    name: template?.name || id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    content_type: template?.content_type || "narrative",
    objective: template?.objective || "",
    audience: template?.audience || "",
    channels: Array.isArray(template?.channels) ? template.channels.filter(Boolean) : [],
    deliverable_type: template?.deliverable_type || "",
    required_fields: Array.isArray(template?.required_fields) ? template.required_fields.filter(Boolean) : [],
    workflow_steps: Array.isArray(template?.workflow_steps) ? template.workflow_steps.filter(Boolean) : [],
    distinct_reason: template?.distinct_reason || "",
    created_by_agent: true,
  };
}

function templateSimilarity(a, b) {
  const fields = ["content_type", "objective", "audience", "deliverable_type"];
  let same = fields.filter(k => String(a?.[k] || "").toLowerCase() && String(a?.[k] || "").toLowerCase() === String(b?.[k] || "").toLowerCase()).length;
  const aChannels = new Set((a?.channels || []).map(c => String(c).toLowerCase()));
  const bChannels = new Set((b?.channels || []).map(c => String(c).toLowerCase()));
  if ([...aChannels].some(c => bChannels.has(c))) same += 1;
  const aSteps = new Set((a?.workflow_steps || []).map(c => String(c).toLowerCase()));
  const bSteps = new Set((b?.workflow_steps || []).map(c => String(c).toLowerCase()));
  if ([...aSteps].some(c => bSteps.has(c))) same += 1;
  return same;
}

function isDistinctTemplate(candidate, existing) {
  const name = String(candidate?.name || "").trim().toLowerCase();
  if (!name) return false;
  return !(existing || []).some(t => {
    if (String(t.name || "").trim().toLowerCase() === name) return true;
    if (String(t.id || "").trim().toLowerCase() === String(candidate.id || "").trim().toLowerCase()) return true;
    return templateSimilarity(candidate, t) >= 5;
  });
}

function storyHasMetrics(story) {
  return !!(story.metrics_views || story.metrics_completion || story.metrics_saves || story.metrics_shares || story.metrics_follows);
}

function qualityStatus(story) {
  if (story.quality_gate_status) return story.quality_gate_status;
  if (Number(story.quality_gate_blockers) > 0) return "blocked";
  if (Number(story.quality_gate_warnings) > 0) return "warnings";
  if (story.quality_gate) return "passed";
  return "missing";
}

function statusTone(status) {
  if (status === "active") return { label: "Active", color: "var(--success)", bg: "rgba(74,155,127,0.10)" };
  if (status === "partial") return { label: "Partial", color: "var(--warning)", bg: "rgba(196,154,60,0.12)" };
  if (status === "stub") return { label: "Stub", color: "var(--error)", bg: "rgba(192,102,106,0.10)" };
  return { label: "Missing", color: "var(--t4)", bg: "var(--fill2)" };
}

function summarizeInsightPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  const parts = [];
  if (payload.agent_name) parts.push(payload.agent_name);
  if (payload.correction_count != null) parts.push(`${payload.correction_count} corrections`);
  // New shape: calibration_hints replaces sample_notes
  if (!payload.calibration_hints?.length && payload.sample_notes?.length) {
    parts.push(payload.sample_notes.slice(0, 2).join(" / "));
  }
  return parts.join(" · ");
}

function insightTone(category) {
  if (category === "error" || category === "debug") return "var(--error)";
  if (category === "provider_health" || category === "quality_pattern") return "var(--warning)";
  if (category === "feedback" || category === "performance_pattern") return "var(--success)";
  return "var(--t2)";
}

function intelligenceModules(stories, settings, conflicts, insightCount = 0, snapshotCount = 0) {
  const published = stories.filter(s => s.status === "published");
  const withMetrics = stories.filter(storyHasMetrics);
  const withScore = stories.filter(s => s.score_total != null);
  const withPrediction = stories.filter(s => s.predicted_score != null);
  const withGate = stories.filter(s => qualityStatus(s) !== "missing");
  const withTemplates = stories.filter(s => s.content_template_id || s.content_type);
  const productionArtifacts = stories.filter(s => s.visual_brief || s.visual_refs || s.audio_refs || s.assembly_brief);
  const configuredTemplates = settings?.strategy?.content_templates || [];
  const rules = settings?.strategy?.rules || [];

  return [
    {
      key: "research",
      name: "Research intelligence",
      status: configuredTemplates.length && withScore.length ? "active" : "partial",
      signal: `${withScore.length}/${stories.length || 0} scored`,
      source: "Research prompts + Quality Gate",
      detail: "Template targeting, duplicate avoidance, AI scoring, and quality screening are live.",
      next: "Make scoring profiles template-specific for ads, product, publicity, education, and community.",
    },
    {
      key: "quality",
      name: "Quality Gate",
      status: withGate.length ? "active" : "partial",
      signal: `${withGate.length}/${stories.length || 0} audited`,
      source: "stories.quality_gate",
      detail: "Template-aware blockers and warnings are persisted and used by Pipeline, Detail, Research, and Calendar.",
      next: "Add custom gate rules per content template and learn which warnings predict poor performance.",
    },
    {
      key: "planning",
      name: "Calendar planning",
      status: rules.length || stories.some(s => s.scheduled_date) ? "active" : "partial",
      signal: `${stories.filter(s => s.scheduled_date).length} scheduled`,
      source: "Calendar audit + strategy rules",
      detail: "Weekly audit, safe auto-fill, cadence, sequence, and format mix checks are operational.",
      next: conflicts.length ? `${conflicts.length} rule conflict${conflicts.length === 1 ? "" : "s"} need review.` : "Replace score+reach sorting with prediction confidence once Prediction V1 exists.",
    },
    {
      key: "production",
      name: "Production agents",
      status: productionArtifacts.length ? "active" : "partial",
      signal: `${productionArtifacts.length} items with artifacts`,
      source: "visual_brief, visual_refs, audio_refs, assembly_brief",
      detail: "Brief, asset, voice, visual, and assembly agents use brand/template context and record correction feedback.",
      next: "Summarize repeated feedback into durable agent memory instead of only recent prompt examples.",
    },
    {
      key: "performance",
      name: "Performance learning",
      status: snapshotCount ? "partial" : "partial",
      signal: `${snapshotCount || withMetrics.length} snapshot${(snapshotCount || withMetrics.length) === 1 ? "" : "s"}`,
      source: "performance_snapshots + story latest metrics",
      detail: "Manual and CSV metrics now write time-series snapshots while story fields remain the latest-value cache.",
      next: "Generate performance-pattern insights and feed them into Prediction Engine V1.",
    },
    {
      key: "prediction",
      name: "Predictive scoring",
      status: withPrediction.length >= 5 ? "active" : withPrediction.length ? "partial" : "partial",
      signal: `${withPrediction.length} predicted`,
      source: "stories.predicted_score",
      detail: "Prediction Engine V1 is live. Scores use quality gate risk, historical peer-group performance, and sample-size confidence. Run it to populate predicted_score across all active stories.",
      next: withPrediction.length ? "Feed predicted_score into Calendar auto-fill and Pipeline sort to replace the raw score+reach sum." : "Click 'Run predictions' to score active stories for the first time.",
    },
    {
      key: "memory",
      name: "Durable memory",
      status: insightCount > 0 ? "partial" : "partial",
      signal: `${insightCount} insight${insightCount === 1 ? "" : "s"}`,
      source: "agent_feedback + intelligence_insights",
      detail: "Insight writing is now available as a safe durable memory layer; summarizers and agents can record findings without mutating strategy.",
      next: "Add feedback/performance summarizers that automatically create and review insight rows.",
    },
    {
      key: "debug",
      name: "Debug intelligence",
      status: "partial",
      signal: "diagnostics live",
      source: "Providers Diagnostics + ai_calls",
      detail: "Provider diagnostics can export a redacted bundle and summarize schema/provider issues.",
      next: "Add persistent debug_events and let the agent read diagnostics through scoped tools.",
    },
  ];
}

function WorkspaceMemoryPanel({
  memories = [],
  loading = false,
  error = null,
  onRefresh,
  onUpdateStatus,
  onUpdateSummary,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draftSummary, setDraftSummary] = useState("");
  const activeMemories = memories.filter(memory => !["dismissed", "archived", "wrong", "rejected"].includes(memory.status));

  const beginEdit = (memory) => {
    setEditingId(memory.id);
    setDraftSummary(memory.summary || "");
  };

  const saveEdit = async (id) => {
    await onUpdateSummary?.(id, draftSummary);
    setEditingId(null);
    setDraftSummary("");
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"flex-start", flexWrap:"wrap" }}>
        <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, maxWidth:680 }}>
          Review what Creative Engine can reuse as durable context. Memory guides assistant, Ideas, scoring, Create, translation, and onboarding, but it does not change strategy or content by itself.
        </div>
        <button onClick={onRefresh} style={{ padding:"6px 12px", borderRadius:7, border:"0.5px solid var(--border)", background:"var(--fill2)", color:"var(--t2)", fontSize:12, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      {error && <div style={{ fontSize:12, color:"var(--error)", lineHeight:1.45 }}>{error}</div>}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10 }}>
        {[
          ["Active memories", activeMemories.length],
          ["Applied", memories.filter(m => m.status === "applied").length],
          ["Reviewed", memories.filter(m => m.status === "reviewed").length],
          ["Open", memories.filter(m => !m.status || m.status === "open").length],
        ].map(([label, value]) => (
          <div key={label} style={{ padding:"11px 13px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
            <div style={{ fontSize:10, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:18, fontWeight:650, color:"var(--t1)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ fontSize:12, color:"var(--t4)", padding:"18px 0" }}>Loading memory...</div>
      ) : activeMemories.length ? (
        <div style={{ display:"grid", gap:8 }}>
          {activeMemories.map(memory => {
            const label = memory.payload?.label || memory.payload?.memory_key || memory.category || "Memory";
            const source = memory.source === "workspace_memory" ? "Approved workspace memory" : memory.source || "Memory";
            const editing = editingId === memory.id;
            return (
              <div key={memory.id} style={{ padding:"12px 13px", borderRadius:9, background:"var(--bg)", border:"0.5px solid var(--border)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"flex-start", marginBottom:8 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
                      <span style={{ fontSize:11, color:"var(--t1)", fontWeight:700 }}>{label}</span>
                      <span style={{ fontSize:10, color:"var(--t4)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}>{source}</span>
                      <span style={{ fontSize:10, color:"var(--t4)", textTransform:"uppercase", letterSpacing:"0.05em" }}>{memory.status || "open"}</span>
                    </div>
                    {memory.payload?.source_citations?.length > 0 && (
                      <div style={{ fontSize:10, color:"var(--t4)", marginTop:4 }}>
                        {memory.payload.source_citations.length} source citation{memory.payload.source_citations.length === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:"var(--t3)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", whiteSpace:"nowrap" }}>
                    {Math.round((Number(memory.confidence) || 0) * 100)}%
                  </div>
                </div>

                {editing ? (
                  <div style={{ display:"grid", gap:8 }}>
                    <textarea value={draftSummary} onChange={e => setDraftSummary(e.target.value)} rows={4} style={{ width:"100%", padding:"9px 10px", borderRadius:7, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:12, lineHeight:1.5, resize:"vertical", outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
                    <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                      <button onClick={() => setEditingId(null)} style={{ padding:"4px 9px", borderRadius:6, border:"0.5px solid var(--border)", background:"transparent", color:"var(--t4)", fontSize:11, cursor:"pointer" }}>Cancel</button>
                      <button onClick={() => saveEdit(memory.id)} style={{ padding:"4px 9px", borderRadius:6, border:"0.5px solid var(--border)", background:"var(--t1)", color:"var(--bg)", fontSize:11, fontWeight:600, cursor:"pointer" }}>Save memory</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize:12, color:"var(--t1)", lineHeight:1.5 }}>{memory.summary}</div>
                    {summarizeInsightPayload(memory.payload) && (
                      <div style={{ fontSize:11, color:"var(--t4)", lineHeight:1.4, marginTop:5 }}>{summarizeInsightPayload(memory.payload)}</div>
                    )}
                    <div style={{ display:"flex", gap:6, justifyContent:"flex-end", marginTop:10, flexWrap:"wrap" }}>
                      <button onClick={() => onUpdateStatus?.(memory.id, "applied")} style={{ padding:"4px 9px", borderRadius:6, border:"0.5px solid var(--border)", background:"var(--fill2)", color:"var(--t2)", fontSize:11, cursor:"pointer" }}>Keep</button>
                      <button onClick={() => beginEdit(memory)} style={{ padding:"4px 9px", borderRadius:6, border:"0.5px solid var(--border)", background:"var(--fill2)", color:"var(--t2)", fontSize:11, cursor:"pointer" }}>Edit</button>
                      <button onClick={() => onUpdateStatus?.(memory.id, "archived")} style={{ padding:"4px 9px", borderRadius:6, border:"0.5px solid var(--border)", background:"transparent", color:"var(--t4)", fontSize:11, cursor:"pointer" }}>Archive</button>
                      <button onClick={() => onUpdateStatus?.(memory.id, "wrong")} style={{ padding:"4px 9px", borderRadius:6, border:"0.5px solid var(--border)", background:"transparent", color:"var(--error)", fontSize:11, cursor:"pointer" }}>Mark wrong</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding:"24px 14px", textAlign:"center", color:"var(--t4)", fontSize:12, border:"1px dashed var(--border)", borderRadius:10 }}>
          No active workspace memory yet. Approved onboarding strategy and reviewed intelligence insights will appear here.
        </div>
      )}
    </div>
  );
}

function IntelligenceDashboard({
  stories,
  settings,
  conflicts,
  appName,
  version,
  insightCount = 0,
  insights = [],
  snapshotCount = 0,
  insightsLoading = false,
  insightError = null,
  onGenerateFeedbackInsights,
  generatingInsights = false,
  onUpdateInsightStatus,
  onRunPredictions,
  runningPredictions = false,
  pendingFeedbackCount = 0,
  onApplyCalibrationHint,
}) {
  const modules = intelligenceModules(stories, settings, conflicts, insightCount, snapshotCount);
  const active = modules.filter(m => m.status === "active").length;
  const partial = modules.filter(m => m.status === "partial").length;
  const stub = modules.filter(m => m.status === "stub").length;
  const missing = modules.filter(m => m.status === "missing").length;
  const published = stories.filter(s => s.status === "published").length;
  const withMetrics = stories.filter(storyHasMetrics).length;
  const withTemplates = stories.filter(s => s.content_template_id || s.content_type).length;
  const withGate = stories.filter(s => qualityStatus(s) !== "missing").length;
  const maturity = active >= 5 && withMetrics >= 50 ? "Stage 2" : active >= 3 ? "Stage 1.5" : "Stage 1";
  const readiness = Math.round(((active * 1 + partial * 0.55 + stub * 0.2) / modules.length) * 100);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:14, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, maxWidth:620 }}>
            Intelligence is measured by active signals, durable learning, and whether recommendations feed back into the workflow. This dashboard shows what is real today and what still needs wiring.
          </div>
        </div>
        <div style={{ minWidth:120, textAlign:"right" }}>
          <div style={{ fontSize:10, color:"var(--t4)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Maturity</div>
          <div style={{ fontSize:20, fontWeight:700, color:"var(--t1)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}>{maturity}</div>
          <div style={{ fontSize:11, color:"var(--t4)" }}>{readiness}% wired</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(125px,1fr))", gap:10 }}>
        {[
          ["Active", active],
          ["Partial", partial],
          ["Stubbed", stub],
          ["Missing", missing],
          ["Published", published],
          ["Metrics", withMetrics],
          ["Snapshots", snapshotCount],
          ["Templated", withTemplates],
          ["Audited", withGate],
        ].map(([label, value]) => (
          <div key={label} style={{ padding:"11px 13px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
            <div style={{ fontSize:10, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:18, fontWeight:650, color:"var(--t1)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ height:5, borderRadius:99, background:"var(--bg3)", overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${readiness}%`, background: readiness >= 70 ? "var(--success)" : readiness >= 45 ? "var(--warning)" : "var(--error)", borderRadius:99 }} />
      </div>

      <div style={{ display:"grid", gap:10 }}>
        {modules.map(module => {
          const tone = statusTone(module.status);
          return (
            <div key={module.key} style={{ padding:"13px 14px", borderRadius:10, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:13, fontWeight:700, color:"var(--t1)" }}>{module.name}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:tone.color, background:tone.bg, border:`0.5px solid ${tone.color}`, borderRadius:99, padding:"2px 7px", textTransform:"uppercase", letterSpacing:"0.04em" }}>{tone.label}</span>
                  </div>
                  <div style={{ fontSize:11, color:"var(--t4)", marginTop:3 }}>{module.source}</div>
                </div>
                <div style={{ fontSize:12, color:"var(--t2)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", whiteSpace:"nowrap" }}>{module.signal}</div>
              </div>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.5, marginBottom:8 }}>{module.detail}</div>
              <div style={{ display:"flex", gap:7, alignItems:"flex-start", fontSize:12, color:"var(--t2)", lineHeight:1.45 }}>
                <ArrowRight size={13} style={{ flexShrink:0, marginTop:2, color:"var(--t4)" }} />
                <span>{module.next}</span>
              </div>
              {module.key === "prediction" && onRunPredictions && (
                <div style={{ marginTop:10 }}>
                  <button onClick={onRunPredictions} disabled={runningPredictions} style={{ padding:"6px 12px", borderRadius:7, border:"0.5px solid var(--border)", background:runningPredictions?"var(--bg3)":"var(--t1)", color:runningPredictions?"var(--t3)":"var(--bg)", fontSize:12, fontWeight:600, cursor:runningPredictions?"not-allowed":"pointer" }}>
                    {runningPredictions ? "Running…" : `Run predictions (${stories.filter(s=>!["rejected","archived"].includes(s.status)).length} stories)`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding:"14px 16px", borderRadius:10, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:12, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)" }}>Intelligence insights</div>
            <div style={{ fontSize:11, color:"var(--t4)", marginTop:3 }}>Reviewable memory candidates. These do not change strategy or content until you decide what to do with them.</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
            {pendingFeedbackCount > 0 && !generatingInsights && (
              <span style={{ fontSize:10, color:"var(--warning)", fontWeight:600 }}>{pendingFeedbackCount} new correction{pendingFeedbackCount > 1 ? "s" : ""}</span>
            )}
            <button onClick={onGenerateFeedbackInsights} disabled={generatingInsights} style={{ padding:"6px 12px", borderRadius:7, border:"0.5px solid var(--border)", background:generatingInsights?"var(--bg3)":"var(--t1)", color:generatingInsights?"var(--t3)":"var(--bg)", fontSize:12, fontWeight:600, cursor:generatingInsights?"not-allowed":"pointer" }}>
              {generatingInsights ? "Scanning…" : "Scan feedback"}
            </button>
          </div>
        </div>

        {insightError && (
          <div style={{ fontSize:12, color:"var(--error)", lineHeight:1.45, marginBottom:10 }}>
            {insightError}
          </div>
        )}

        {insightsLoading ? (
          <div style={{ fontSize:12, color:"var(--t4)", padding:"18px 0" }}>Loading insights...</div>
        ) : insights.length ? (
          <div style={{ display:"grid", gap:8 }}>
            {insights.map(insight => (
              <div key={insight.id} style={{ padding:"11px 12px", borderRadius:8, background:"var(--bg)", border:"0.5px solid var(--border)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"flex-start", marginBottom:6 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap" }}>
                      <span style={{ width:7, height:7, borderRadius:99, background:insightTone(insight.category), display:"inline-block" }} />
                      <span style={{ fontSize:11, color:"var(--t4)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}>{insight.category}</span>
                      <span style={{ fontSize:11, color:"var(--t4)" }}>{insight.source}</span>
                      <span style={{ fontSize:10, color:insight.status === "open" ? "var(--warning)" : "var(--t4)", textTransform:"uppercase", letterSpacing:"0.05em" }}>{insight.status || "open"}</span>
                    </div>
                    <div style={{ fontSize:12, color:"var(--t1)", lineHeight:1.45, marginTop:5 }}>{insight.summary}</div>
                    {summarizeInsightPayload(insight.payload) && (
                      <div style={{ fontSize:11, color:"var(--t4)", lineHeight:1.4, marginTop:4 }}>{summarizeInsightPayload(insight.payload)}</div>
                    )}
                    {insight.payload?.calibration_hints?.length > 0 && insight.status !== "applied" && (
                      <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:4 }}>
                        {insight.payload.calibration_hints.slice(0, 4).map((h, i) => (
                          <div key={i} style={{ fontSize:11, color:"var(--t2)", background:"var(--bg2)", borderRadius:5, padding:"5px 8px", lineHeight:1.45, display:"flex", alignItems:"flex-start", gap:6 }}>
                            <div style={{ flex:1 }}>
                              <span style={{ color:"var(--t4)", marginRight:4 }}>⚙</span>
                              <strong style={{ color:"var(--t1)" }}>{h.pattern}</strong>
                              {h.suggested_action && <span style={{ color:"var(--t4)" }}> → {h.suggested_action}</span>}
                              {h.recurrence_count > 1 && <span style={{ color:"var(--t4)", marginLeft:6, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", fontSize:10 }}>×{h.recurrence_count}</span>}
                            </div>
                            {onApplyCalibrationHint && (
                              <button onClick={() => onApplyCalibrationHint(h, insight.id)} style={{ flexShrink:0, padding:"2px 7px", borderRadius:4, border:"0.5px solid var(--border)", background:"var(--t1)", color:"var(--bg)", fontSize:10, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
                                Apply
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:"var(--t3)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", whiteSpace:"nowrap" }}>
                    {Math.round((Number(insight.confidence) || 0) * 100)}%
                  </div>
                </div>
                {insight.status === "open" && (
                  <div style={{ display:"flex", gap:6, justifyContent:"flex-end", marginTop:8 }}>
                    <button onClick={() => onUpdateInsightStatus?.(insight.id, "reviewed")} style={{ padding:"4px 9px", borderRadius:6, border:"0.5px solid var(--border)", background:"var(--fill2)", color:"var(--t2)", fontSize:11, cursor:"pointer" }}>Reviewed</button>
                    <button onClick={() => onUpdateInsightStatus?.(insight.id, "dismissed")} style={{ padding:"4px 9px", borderRadius:6, border:"0.5px solid var(--border)", background:"transparent", color:"var(--t4)", fontSize:11, cursor:"pointer" }}>Dismiss</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize:12, color:"var(--t4)", lineHeight:1.5, padding:"10px 0" }}>
            No insights yet. Scan feedback after using production agents, or wait for performance/debug summarizers in the next phase.
          </div>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderTop:"0.5px solid var(--border2)", marginTop:2 }}>
        <span style={{ fontSize:11, color:"var(--t4)" }}>{appName}</span>
        <span style={{ fontSize:11, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:"var(--t4)" }}>v{version}</span>
      </div>
    </div>
  );
}

// ── Rule builder ──
function RuleBuilder({ rule, onChange, onDelete, index, conflicts, totalRules }) {
  const hasConflict = conflicts.some(c => c.i===index || c.j===index);

  return (
    <div style={{ borderRadius:9, border:`1px solid ${hasConflict?"#C0666A":"var(--border)"}`, background:"var(--card)", marginBottom:8, overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderBottom:"1px solid var(--border2)" }}>
        <GripVertical size={14} color="var(--t4)" style={{ cursor:"grab", flexShrink:0 }}/>
        <span style={{ fontSize:10, fontWeight:700, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:"var(--t4)", width:18 }}>{index+1}</span>
        <select value={rule.type||""} onChange={e=>onChange({...rule,type:e.target.value})} style={{ fontSize:12, padding:"3px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none", flex:1 }}>
          <option value="">Select rule type...</option>
          {RULE_TYPES.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
          {hasConflict && <AlertCircle size={13} color="#C0666A"/>}
          <button onClick={()=>onChange({...rule,active:!rule.active})} style={{ width:32, height:18, borderRadius:9, border:"none", cursor:"pointer", background:rule.active!==false?"var(--t1)":"var(--t4)", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
            <div style={{ position:"absolute", top:2, left:rule.active!==false?14:2, width:14, height:14, borderRadius:"50%", background:"white", transition:"left 0.2s" }}/>
          </button>
          <button onClick={onDelete} style={{ width:24, height:24, borderRadius:5, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Trash2 size={12} color="var(--t4)"/>
          </button>
        </div>
      </div>

      {rule.type && (
        <div style={{ padding:"10px 12px" }}>
          {/* format_day */}
          {rule.type==="format_day" && (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <select value={rule.format||""} onChange={e=>onChange({...rule,format:e.target.value})} style={{ fontSize:12, padding:"4px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
                <option value="">Format...</option>
                {FORMATS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <span style={{ fontSize:11, color:"var(--t3)" }}>only on</span>
              <div style={{ display:"flex", gap:3 }}>
                {DAYS.map(d=>(
                  <button key={d} onClick={()=>{ const days=rule.days||[]; onChange({...rule,days:days.includes(d)?days.filter(x=>x!==d):[...days,d]}); }} style={{ padding:"3px 7px", borderRadius:4, fontSize:10, fontWeight:500, background:(rule.days||[]).includes(d)?"var(--t1)":"var(--fill2)", color:(rule.days||[]).includes(d)?"var(--bg)":"var(--t3)", border:"1px solid var(--border)", cursor:"pointer" }}>
                    {d.slice(0,3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* format_freq */}
          {rule.type==="format_freq" && (
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <select value={rule.freq_type_idx??0} onChange={e=>onChange({...rule,freq_type_idx:parseInt(e.target.value)})} style={{ fontSize:12, padding:"4px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
                {FREQ_TYPES.map((t,i)=><option key={i} value={i}>{t}</option>)}
              </select>
              <input type="number" min="0" max="7" value={rule.count||1} onChange={e=>onChange({...rule,count:parseInt(e.target.value)})} style={{ width:48, padding:"4px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none", textAlign:"center" }}/>
              <select value={rule.format||""} onChange={e=>onChange({...rule,format:e.target.value})} style={{ fontSize:12, padding:"4px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
                <option value="">Format...</option>
                {FORMATS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <span style={{ fontSize:11, color:"var(--t3)" }}>per week</span>
            </div>
          )}

          {/* score_priority */}
          {rule.type==="score_priority" && (
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <span style={{ fontSize:11, color:"var(--t3)" }}>If</span>
              <select value={rule.score_field||""} onChange={e=>onChange({...rule,score_field:e.target.value})} style={{ fontSize:12, padding:"4px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
                <option value="">Score field...</option>
                {SCORE_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <select value={rule.operator||">"} onChange={e=>onChange({...rule,operator:e.target.value})} style={{ fontSize:12, padding:"4px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none", width:60 }}>
                {OPERATORS.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
              <input type="number" min="0" max="100" value={rule.threshold||70} onChange={e=>onChange({...rule,threshold:parseInt(e.target.value)})} style={{ width:52, padding:"4px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none", textAlign:"center" }}/>
              <span style={{ fontSize:11, color:"var(--t3)" }}>→ prefer</span>
              <div style={{ display:"flex", gap:3 }}>
                {DAYS.map(d=>(
                  <button key={d} onClick={()=>{ const days=rule.target_days||[]; onChange({...rule,target_days:days.includes(d)?days.filter(x=>x!==d):[...days,d]}); }} style={{ padding:"3px 7px", borderRadius:4, fontSize:10, fontWeight:500, background:(rule.target_days||[]).includes(d)?"var(--t1)":"var(--fill2)", color:(rule.target_days||[]).includes(d)?"var(--bg)":"var(--t3)", border:"1px solid var(--border)", cursor:"pointer" }}>
                    {d.slice(0,3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* archetype_seq */}
          {rule.type==="archetype_seq" && (
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:11, color:"var(--t3)" }}>No consecutive</span>
              <select value={rule.archetype||""} onChange={e=>onChange({...rule,archetype:e.target.value})} style={{ fontSize:12, padding:"4px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
                <option value="">Archetype...</option>
                {ARCHETYPES.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
              <span style={{ fontSize:11, color:"var(--t3)" }}>stories back to back</span>
            </div>
          )}

          {/* format_seq */}
          {rule.type==="format_seq" && (
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:11, color:"var(--t3)" }}>No consecutive</span>
              <select value={rule.format||""} onChange={e=>onChange({...rule,format:e.target.value})} style={{ fontSize:12, padding:"4px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
                <option value="">Format...</option>
                {FORMATS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <span style={{ fontSize:11, color:"var(--t3)" }}>back to back</span>
            </div>
          )}

          {/* day_restrict */}
          {rule.type==="day_restrict" && (
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <span style={{ fontSize:11, color:"var(--t3)" }}>No publishing on</span>
              <div style={{ display:"flex", gap:3 }}>
                {DAYS.map(d=>(
                  <button key={d} onClick={()=>{ const days=rule.days||[]; onChange({...rule,days:days.includes(d)?days.filter(x=>x!==d):[...days,d]}); }} style={{ padding:"3px 7px", borderRadius:4, fontSize:10, fontWeight:500, background:(rule.days||[]).includes(d)?"var(--t1)":"var(--fill2)", color:(rule.days||[]).includes(d)?"var(--bg)":"var(--t3)", border:"1px solid var(--border)", cursor:"pointer" }}>
                    {d.slice(0,3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description preview */}
          <div style={{ marginTop:8, fontSize:11, color:"var(--t4)", fontStyle:"italic" }}>→ {ruleDescription(rule)}</div>
        </div>
      )}
    </div>
  );
}

// ── Billing Section ──
function BillingSection({ billing, billingLoading, billingAction, billingMsg, workspaceId, onCheckout, onPortal, onDismissMsg }) {
  const { openAssistant } = useAssistant();
  const [callerRole, setCallerRole] = useState(null);

  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email;
        if (!email) return;
        const { data } = await supabase
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", workspaceId)
          .ilike("email", email)
          .maybeSingle();
        setCallerRole(data?.role || null);
      } catch {}
    })();
  }, [workspaceId]);

  const canManageBilling = ["owner", "admin"].includes(callerRole);
  const b = billing || {};
  const planKey = b.plan_key || "studio_starter";
  const planLabel = getPlanLabel(planKey);
  const status = b.subscription_status || "—";

  const statusColor = {
    active:    "#4A9B7F",
    trialing:  "#5B8FB9",
    past_due:  "#C49A3C",
    canceled:  "var(--t4)",
    manual:    "var(--t4)",
    unpaid:    "#C0666A",
    expired:   "#C0666A",
    paused:    "var(--t4)",
    incomplete:"var(--t4)",
  }[status] || "var(--t3)";

  const rowSt = { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"0.5px solid var(--border2)" };
  const labelSt = { fontSize:13, color:"var(--t3)" };
  const valueSt = { fontSize:13, color:"var(--t4)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" };

  const ENTITLEMENT_LABELS = {
    brand_profile_level:  "Brand profiles",
    studio_access_level:  "Studio access",
    reporting_level:      "Reporting",
    paid_ads_mode:        "Paid ads",
    team_features_level:  "Team features",
    priority_processing:  "Processing priority",
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {/* Current plan status */}
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:"var(--t4)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Current plan</div>
        {billingLoading ? (
          <div style={{ fontSize:12, color:"var(--t4)" }}>Loading…</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column" }}>
            {[
              { label:"Plan",          value: planLabel },
              { label:"Status",        value: <span style={{ color:statusColor, fontWeight:500 }}>{status}</span> },
              { label:"Billing",       value: b.billing_period || "—" },
              { label:"Billing email", value: b.billing_email || "—" },
              { label:"Period ends",   value: b.current_period_end ? new Date(b.current_period_end).toLocaleDateString() : "—" },
              { label:"Trial ends",    value: b.trial_ends_at   ? new Date(b.trial_ends_at).toLocaleDateString()   : "—" },
            ].map(({ label, value }) => (
              <div key={label} style={rowSt}>
                <span style={labelSt}>{label}</span>
                <span style={valueSt}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Qualitative entitlements for current plan */}
      {!billingLoading && (
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--t4)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Plan features</div>
          <div style={{ display:"flex", flexDirection:"column" }}>
            {ORDERED_PLANS.find(p => p.key === planKey)?.entitlements
              ? Object.entries(ORDERED_PLANS.find(p => p.key === planKey).entitlements).map(([k, v]) => (
                <div key={k} style={rowSt}>
                  <span style={labelSt}>{ENTITLEMENT_LABELS[k] || k}</span>
                  <span style={valueSt}>{entitlementLabel(v)}</span>
                </div>
              ))
              : null
            }
          </div>
          <div style={{ fontSize:10, color:"var(--t4)", marginTop:8, lineHeight:1.5 }}>
            Final usage limits are not shown here. Fair-use monitoring is active. Contact support for detailed quota information.
          </div>
        </div>
      )}

      {/* Plan picker */}
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:"var(--t4)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Available plans</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {ORDERED_PLANS.map(plan => {
            const isCurrent = plan.key === planKey;
            const isEnterprise = plan.key === "enterprise";
            return (
              <div key={plan.key} style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"12px 14px", borderRadius:9,
                border: isCurrent ? "0.5px solid var(--t1)" : "0.5px solid var(--border)",
                background: isCurrent ? "var(--fill2)" : "transparent",
              }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:isCurrent?600:400, color: isCurrent?"var(--t1)":"var(--t2)", marginBottom:2 }}>
                    {plan.label}
                    {isCurrent && <span style={{ marginLeft:8, fontSize:10, fontWeight:500, color:"var(--t4)", background:"var(--fill2)", border:"0.5px solid var(--border)", borderRadius:4, padding:"1px 5px" }}>current</span>}
                  </div>
                  <div style={{ fontSize:11, color:"var(--t4)" }}>{plan.short_desc}</div>
                </div>
                {canManageBilling && !isCurrent && (
                  isEnterprise ? (
                    <button
                      onClick={() => onCheckout(plan.key)}
                      disabled={!!billingAction}
                      style={{ marginLeft:12, padding:"6px 12px", borderRadius:7, fontSize:11, fontWeight:500, background:"transparent", color:"var(--t2)", border:"0.5px solid var(--border)", cursor:"pointer", flexShrink:0 }}
                    >
                      Contact us
                    </button>
                  ) : (
                    <button
                      onClick={() => onCheckout(plan.key, "monthly")}
                      disabled={!!billingAction}
                      style={{ marginLeft:12, padding:"6px 12px", borderRadius:7, fontSize:11, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"0.5px solid var(--t1)", cursor:billingAction?"not-allowed":"pointer", flexShrink:0, opacity:billingAction?0.6:1 }}
                    >
                      {billingAction === "checkout" ? "Redirecting…" : "Upgrade"}
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Portal / manage button */}
      {canManageBilling && b.stripe_customer_id && (
        <div>
          <button
            onClick={onPortal}
            disabled={!!billingAction}
            style={{ padding:"8px 16px", borderRadius:8, fontSize:12, fontWeight:500, background:"var(--fill2)", color:"var(--t2)", border:"0.5px solid var(--border)", cursor:billingAction?"not-allowed":"pointer", opacity:billingAction?0.6:1 }}
          >
            {billingAction === "portal" ? "Opening…" : "Manage subscription & invoices"}
          </button>
        </div>
      )}

      {/* Non-owner notice */}
      {callerRole && !canManageBilling && (
        <div style={{ fontSize:11, color:"var(--t4)", padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
          Billing is managed by workspace owners and admins.
        </div>
      )}

      {/* Feedback message */}
      {billingMsg && (
        <div style={{
          padding:"10px 14px", borderRadius:8, fontSize:12, lineHeight:1.5,
          background: billingMsg.ok ? "rgba(74,155,127,0.08)" : "rgba(192,102,106,0.08)",
          border: `0.5px solid ${billingMsg.ok ? "rgba(74,155,127,0.3)" : "rgba(192,102,106,0.3)"}`,
          color: billingMsg.ok ? "#4A9B7F" : "#C0666A",
          display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8,
        }}>
          <span>{billingMsg.text}</span>
          <button onClick={onDismissMsg} style={{ background:"none", border:"none", color:"inherit", cursor:"pointer", fontSize:14, lineHeight:1, flexShrink:0 }}>×</button>
        </div>
      )}

      {/* Assistant entry point */}
      <button
        onClick={() => openAssistant(buildAgentContext({
          source_view: "settings",
          source_component: "billing",
          task_type: "billing_help",
          task_intent: "User opened assistant from Billing settings",
          billing_snapshot: billing ? { plan_key: billing.plan_key, subscription_status: billing.subscription_status } : null,
        }))}
        style={{ alignSelf:"flex-start", padding:"6px 12px", borderRadius:7, fontSize:11, fontWeight:500, background:"transparent", color:"var(--t3)", border:"0.5px solid var(--border)", cursor:"pointer" }}
      >
        Ask about plans
      </button>
    </div>
  );
}

// ── Section nav ──
const SECTIONS = [
  { key:"workspace",   label:"Workspace" },
  { key:"rules",       label:"Rules & Alerts" },
  { key:"appearance",  label:"Appearance" },
  { key:"memory",      label:"Workspace Memory" },
  { key:"privacy",     label:"Privacy & Data" },
  { key:"providers",   label:"Providers" },
  { key:"intelligence",label:"Intelligence" },
  { key:"billing",     label:"Billing" },
  { key:"danger",      label:"Danger Zone",  danger:true },
];

const ROLES = [
  { key:"reach",     label:"Reach-leaning",    color:"#5B8FB9" },
  { key:"community", label:"Community-leaning", color:"#4A9B7F" },
  { key:"balanced",  label:"Balanced",          color:"#C49A3C" },
  { key:"special",   label:"Special",           color:"#8B7EC8" },
];

const PRESET_COLORS = ["#C49A3C","#4A9B7F","#C0666A","#8B7EC8","#5B8FB9","#B87333","#7B9E6B","#9B7B6E"];

function ProgDiscuss({ programme, brandName }) {
  const [msgs, setMsgs] = useState([{ role:"assistant", text:`This programme is designed for ${programme.role} content. ${programme.rationale} What would you like to adjust or explore?` }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!input.trim()) return;
    const userMsg = { role:"user", text:input };
    const history = [...msgs, userMsg];
    setMsgs(history);
    setInput("");
    setLoading(true);
    try {
      const { text: response } = await runPrompt({
        type:   "programme-discuss",
        params: { programme, brand_name: brandName, history },
        parse:  false,
      });
      setMsgs(h => [...h, { role:"assistant", text:response }]);
    } catch { setMsgs(h => [...h, { role:"assistant", text:"Something went wrong." }]); }
    setLoading(false);
  };

  return (
    <div style={{ borderTop:"0.5px solid var(--border2)", background:"var(--bg2)" }}>
      <div style={{ maxHeight:160, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:8 }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{ maxWidth:"85%", padding:"7px 11px", borderRadius:8, fontSize:12, lineHeight:1.5, background:m.role==="user"?"var(--t1)":"var(--fill2)", color:m.role==="user"?"var(--bg)":"var(--t2)" }}>{m.text}</div>
          </div>
        ))}
        {loading && <div style={{ fontSize:11, color:"var(--t4)" }}>Thinking...</div>}
      </div>
      <div style={{ padding:"8px 14px", borderTop:"0.5px solid var(--border2)", display:"flex", gap:8 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!loading&&send()} placeholder="Ask about this programme..." style={{ flex:1, padding:"6px 10px", borderRadius:7, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none" }}/>
        <button onClick={send} disabled={loading||!input.trim()} style={{ padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer" }}>Send</button>
      </div>
    </div>
  );
}

// ─── Workspace members panel ─────────────────────────────
// Fetches live data from /api/workspace-members via service-role API route.
// All state is local so it doesn't pollute the parent SettingsModal.

const MEMBER_ROLES = ["owner", "admin", "editor", "member", "viewer"];

function WorkspaceMembersPanel({ workspaceId, appName }) {
  const [members,      setMembers]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [loadError,    setLoadError]    = useState(null);
  const [newEmail,     setNewEmail]     = useState("");
  const [newRole,      setNewRole]      = useState("member");
  const [adding,       setAdding]       = useState(false);
  const [addError,     setAddError]     = useState(null);
  const [removingId,   setRemovingId]   = useState(null);
  const [callerEmail,  setCallerEmail]  = useState(null);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const load = async () => {
    setLoading(true); setLoadError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/workspace-members?workspace_id=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load members");
      setMembers(json.members || []);
      // Resolve caller identity for role checks
      const { data: { session } } = await supabase.auth.getSession();
      setCallerEmail(session?.user?.email || null);
    } catch (e) { setLoadError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (workspaceId) load(); }, [workspaceId]);

  const callerMember = members.find(m =>
    callerEmail && m.email?.toLowerCase() === callerEmail.toLowerCase()
  );
  const canManage = ["owner", "admin"].includes(callerMember?.role);

  const addMember = async () => {
    if (!newEmail.trim()) return;
    setAdding(true); setAddError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/workspace-members", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: workspaceId, email: newEmail.trim(), role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add member");
      setMembers(prev => [...prev, json.member]);
      setNewEmail(""); setNewRole("member");
    } catch (e) { setAddError(e.message); }
    finally { setAdding(false); }
  };

  const removeMember = async (memberId) => {
    setRemovingId(memberId);
    try {
      const token = await getToken();
      const res = await fetch("/api/workspace-members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: workspaceId, member_id: memberId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to remove member");
      setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (e) { setLoadError(e.message); }
    finally { setRemovingId(null); }
  };

  const rowStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 12px", borderRadius: 8, background: "var(--fill2)",
    border: "0.5px solid var(--border)", marginBottom: 6,
  };
  const pillStyle = {
    fontSize: 10, padding: "2px 8px", borderRadius: 99,
    background: "var(--bg3)", color: "var(--t3)",
    border: "0.5px solid var(--border)", flexShrink: 0,
  };
  const inputSm = {
    padding: "6px 10px", borderRadius: 7, fontSize: 12,
    background: "var(--fill2)", border: "0.5px solid var(--border)",
    color: "var(--t1)", outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Member list */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          Team members
        </div>

        {loading && (
          <div style={{ fontSize: 12, color: "var(--t4)", padding: "10px 0" }}>Loading members…</div>
        )}
        {loadError && (
          <div style={{ fontSize: 11, color: "#C0666A", padding: "8px 12px", borderRadius: 6, background: "rgba(192,102,106,0.08)", border: "0.5px solid rgba(192,102,106,0.3)", marginBottom: 8 }}>
            {loadError}
          </div>
        )}

        {!loading && members.length === 0 && !loadError && (
          <div style={{ ...rowStyle, justifyContent: "center" }}>
            <span style={{ fontSize: 12, color: "var(--t4)" }}>
              No members seeded yet. Add yourself below to secure this workspace.
            </span>
          </div>
        )}

        {members.map(m => (
          <div key={m.id} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.email}
              </div>
              {m.user_id && (
                <div style={{ fontSize: 10, color: "var(--t4)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", marginTop: 2 }}>
                  linked
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 10, flexShrink: 0 }}>
              <span style={pillStyle}>{m.role}</span>
              {canManage && m.id && (
                <button
                  onClick={() => removeMember(m.id)}
                  disabled={removingId === m.id}
                  style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, background: "transparent", color: "var(--t4)", border: "0.5px solid var(--border)", cursor: "pointer" }}
                >
                  {removingId === m.id ? "…" : "Remove"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add member form */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Add member
        </div>

        {!canManage && !loading && members.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--t4)", marginBottom: 8 }}>
            Only owners and admins can add or remove members.
          </div>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !adding && addMember()}
            placeholder="email@example.com"
            style={{ ...inputSm, flex: 1 }}
            disabled={adding}
          />
          <select
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            style={{ ...inputSm, width: 100 }}
            disabled={adding}
          >
            {MEMBER_ROLES.map(r => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
          <button
            onClick={addMember}
            disabled={adding || !newEmail.trim()}
            style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 500, background: "var(--t1)", color: "var(--bg)", border: "none", cursor: "pointer", flexShrink: 0 }}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>

        {addError && (
          <div style={{ fontSize: 11, color: "#C0666A", marginTop: 6 }}>{addError}</div>
        )}

        <div style={{ marginTop: 8, fontSize: 11, color: "var(--t4)", lineHeight: 1.5 }}>
          Roles: Owner · Admin · Editor · Member · Viewer.
          {members.length === 0 && " Add yourself as Owner first to secure this workspace."}
        </div>
      </div>
    </div>
  );
}

export default function SettingsModal({ isOpen, onClose, stories=[], onSettingsChange, initialSettings, version="", tenant, onRunPredictions, runningPredictions=false, onRunOnboarding, pipelineDisplayMode = "essential", onPipelineDisplayModeChange }) {
  const VERSION_NUM = version;
  const { openAssistant } = useAssistant();
  const [section,  setSection]  = usePersistentState("settings_section", "workspace");
  const [settings, setSettings] = useState(mergeSettings(initialSettings));
  const [saved,    setSaved]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const autoSaveReadyRef = useRef(false);
  const autoSaveTimerRef = useRef(null);

  // Rules state
  const rules    = settings.strategy?.rules || [];
  const conflicts= detectConflicts(rules);
  const [aiAuditText,   setAiAuditText]   = useState("");
  const [auditRunning,  setAuditRunning]  = useState(false);
  const [auditResult,   setAuditResult]   = useState(null);
  const [resolveText,   setResolveText]   = useState("");
  const [resolving,     setResolving]     = useState(false);
  const [suggestRunning,setSuggestRunning]= useState(false);
  const [suggestions,   setSuggestions]   = useState([]);
  const [stratAudit,    setStratAudit]    = useState(null);
  const [stratRunning,  setStratRunning]  = useState(false);
  const [stratContext,  setStratContext]  = useState("");
  const [progAudit,     setProgAudit]     = useState(null);
  const [progRunning,   setProgRunning]   = useState(false);
  const [insightCount,  setInsightCount]  = useState(0);
  const [insights,      setInsights]      = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightError,  setInsightError]  = useState(null);
  const [generatingInsights,   setGeneratingInsights]   = useState(false);
  const [snapshotCount,        setSnapshotCount]        = useState(0);
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState(0);
  const [privacySettings, setPrivacySettings] = useState(null);
  const [privacyLoading,  setPrivacyLoading]  = useState(false);
  const [privacySaving,   setPrivacySaving]   = useState(false);
  const [privacyError,    setPrivacyError]    = useState(null);
  const autoScannedRef = useRef(false);
  const appName = getAppName(settings);
  const languageSummary = getBrandLanguages(settings).map(l => l.key.toUpperCase()).join(" → ");

  useEffect(() => {
    if (initialSettings) {
      autoSaveReadyRef.current = false;
      setSettings(mergeSettings(initialSettings));
    }
  }, [initialSettings]);

  // Keyboard close
  useEffect(() => {
    const h = (e) => { if (e.key==="Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Onboarding state
  const [obStep,        setObStep]        = useState(null);
  const [obMessages,    setObMessages]    = useState([]);
  const [obInput,       setObInput]       = useState("");
  const [obLoading,     setObLoading]     = useState(false);
  const [obDraft,       setObDraft]       = useState(null);

  // Asset library state
  const [assets,        setAssets]        = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [uploadingAsset,setUploadingAsset]= useState(false);
  const [assetError,    setAssetError]    = useState(null);
  const [dragOver,      setDragOver]      = useState(false);

  const activeTenant = useMemo(() => normalizeTenant(tenant), [tenant]);
  const BRAND_PROFILE_ID = activeTenant.brand_profile_id;
  const WORKSPACE_ID     = activeTenant.workspace_id;

  const loadInsights = async () => {
    setInsightsLoading(true);
    setInsightError(null);
    let countQuery = supabase
      .from("intelligence_insights")
      .select("id", { count: "exact", head: true });
	    let listQuery = supabase
	      .from("intelligence_insights")
	      .select("*")
	      .order("created_at", { ascending: false })
	      .limit(section === "memory" ? 50 : 12);
    let snapshotQuery = supabase
      .from("performance_snapshots")
      .select("id", { count: "exact", head: true });
    if (WORKSPACE_ID) {
      countQuery = countQuery.eq("workspace_id", WORKSPACE_ID);
      listQuery = listQuery.eq("workspace_id", WORKSPACE_ID);
      snapshotQuery = snapshotQuery.eq("workspace_id", WORKSPACE_ID);
    }
    if (BRAND_PROFILE_ID) {
      countQuery = countQuery.eq("brand_profile_id", BRAND_PROFILE_ID);
      listQuery = listQuery.eq("brand_profile_id", BRAND_PROFILE_ID);
      snapshotQuery = snapshotQuery.eq("brand_profile_id", BRAND_PROFILE_ID);
    }
    try {
      const [{ count, error: countError }, { data, error: listError }, { count: snapshots, error: snapshotError }] = await Promise.all([countQuery, listQuery, snapshotQuery]);
      if (countError || listError) throw countError || listError;
      setInsightCount(count || 0);
      setInsights(data || []);
      setSnapshotCount(snapshotError ? 0 : (snapshots || 0));

      // Check for new agent_feedback corrections since the last scan
      const lastScan = (data || [])
        .filter(i => i.source === "agent_feedback")
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      let fbQuery = supabase
        .from("agent_feedback")
        .select("id", { count: "exact", head: true })
        .in("correction_type", ["edit", "reject", "partial"]);
      if (lastScan?.created_at) fbQuery = fbQuery.gt("created_at", lastScan.created_at);
      if (WORKSPACE_ID)     fbQuery = fbQuery.eq("workspace_id", WORKSPACE_ID);
      if (BRAND_PROFILE_ID) fbQuery = fbQuery.eq("brand_profile_id", BRAND_PROFILE_ID);
      const { count: newFb } = await fbQuery;
      setPendingFeedbackCount(newFb || 0);
    } catch (e) {
      setInsightCount(0);
      setInsights([]);
      setSnapshotCount(0);
      setInsightError("Run the latest Supabase schema to enable intelligence insights.");
    } finally {
      setInsightsLoading(false);
    }
  };

	  useEffect(() => {
	    if (!isOpen || !["intelligence", "memory"].includes(section)) return;
	    autoScannedRef.current = false;
	    loadInsights();
	  }, [isOpen, section, WORKSPACE_ID, BRAND_PROFILE_ID]);

	  useEffect(() => {
	    if (isOpen && ["brand", "strategy", "programmes"].includes(section)) {
	      setSection("workspace");
	    }
	  }, [isOpen, section, setSection]);

  useEffect(() => {
    if (!isOpen || section !== "privacy" || !WORKSPACE_ID) return;
    loadPrivacySettings();
  }, [isOpen, section, WORKSPACE_ID, BRAND_PROFILE_ID]);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const loadPrivacySettings = async () => {
    setPrivacyLoading(true);
    setPrivacyError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/privacy/settings?workspace_id=${encodeURIComponent(WORKSPACE_ID)}&brand_profile_id=${encodeURIComponent(BRAND_PROFILE_ID || "")}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load privacy settings");
      setPrivacySettings(json);
    } catch (e) {
      setPrivacyError(e.message);
    } finally {
      setPrivacyLoading(false);
    }
  };

  const savePrivacySettings = async (patch) => {
    const next = { ...(privacySettings || {}), ...patch };
    setPrivacySettings(next);
    setPrivacySaving(true);
    setPrivacyError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/privacy/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspace_id: WORKSPACE_ID,
          brand_profile_id: BRAND_PROFILE_ID,
          privacy_mode: next.privacy_mode,
          default_data_class: next.default_data_class,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save privacy settings");
      setPrivacySettings(prev => ({ ...(prev || {}), ...json }));
    } catch (e) {
      setPrivacyError(e.message);
    } finally {
      setPrivacySaving(false);
    }
  };

  // Auto-scan once per modal session when >= 3 new corrections are waiting
  useEffect(() => {
    if (pendingFeedbackCount >= 3 && !generatingInsights && !autoScannedRef.current && isOpen && section === "intelligence") {
      autoScannedRef.current = true;
      generateFeedbackInsights();
    }
  }, [pendingFeedbackCount, isOpen, section]);

  const applyCalibrationHint = async (hint, insightId) => {
    const action = hint.suggested_action || hint.pattern || "";
    const avoidMatch = action.match(/\badd\b\s+['"]?([^'"]+?)['"]?\s+to\s+(?:brand\s+)?(?:voice\s+)?avoid/i);
    const next = JSON.parse(JSON.stringify(settings));
    if (avoidMatch) {
      const term = avoidMatch[1].trim();
      if (!next.brand) next.brand = {};
      if (!Array.isArray(next.brand.voice_avoid)) next.brand.voice_avoid = [];
      if (!next.brand.voice_avoid.includes(term)) next.brand.voice_avoid.push(term);
    }
    if (!next.intelligence) next.intelligence = {};
    if (!Array.isArray(next.intelligence.calibration_notes)) next.intelligence.calibration_notes = [];
    const note = `${hint.pattern}: ${action}`;
    if (!next.intelligence.calibration_notes.includes(note)) next.intelligence.calibration_notes.push(note);
    setSettings(next);
    try {
      await supabase.from("brand_profiles").upsert({ id: BRAND_PROFILE_ID, workspace_id: WORKSPACE_ID, name: next.brand?.name, settings: next, brief_doc: JSON.stringify(next) });
      if (onSettingsChange) onSettingsChange(next);
      try { localStorage.setItem(tenantStorageKey("settings", activeTenant), JSON.stringify(next)); } catch {}
    } catch {}
    await updateInsightStatus(insightId, "applied");
  };

  const generateFeedbackInsights = async () => {
    setGeneratingInsights(true);
    setInsightError(null);
    try {
      let query = supabase
        .from("agent_feedback")
        .select("agent_name,correction_type,agent_output,user_correction,notes,agent_confidence,created_at,story_id")
        .in("correction_type", ["edit", "reject", "partial"])
        .order("created_at", { ascending: false })
        .limit(120);
      if (WORKSPACE_ID)     query = query.eq("workspace_id", WORKSPACE_ID);
      if (BRAND_PROFILE_ID) query = query.eq("brand_profile_id", BRAND_PROFILE_ID);
      const { data, error } = await query;
      if (error) throw error;
      if (!(data || []).length) {
        setInsightError("No agent feedback corrections found yet.");
        return;
      }

      const existingFingerprints = new Set(
        insights.map(i => i.payload?.fingerprint).filter(Boolean)
      );
      const groups = new Map();
      for (const row of data) {
        const key = row.agent_name || "unknown-agent";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }

      let created = 0;
      for (const [agentName, rows] of groups.entries()) {
        if (rows.length < 2) continue;
        const latest = rows[0]?.created_at || "";
        const fingerprint = `patterns:${agentName}:${rows.length}:${latest}`;
        if (existingFingerprints.has(fingerprint)) continue;

        // LLM extracts recurring patterns and calibration hints
        let calibration_hints = [];
        let summary = `${agentName} has ${rows.length} corrections.`;
        try {
          const { parsed } = await runPrompt({
            type:    "feedback-patterns",
            params:  { agent_name: agentName, corrections: rows.slice(0, 20) },
            context: { workspace_id: WORKSPACE_ID, brand_profile_id: BRAND_PROFILE_ID },
            parse:   true,
          });
          calibration_hints = parsed?.patterns || [];
          if (parsed?.summary) summary = parsed.summary;
        } catch {}

        await writeInsight({
          workspace_id:     WORKSPACE_ID,
          brand_profile_id: BRAND_PROFILE_ID,
          agent_name:       "feedback-pattern-scanner",
          source:           "agent_feedback",
          category:         "memory",
          entity_type:      "agent",
          summary,
          confidence: Math.min(0.95, 0.5 + rows.length * 0.07),
          payload: {
            fingerprint,
            agent_name:          agentName,
            correction_count:    rows.length,
            calibration_hints,
            latest_feedback_at:  latest,
            story_ids: [...new Set(rows.map(r => r.story_id).filter(Boolean))].slice(0, 8),
          },
        });
        created++;
      }

      setPendingFeedbackCount(0);
      await loadInsights();
      if (!created) setInsightError("No new patterns found — all agents already scanned at this correction count.");
    } catch (e) {
      setInsightError(
        e?.message?.includes("intelligence_insights")
          ? "Run the latest Supabase schema to enable intelligence insights."
          : (e?.message || "Could not generate feedback insights.")
      );
    } finally {
      setGeneratingInsights(false);
    }
  };

	  const updateInsightStatus = async (id, status) => {
	    const patch = { status };
	    if (status === "dismissed") patch.dismissed_at = new Date().toISOString();
	    if (status === "applied") patch.applied_at = new Date().toISOString();
	    if (status === "archived") patch.dismissed_at = new Date().toISOString();
	    if (status === "wrong") patch.dismissed_at = new Date().toISOString();
	    const { error } = await supabase.from("intelligence_insights").update(patch).eq("id", id);
	    if (error) {
	      setInsightError(error.message || "Could not update insight.");
	      return;
	    }
	    await loadInsights();
	  };

	  const updateInsightSummary = async (id, summary) => {
	    const clean = String(summary || "").trim();
	    if (!clean) return;
	    const { error } = await supabase.from("intelligence_insights").update({
	      summary: clean.slice(0, 1400),
	      status: "reviewed",
	    }).eq("id", id);
	    if (error) {
	      setInsightError(error.message || "Could not update memory.");
	      return;
	    }
	    await loadInsights();
	  };

  useEffect(() => {
    if (section === "brand" && isOpen && assets.length === 0) {
      setAssetsLoading(true);
      listAssets(BRAND_PROFILE_ID, WORKSPACE_ID)
        .then(data => setAssets(data||[]))
        .catch(() => setAssets([]))
        .finally(() => setAssetsLoading(false));
    }
  }, [section, isOpen]);

  const [rulesTab, setRulesTab] = useState("scheduling");
  const [gateProfileType, setGateProfileType] = useState("narrative");
  const [anchorInput, setAnchorInput] = useState("");
  const updQGProfile = (type, field, val) => {
    setSettings(s => {
      const n = JSON.parse(JSON.stringify(s));
      if (!n.quality_gate) n.quality_gate = { factual_anchor_terms: [], profiles: {} };
      if (!n.quality_gate.profiles) n.quality_gate.profiles = {};
      if (!n.quality_gate.profiles[type]) n.quality_gate.profiles[type] = {};
      if (val === undefined) { delete n.quality_gate.profiles[type][field]; }
      else { n.quality_gate.profiles[type][field] = val; }
      return n;
    });
  };

  const [progExpandIdx, setProgExpandIdx] = useState(null);
  const [showCustomThreshold, setShowCustomThreshold] = useState(false);
  const [customThresholdName, setCustomThresholdName] = useState("");
  const [customThresholdValue, setCustomThresholdValue] = useState("");
  const [customThresholdMetric, setCustomThresholdMetric] = useState("views");
  const [customThresholdOp, setCustomThresholdOp] = useState("above");

  // No early return — hooks must always run regardless of isOpen
  const upd = (path, val) => {
    setSettings(s => {
      const n = JSON.parse(JSON.stringify(s));
      const parts = path.split(".");
      let obj = n;
      for (let i=0; i<parts.length-1; i++) obj = obj[parts[i]];
      obj[parts[parts.length-1]] = val;
      return n;
    });
  };

  const updRule = (i, val) => {
    const newRules = rules.map((r,idx)=>idx===i?val:r);
    upd("strategy.rules", newRules);
  };

  const addRule = () => upd("strategy.rules", [...rules, { id:crypto.randomUUID(), type:"", active:true }]);
  const delRule = (i) => upd("strategy.rules", rules.filter((_,idx)=>idx!==i));

  const programmes = settings.strategy?.programmes || [];
  const contentTemplates = settings.strategy?.content_templates || [];

  const runStratAudit = async () => {
    setStratRunning(true);
    const published = stories.filter(s => s.status==="published" && s.metrics_completion);
    const byProg = {};
    for (const s of published) {
      const k = s.format||"standard";
      if (!byProg[k]) byProg[k] = [];
      byProg[k].push(parseFloat(s.metrics_completion)||0);
    }
    const perfSummary = Object.entries(byProg).map(([k,vals])=>`${k}: avg ${(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)}% (${vals.length} videos)`).join(", ");

    try {
      const { text } = await runPrompt({
        type:   "strategy-audit",
        params: {
          brand_name:      settings.brand.name,
          goal_primary:    settings.brand.goal_primary,
          goal_secondary:  settings.brand.goal_secondary,
          weekly_cadence:  settings.strategy?.weekly_cadence,
          programmes,
          perf_summary:    perfSummary,
          user_context:    stratContext,
        },
        parse:  false,
      });
      setStratAudit(text);
    } catch(e) { setStratAudit("Audit failed."); }
    setStratRunning(false);
  };

  const suggestProgrammes = async () => {
    setProgRunning(true);
    try {
      const { parsed } = await runPrompt({
        type:   "alerts-suggest",
        params: {
          brand_name:   settings.brand.name,
          content_type: settings.brand.content_type,
          goal_primary: settings.brand.goal_primary,
          programmes,
          voice: settings.brand.voice,
          avoid: settings.brand.avoid,
        },
      });
      if (parsed) setProgAudit(parsed);
    } catch(e) { setProgAudit({ warnings:["Programme suggestions failed."] }); }
    setProgRunning(false);
  };

  const addProgramme = (preset) => {
    const newProg = preset || {
      id: crypto.randomUUID(), name: "New Programme", color: "#888", role: "balanced", weight: 0,
      description: "", target_audience_desc: "", primary_goal: "", platforms: [], cadence: "",
      tone: "", example_topics: "", avoid_topics: "", active: true,
      angle_suggestions: [], custom_fields: [],
    };
    upd("strategy.programmes", [...programmes, newProg]);
  };

  const updProg = (i, val) => {
    upd("strategy.programmes", programmes.map((p,idx)=>idx===i?val:p));
  };

  const delProg = (i) => {
    upd("strategy.programmes", programmes.filter((_,idx)=>idx!==i));
  };

  const addContentTemplate = (preset) => {
    const template = normalizeTemplate(preset || {
      name: "New template",
      content_type: "narrative",
      objective: "",
      audience: "",
      channels: [],
      deliverable_type: "",
      required_fields: [],
      workflow_steps: ["brief", "copy", "assets", "review"],
      distinct_reason: "",
    }, contentTemplates);
    upd("strategy.content_templates", [...contentTemplates, template]);
  };

  const updContentTemplate = (i, val) => {
    upd("strategy.content_templates", contentTemplates.map((t, idx) => idx === i ? val : t));
  };

  const delContentTemplate = (i) => {
    upd("strategy.content_templates", contentTemplates.filter((_, idx) => idx !== i));
  };

  const persistSettings = async (nextSettings) => {
    setSaving(true);
    try {
      await supabase.from("brand_profiles").upsert({
        id: BRAND_PROFILE_ID,
        workspace_id: WORKSPACE_ID,
        name: nextSettings.brand.name,
        identity_voice: nextSettings.brand.voice,
        identity_avoid: nextSettings.brand.avoid,
        goal_primary: nextSettings.brand.goal_primary,
        goal_secondary: nextSettings.brand.goal_secondary,
        language_primary: nextSettings.brand.language_primary,
        languages_secondary: nextSettings.brand.languages_secondary,
        settings: nextSettings,
        brief_doc: JSON.stringify(nextSettings),
        // provider_config removed in v3.10.1 — provider credentials now
        // saved via /api/provider-config to the secure provider_secrets
        // table, not exposed in brand_profiles JSON.
      });
      if (onSettingsChange) onSettingsChange(nextSettings);
      try { localStorage.setItem(tenantStorageKey("settings", activeTenant), JSON.stringify(nextSettings)); } catch {}
      setSaved(true);
      setTimeout(()=>setSaved(false), 2000);
    } catch(e) { setSaved(false); }
    setSaving(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!autoSaveReadyRef.current) {
      autoSaveReadyRef.current = true;
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const snapshot = settings;
    autoSaveTimerRef.current = setTimeout(() => {
      persistSettings(snapshot);
    }, 650);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [settings, isOpen]);

  // AI rule suggestions
  const suggestRules = async () => {
    setSuggestRunning(true);
    const published = stories.filter(s=>s.status==="published"&&s.metrics_completion);
    const top_performers = published.length > 0
      ? published.sort((a,b)=>b.metrics_completion-a.metrics_completion).slice(0,3).map(s=>`${s.title} (${s.format}, ${s.archetype}, ${s.metrics_completion}% completion)`).join("; ")
      : "";

    try {
      const { parsed } = await runPrompt({
        type:   "rules-suggest",
        params: {
          brand_name:      settings.brand.name,
          content_type:    settings.brand.content_type,
          goal_primary:    settings.brand.goal_primary,
          goal_secondary:  settings.brand.goal_secondary,
          weekly_cadence:  settings.strategy?.weekly_cadence,
          format_mix:      settings.strategy?.format_mix,
          published_count: published.length,
          top_performers,
        },
      });
      setSuggestions(parsed || []);
    } catch(e) { setSuggestions([]); }
    setSuggestRunning(false);
  };

  // AI strategy audit
  const runAudit = async () => {
    setAuditRunning(true);
    const rules_description = rules.length
      ? rules.map((r,i)=>`${i+1}. ${ruleDescription(r)} (${r.active!==false?"active":"inactive"})`).join("\n")
      : "No rules configured";
    const conflicts_description = conflicts.length ? conflicts.map(c=>c.reason).join("; ") : "None";

    try {
      const { text } = await runPrompt({
        type:   "rules-audit",
        params: {
          brand_name:   settings.brand.name,
          goal_primary: settings.brand.goal_primary,
          format_mix:   settings.strategy?.format_mix,
          rules_description,
          conflicts_description,
          user_context: aiAuditText,
        },
        parse:  false,
      });
      setAuditResult(text);
    } catch(e) { setAuditResult("Audit failed — try again."); }
    setAuditRunning(false);
  };

  // AI conflict resolution
  const resolveConflicts = async () => {
    setResolving(true);
    const rules_ordered  = rules.map((r,i)=>`${i+1}. ${ruleDescription(r)}`).join("\n");
    const conflicts_list = conflicts.map(c=>`- ${c.reason}`).join("\n");

    try {
      const { parsed } = await runPrompt({
        type:   "rules-conflict-resolve",
        params: {
          brand_name:      settings.brand.name,
          rules_ordered,
          conflicts_list,
          user_preference: resolveText,
        },
      });
      if (parsed?.new_order) {
        const reordered = parsed.new_order.map(i=>rules[i]).filter(Boolean);
        upd("strategy.rules", reordered);
        setAuditResult(`✓ Resolved: ${parsed.explanation}\n\nChanges:\n${(parsed.changes||[]).map(c=>`• ${c}`).join("\n")}`);
      }
    } catch(e) { setAuditResult("Conflict resolution failed — try again."); }
    setResolving(false);
  };



  // Onboarding conversation
  const startOnboarding = () => {
    setObStep("chat");
    setObMessages([{
      role: "assistant",
      text: `Hi! I'll help you set up your brand profile. You can drop a brand doc here and I'll read it, or just tell me about your brand in your own words. What's the name and what kind of content do you make?`
    }]);
  };

  const sendObMessage = async (text, fileText) => {
    const userMsg = { role:"user", text: fileText ? `[Uploaded document]

${fileText.slice(0,3000)}` : text };
    const newMessages = [...obMessages, userMsg];
    setObMessages(newMessages);
    setObInput("");
    setObLoading(true);

    const history = newMessages.map(m => `${m.role==="user"?"User":"Assistant"}: ${m.text}`).join("\n\n");
    const currentBrand = JSON.stringify(settings.brand, null, 2);
    const currentTemplates = JSON.stringify(contentTemplates, null, 2);
    const brandMemory = assets
      .filter(a => a.content_summary)
      .slice(0, 8)
      .map(a => `- ${a.file_name}: ${a.content_summary}`)
      .join("\n");

    try {
      const { text: response, parsed } = await runPrompt({
        type:   "onboarding-chat",
        params: {
          current_brand_json: currentBrand,
          current_templates_json: currentTemplates,
          brand_memory: brandMemory,
          history,
        },
      });

      // parsed = { clean_response, extracted } from onboarding-chat prompt
      let cleanResponse = parsed?.clean_response ?? response;
      if (parsed?.extracted) {
        setObDraft(parsed.extracted);
        cleanResponse = cleanResponse || "Here's what I've extracted from our conversation. Review and confirm to apply to your brand profile.";
      }

      setObMessages(prev => [...prev, { role:"assistant", text: cleanResponse }]);
    } catch(e) { setObMessages(prev => [...prev, { role:"assistant", text:"Something went wrong — try again." }]); }
    setObLoading(false);
  };

  const applyObDraft = () => {
    if (!obDraft) return;
    const proposedTemplates = Array.isArray(obDraft.content_templates) ? obDraft.content_templates : [];
    const distinctTemplates = proposedTemplates
      .map(t => normalizeTemplate(t, contentTemplates))
      .filter(t => isDistinctTemplate(t, contentTemplates));

    Object.entries(obDraft).forEach(([k,v]) => {
      if (k === "content_templates") return;
      if (k === "locked_elements") upd("brand.locked_elements", v);
      else if (k in settings.brand) upd(`brand.${k}`, v);
    });
    if (distinctTemplates.length) {
      upd("strategy.content_templates", [...contentTemplates, ...distinctTemplates]);
    }
    setObStep(null);
    setObDraft(null);
    setObMessages([]);
  };

  // Asset upload handler
  const handleAssetUpload = async (file, assetType) => {
    setUploadingAsset(true);
    setAssetError(null);
    try {
      // Extract text for AI summary
      const fileText = await extractTextFromFile(file);

      // Upload securely
      const doc = await uploadAsset({
        file,
        brandProfileId: BRAND_PROFILE_ID,
        workspaceId:    WORKSPACE_ID,
        assetType:      assetType || "other",
        displayName:    file.name,
      });

      // If text extracted, get AI summary
      if (fileText) {
        try {
          const { text: summary } = await runPrompt({
            type:   "summarize-content",
            params: { excerpt: fileText.slice(0, 2000) },
            parse:  false,
          });
          await updateAssetSummary(doc.id, summary);
          doc.content_summary = summary;

          // If onboarding is active, feed document to conversation
          if (obStep === "chat") {
            sendObMessage("", fileText);
          }
        } catch {}
      }

      setAssets(prev => [doc, ...prev]);
    } catch(e) { setAssetError(e.message); }
    setUploadingAsset(false);
  };

  const handleFileDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleAssetUpload(file, "brand_guide");
  };

  const handleAssetDelete = async (assetId) => {
    try {
      await deleteAsset(assetId, BRAND_PROFILE_ID);
      setAssets(prev => prev.filter(a => a.id !== assetId));
    } catch(e) { setAssetError(e.message); }
  };

  // ── Billing state ──
  const [billing,        setBilling]        = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingAction,  setBillingAction]  = useState(null); // null | "checkout" | "portal"
  const [billingMsg,     setBillingMsg]     = useState(null); // { ok, text }

  useEffect(() => {
    if (!isOpen || section !== "billing" || !WORKSPACE_ID) return;
    setBillingLoading(true);
    getWorkspaceBilling(WORKSPACE_ID)
      .then(raw => setBilling(normalizeBilling(raw)))
      .catch(() => setBilling(normalizeBilling(null)))
      .finally(() => setBillingLoading(false));
  }, [isOpen, section, WORKSPACE_ID]);

  const startCheckout = async (plan_key, billing_period = "monthly") => {
    setBillingAction("checkout");
    setBillingMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: WORKSPACE_ID, plan_key, billing_period }),
      });
      const json = await res.json();
      if (json.contact) {
        setBillingMsg({ ok: true, text: json.message });
      } else if (json.url) {
        window.location.href = json.url;
      } else {
        setBillingMsg({ ok: false, text: json.error || "Checkout unavailable." });
      }
    } catch (e) {
      setBillingMsg({ ok: false, text: e.message || "Checkout failed." });
    } finally {
      setBillingAction(null);
    }
  };

  const openPortal = async () => {
    setBillingAction("portal");
    setBillingMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: WORKSPACE_ID }),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        setBillingMsg({ ok: false, text: json.error || "Billing portal unavailable." });
      }
    } catch (e) {
      setBillingMsg({ ok: false, text: e.message || "Portal failed." });
    } finally {
      setBillingAction(null);
    }
  };

  const inputStyle = { width:"100%", padding:"8px 10px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:13, outline:"none", fontFamily:"inherit" };
  const selStyle = { ...inputStyle };

  if (!isOpen) return null;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(8px)", padding:24 }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:"100%", height:"100vh", borderRadius:0, display:"flex", borderRadius:14, overflow:"hidden", background:"var(--sheet)", boxShadow:"0 32px 80px rgba(0,0,0,0.3)" }}>

        {/* ── Left nav ── */}
        <div style={{ width:200, borderRight:"1px solid var(--border2)", padding:"20px 0", flexShrink:0, display:"flex", flexDirection:"column" }}>
	          <div style={{ padding:"0 16px 16px", borderBottom:"1px solid var(--border2)", marginBottom:8 }}>
	            <div style={{ fontSize:13, fontWeight:600, color:"var(--t1)" }}>Settings</div>
	          </div>
          {SECTIONS.map(s=>(
            <button key={s.key} className={`ce-settings-nav-item${section===s.key ? " is-active" : ""}`} onClick={()=>setSection(s.key)} style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"9px 16px", fontSize:13, fontWeight:section===s.key?500:400, letterSpacing:0,
              background:section===s.key?"var(--fill2)":"transparent",
              color:section===s.key?"var(--t1)":s.danger?"rgba(192,102,106,0.7)":"var(--t3)",
              border:"none", cursor:"pointer", textAlign:"left", width:"100%",
            }}>
              <span>{s.label}</span>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                {s.key==="rules" && conflicts.length>0 && <span style={{ width:16, height:16, borderRadius:"50%", background:"#C0666A", color:"white", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{conflicts.length}</span>}
                {section===s.key && <ChevronRight size={12} color="var(--t3)"/>}
              </div>
            </button>
          ))}
          <div style={{ marginTop:"auto", padding:"16px" }}>
            <div style={{
              width:"100%", padding:"8px", borderRadius:8, fontSize:12, fontWeight:600,
              background:saved?"rgba(74,155,127,0.10)":"var(--fill2)",
              color:saved?"#4A9B7F":"var(--t3)",
              border:"0.5px solid var(--border)",
              display:"flex", alignItems:"center", justifyContent:"center", gap:5,
            }}>
              {saved ? <><Check size={12}/>Saved</> : saving ? "Saving..." : "Auto-save on"}
            </div>
          </div>
        </div>

        {/* ── Right content ── */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div style={{ fontSize:16, fontWeight:600, color:"var(--t1)", letterSpacing:0 }}>{SECTIONS.find(s=>s.key===section)?.label}</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {section==="rules" && rulesTab==="scheduling" && (<>
                <button onClick={addRule} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer" }}>
                  <Plus size={12}/> Add rule
                </button>
                <button onClick={()=>{suggestRules();runAudit();}} disabled={suggestRunning||auditRunning} style={{ padding:"5px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                  {suggestRunning||auditRunning?"Analysing...":"AI audit"}
                </button>
              </>)}
              {section==="rules" && rulesTab==="alerts" && (<>
                <button onClick={()=>setShowCustomThreshold(s=>!s)} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer" }}>
                  <Plus size={12}/> Add threshold
                </button>
                <button onClick={()=>runAudit()} disabled={auditRunning} style={{ padding:"5px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                  {auditRunning?"Analysing...":"AI audit"}
                </button>
              </>)}
              {section==="programmes" && (<>
                <button onClick={()=>addProgramme()} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer" }}>
                  <Plus size={12}/> New programme
                </button>
                <button onClick={()=>openAssistant(buildAgentContext({ workspace_id:WORKSPACE_ID, brand_profile_id:BRAND_PROFILE_ID, source_view:"settings", source_component:"programmes", source_entity_type:"brand_profile", task_type:"suggest_programmes", brand_snapshot:{ name:settings.brand?.name, content_type:settings.brand?.content_type }, suggested_actions:[{id:"suggest_programmes",label:"Suggest programmes for this brand"},{id:"suggest_campaign_ideas",label:"Suggest campaign ideas"},{id:"identify_gaps",label:"Identify gaps in current programmes"}] }))} style={{ padding:"5px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                  Ask assistant
                </button>
              </>)}
              <button onClick={onClose} style={{ width:28, height:28, borderRadius:7, border:"0.5px solid var(--border)", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <X size={13} color="var(--t3)"/>
              </button>
            </div>
          </div>

          {/* ── Brand ── */}
          <ErrorBoundary>
          {section==="brand" && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

              {/* Onboarding */}
	              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, marginBottom:16 }}>
	                Strategy is the primary place to edit brand profile details. This settings mirror remains for compatibility and technical fallback.
              </div>
              {obStep==="chat" ? (
                <div style={{ borderRadius:10, border:"1px solid var(--border)", overflow:"hidden" }}>
                  <div style={{ padding:"12px 14px", background:"var(--bg2)", borderBottom:"1px solid var(--border2)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, fontWeight:600, color:"var(--t1)" }}>Brand onboarding</span>
                    <button onClick={()=>{setObStep(null);setObMessages([]);setObDraft(null);}} style={{ fontSize:11, color:"var(--t3)", background:"transparent", border:"none", cursor:"pointer" }}>Cancel</button>
                  </div>
                  <div style={{ height:200, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:8 }}>
                    {obMessages.map((m,i)=>(
                      <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                        <div style={{ maxWidth:"85%", padding:"8px 12px", borderRadius:8, fontSize:12, lineHeight:1.5, background:m.role==="user"?"var(--t1)":"var(--fill2)", color:m.role==="user"?"var(--bg)":"var(--t2)" }}>
                          {m.text}
                        </div>
                      </div>
                    ))}
                    {obLoading && <div style={{ fontSize:11, color:"var(--t4)" }}>Thinking...</div>}
                  </div>
                  {obDraft && (
                    <div style={{ padding:"10px 14px", background:"rgba(74,155,127,0.06)", borderTop:"1px solid rgba(74,155,127,0.15)", borderBottom:"1px solid var(--border2)" }}>
                      <div style={{ fontSize:11, color:"#4A9B7F", fontWeight:600, marginBottom:6 }}>✓ Extracted brand profile</div>
                      {Object.entries(obDraft).filter(([,v])=>v).map(([k,v])=>(
                        <div key={k} style={{ fontSize:11, color:"var(--t2)", marginBottom:2 }}>
                          <span style={{ color:"var(--t4)" }}>{k}:</span> {k === "content_templates" && Array.isArray(v)
                            ? v.map(t => t.name || t.id).join(", ")
                            : Array.isArray(v) ? v.join(", ") : String(v)}
                        </div>
                      ))}
                      <button onClick={applyObDraft} style={{ marginTop:8, padding:"5px 14px", borderRadius:6, fontSize:11, fontWeight:600, background:"#4A9B7F", color:"white", border:"none", cursor:"pointer" }}>
                        Apply to brand profile
                      </button>
                    </div>
                  )}
                  <div style={{ padding:"10px 14px", borderTop:"1px solid var(--border2)", display:"flex", gap:8 }}>
                    <input value={obInput} onChange={e=>setObInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!obLoading&&obInput.trim()&&sendObMessage(obInput)} placeholder="Type or drop a file..." style={{ ...inputStyle, fontSize:12 }}/>
                    <label style={{ padding:"6px 14px", borderRadius:7, fontSize:11, fontWeight:600, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer", flexShrink:0 }}>
                      Upload<input type="file" accept=".pdf,.txt,.md,.doc,.docx" style={{ display:"none" }} onChange={e=>{const f=e.target.files[0];if(f)handleAssetUpload(f,"brand_guide");}}/>
                    </label>
                    <button onClick={()=>!obLoading&&obInput.trim()&&sendObMessage(obInput)} disabled={obLoading||!obInput.trim()} style={{ padding:"6px 14px", borderRadius:7, fontSize:11, fontWeight:600, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer", flexShrink:0 }}>Send</button>
                  </div>
                </div>
              ) : (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", borderRadius:9, background:"var(--fill2)", border:"1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:500, color:"var(--t1)" }}>Brand brief onboarding</div>
                    <div style={{ fontSize:11, color:"var(--t3)" }}>Drop a brand doc or answer questions to auto-fill your profile</div>
                  </div>
                  <button onClick={startOnboarding} style={{ padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer" }}>Start</button>
                </div>
              )}

              {/* Fields */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>Brand name</div>
                  <input value={settings.brand.name||""} onChange={e=>upd("brand.name",e.target.value)} style={inputStyle} placeholder="Brand name"/>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>Content type</div>
                  <select value={settings.brand.content_type||"narrative"} onChange={e=>upd("brand.content_type",e.target.value)} style={selStyle}>
                    {CONTENT_TYPES.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>Voice</div>
                <textarea value={settings.brand.voice||""} onChange={e=>upd("brand.voice",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="Calm, warm, slightly mischievous..."/>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>Avoid</div>
                <textarea value={settings.brand.avoid||""} onChange={e=>upd("brand.avoid",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="Hot takes, clichés..."/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {["goal_primary","goal_secondary"].map(k=>(
                  <div key={k}>
                    <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>{k==="goal_primary"?"Primary goal":"Secondary goal"}</div>
                    <select value={settings.brand[k]||"community"} onChange={e=>upd(`brand.${k}`,e.target.value)} style={selStyle}>
                      {["community","reach","conversion","awareness"].map(v=><option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Extended brand identity */}
              <div style={{ borderTop:"0.5px solid var(--border2)", paddingTop:18 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"var(--t4)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14 }}>Brand identity</div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <div>
                      <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Industry</div>
                      <input value={settings.brand.industry||""} onChange={e=>upd("brand.industry",e.target.value)} style={inputStyle} placeholder="E.g. Professional services, Retail, SaaS..."/>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Tagline</div>
                      <input value={settings.brand.tagline||""} onChange={e=>upd("brand.tagline",e.target.value)} style={inputStyle} placeholder="One-line brand positioning"/>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Short description</div>
                    <textarea value={settings.brand.short_description||""} onChange={e=>upd("brand.short_description",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="What does this brand do and for whom?"/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Target audience</div>
                    <textarea value={settings.brand.target_audience||""} onChange={e=>upd("brand.target_audience",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="Who is the primary audience? Job role, demographics, interests..."/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Products &amp; services</div>
                    <textarea value={settings.brand.products_services||""} onChange={e=>upd("brand.products_services",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="What does the brand sell or offer?"/>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <div>
                      <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Markets</div>
                      <input value={settings.brand.markets||""} onChange={e=>upd("brand.markets",e.target.value)} style={inputStyle} placeholder="UK, US, Global..."/>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Visual style</div>
                      <input value={settings.brand.visual_style||""} onChange={e=>upd("brand.visual_style",e.target.value)} style={inputStyle} placeholder="Clean minimal, bold, warm editorial..."/>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Brand values</div>
                    <textarea value={settings.brand.brand_values||""} onChange={e=>upd("brand.brand_values",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="Transparency, innovation, community..."/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Differentiators</div>
                    <textarea value={settings.brand.differentiators||""} onChange={e=>upd("brand.differentiators",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="What makes this brand different from competitors?"/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Competitors or references</div>
                    <input value={settings.brand.competitors_or_references||""} onChange={e=>upd("brand.competitors_or_references",e.target.value)} style={inputStyle} placeholder="Brands to differentiate from or reference for tone"/>
                  </div>
                </div>
              </div>

              {/* Assistant entry point */}
              <button
                onClick={()=>openAssistant(buildAgentContext({
                  workspace_id:WORKSPACE_ID, brand_profile_id:BRAND_PROFILE_ID,
                  source_view:"settings", source_component:"brand_profile", source_entity_type:"brand_profile",
                  task_type:"improve_brand_profile",
                  brand_snapshot:{ name:settings.brand?.name, industry:settings.brand?.industry, content_type:settings.brand?.content_type, voice:settings.brand?.voice },
                  suggested_actions:[
                    {id:"improve_brand_profile",label:"Review and improve this brand profile"},
                    {id:"suggest_content_pillars",label:"Suggest content pillars"},
                    {id:"identify_missing",label:"Find missing brand information"},
                  ],
                }))}
                style={{ alignSelf:"flex-start", padding:"6px 12px", borderRadius:7, fontSize:11, fontWeight:500, background:"transparent", color:"var(--t3)", border:"0.5px solid var(--border)", cursor:"pointer" }}
              >
                Ask assistant about this brand profile
              </button>

              {/* Context Library */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em" }}>Context Library</div>
                    <div style={{ fontSize:11, color:"var(--t4)", marginTop:2 }}>Brand docs the AI reads as summaries — raw files stay private.</div>
                  </div>
                  <label style={{ padding:"5px 12px", borderRadius:7, fontSize:11, fontWeight:500, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                    <Plus size={11}/> Upload
                    <input type="file" accept=".pdf,.txt,.md,.doc,.docx" style={{ display:"none" }} onChange={e=>{const f=e.target.files[0];if(f)handleAssetUpload(f);}}/>
                  </label>
                </div>
                <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleFileDrop}
                  style={{ borderRadius:9, border:`2px dashed ${dragOver?"var(--t2)":"var(--border)"}`, padding:"16px", textAlign:"center", marginBottom:8, background:dragOver?"var(--fill2)":"transparent" }}>
                  <div style={{ fontSize:12, color:"var(--t3)" }}>{dragOver?"Drop to upload":"Drag files here — PDF, TXT, MD, DOC"}</div>
                  <div style={{ fontSize:11, color:"var(--t4)", marginTop:3 }}>Max 10MB · Stored securely · AI reads summaries only</div>
                </div>
                {assetError && <div style={{ fontSize:11, color:"#C0666A", marginBottom:6, padding:"6px 10px", borderRadius:6, background:"rgba(192,102,106,0.08)", border:"1px solid rgba(192,102,106,0.2)" }}>{assetError}</div>}
                {uploadingAsset && <div style={{ fontSize:11, color:"var(--t3)", marginBottom:6 }}>Uploading and extracting summary...</div>}
                {assetsLoading ? (
                  <div style={{ fontSize:11, color:"var(--t4)" }}>Loading...</div>
                ) : assets.length===0 ? (
                  <div style={{ fontSize:11, color:"var(--t4)", textAlign:"center", padding:"12px 0" }}>No assets yet</div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {assets.map(asset=>(
                      <div key={asset.id} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)" }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:500, color:"var(--t1)", marginBottom:2 }}>{asset.file_name}</div>
                          <div style={{ fontSize:11, color:"var(--t3)" }}>{asset.content_summary||"No summary extracted"}</div>
                          <div style={{ fontSize:10, color:"var(--t4)", marginTop:3 }}>Uploaded {new Date(asset.created_at).toLocaleDateString()} · Summary only accessible to AI</div>
                        </div>
                        <button onClick={()=>handleAssetDelete(asset.id)} style={{ width:22, height:22, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <Trash2 size={11} color="var(--t4)"/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop:8, padding:"10px 12px", borderRadius:8, border:"1px dashed var(--border)", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:14 }}>📁</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color:"var(--t2)" }}>Google Drive integration</div>
                    <div style={{ fontSize:11, color:"var(--t4)" }}>Link a folder — AI fetches on demand. OAuth read-only.</div>
                  </div>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99, background:"var(--fill2)", color:"var(--t4)", border:"1px solid var(--border)", flexShrink:0 }}>Coming soon</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Strategy ── */}
          {section==="strategy" && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

              {/* Content strategy fields */}
              <div>
	                <div style={{ fontSize:11, fontWeight:600, color:"var(--t4)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Content strategy mirror</div>
	                <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.5, marginBottom:14 }}>Edit day-to-day strategic direction from the Strategy tab. Settings keeps these fields available as an admin fallback.</div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Content goals</div>
                    <textarea value={settings.strategy?.content_goals||""} onChange={e=>upd("strategy.content_goals",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="What should the content achieve? E.g. Build trust, generate leads, grow following..."/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Target platforms</div>
                    <input value={(settings.strategy?.target_platforms||[]).join(", ")} onChange={e=>upd("strategy.target_platforms",e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} style={inputStyle} placeholder="Instagram, LinkedIn, YouTube, TikTok..."/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Content pillars</div>
                    <input value={(settings.strategy?.content_pillars||[]).join(", ")} onChange={e=>upd("strategy.content_pillars",e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} style={inputStyle} placeholder="E.g. Education, Inspiration, Behind the scenes, Social proof..."/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Key messages</div>
                    <textarea value={settings.strategy?.key_messages||""} onChange={e=>upd("strategy.key_messages",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="Core messages to reinforce consistently across all content"/>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <div>
                      <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Preferred angles</div>
                      <textarea value={settings.strategy?.preferred_angles||""} onChange={e=>upd("strategy.preferred_angles",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="Angles that work well for this brand"/>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Avoid angles</div>
                      <textarea value={settings.strategy?.avoid_angles||""} onChange={e=>upd("strategy.avoid_angles",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="Angles to avoid — sensitive, off-brand, or risky"/>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Calls to action</div>
                    <input value={settings.strategy?.calls_to_action||""} onChange={e=>upd("strategy.calls_to_action",e.target.value)} style={inputStyle} placeholder="E.g. Book a call, Visit the link, Download the guide..."/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Claims to handle carefully</div>
                    <textarea value={settings.strategy?.claims_to_use_carefully||""} onChange={e=>upd("strategy.claims_to_use_carefully",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="ROI claims, guarantees, testimonials, before/after comparisons..."/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Compliance sensitivities</div>
                    <textarea value={settings.strategy?.compliance_sensitivities||""} onChange={e=>upd("strategy.compliance_sensitivities",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="Regulated categories, platform restrictions, legal/regulatory notes..."/>
                  </div>
                </div>
              </div>

              {/* Assistant entry point */}
              <button
                onClick={()=>openAssistant(buildAgentContext({
                  workspace_id:WORKSPACE_ID, brand_profile_id:BRAND_PROFILE_ID,
                  source_view:"settings", source_component:"content_strategy", source_entity_type:"brand_profile",
                  task_type:"suggest_content_pillars",
                  brand_snapshot:{ name:settings.brand?.name, content_type:settings.brand?.content_type, content_goals:settings.strategy?.content_goals },
                  suggested_actions:[
                    {id:"suggest_content_pillars",label:"Suggest content pillars"},
                    {id:"suggest_campaign_ideas",label:"Suggest campaign ideas"},
                    {id:"suggest_content_ideas",label:"Suggest content ideas"},
                    {id:"identify_risky_claims",label:"Identify risky claims in this strategy"},
                  ],
                }))}
                style={{ alignSelf:"flex-start", padding:"6px 12px", borderRadius:7, fontSize:11, fontWeight:500, background:"transparent", color:"var(--t3)", border:"0.5px solid var(--border)", cursor:"pointer" }}
              >
                Ask assistant about this strategy
              </button>

              <div style={{ borderTop:"0.5px solid var(--border2)", paddingTop:4 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"var(--t4)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14 }}>Publishing rhythm</div>
              </div>

              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
                Set your publishing rhythm and editorial defaults. Programme weights (how often each format appears) are configured in <button onClick={()=>setSection("programmes")} style={{ fontSize:12, color:"var(--t1)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline", padding:0 }}>Programmes</button>.
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Weekly cadence</div>
                <div style={{ fontSize:11, color:"var(--t3)", marginBottom:10 }}>Target number of episodes published per week. Auto-fill and production alerts use this number.</div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <input type="number" min="1" max="14" value={settings.strategy?.weekly_cadence||4}
                    onChange={e=>upd("strategy.weekly_cadence", Math.min(14,Math.max(1,parseInt(e.target.value)||1)))}
                    style={{ width:72, padding:"8px 12px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:16, outline:"none", textAlign:"center", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}/>
                  <span style={{ fontSize:12, color:"var(--t3)" }}>items per week</span>
                </div>
              </div>
              {/* Content defaults */}
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12 }}>Content defaults</div>
                <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                  {[
                    { key:"auto_translate", label:"Auto-translate after script generation", hint:`${languageSummary} automatically` },
                    { key:"auto_score",     label:"Auto-score stories on research",         hint:"AI scores every result" },
                  ].map(({key,label,hint})=>(
                    <div key={key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"0.5px solid var(--border2)" }}>
                      <div>
                        <div style={{ fontSize:13, color:"var(--t1)" }}>{label}</div>
                        <div style={{ fontSize:11, color:"var(--t3)", marginTop:1 }}>{hint}</div>
                      </div>
                      <button onClick={()=>upd(`strategy.defaults.${key}`,!settings.strategy?.defaults?.[key])} style={{ width:40,height:22,borderRadius:11,border:"none",cursor:"pointer",background:settings.strategy?.defaults?.[key]?"var(--t1)":"var(--t4)",position:"relative",transition:"background 0.2s",flexShrink:0 }}>
                        <div style={{ position:"absolute",top:3,left:settings.strategy?.defaults?.[key]?20:3,width:16,height:16,borderRadius:"50%",background:"var(--bg)",transition:"left 0.2s" }}/>
                      </button>
                    </div>
                  ))}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"0.5px solid var(--border2)" }}>
                    <div>
                      <div style={{ fontSize:13, color:"var(--t1)" }}>Default language</div>
                      <div style={{ fontSize:11, color:"var(--t3)", marginTop:1 }}>Language for new stories</div>
                    </div>
                    <select value={settings.strategy?.defaults?.default_language||"EN"} onChange={e=>upd("strategy.defaults.default_language",e.target.value)} style={{ ...selStyle, width:"auto", fontSize:12, padding:"4px 8px" }}>
                      {["EN","FR","ES","PT","DE","IT"].map(l=><option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Content templates */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em" }}>Content templates</div>
                    <div style={{ fontSize:11, color:"var(--t4)", marginTop:2 }}>Onboarding can create these when brand memory shows a distinct content job.</div>
                  </div>
                  <button onClick={()=>addContentTemplate()} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:7, fontSize:11, fontWeight:500, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                    <Plus size={11}/> New template
                  </button>
                </div>
                <div style={{ display:"grid", gap:8 }}>
                  {contentTemplates.map((template, i) => (
                    <div key={template.id || i} style={{ padding:"12px 14px", borderRadius:9, background:"var(--fill2)", border:"1px solid var(--border)" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 32px", gap:8, alignItems:"center", marginBottom:8 }}>
                        <input value={template.name || ""} onChange={e=>updContentTemplate(i, { ...template, name:e.target.value, id: template.id || slugifyTemplateId(e.target.value) })} placeholder="Template name" style={{ ...inputStyle, fontSize:12, padding:"6px 8px" }}/>
                        <select value={template.content_type || "narrative"} onChange={e=>updContentTemplate(i, { ...template, content_type:e.target.value })} style={{ ...selStyle, fontSize:12, padding:"6px 8px" }}>
                          {CONTENT_TYPES.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                        <button onClick={()=>delContentTemplate(i)} style={{ width:30, height:30, borderRadius:7, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} color="var(--t4)"/>
                        </button>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                        <input value={template.objective || ""} onChange={e=>updContentTemplate(i, { ...template, objective:e.target.value })} placeholder="Objective" style={{ ...inputStyle, fontSize:12, padding:"6px 8px" }}/>
                        <input value={template.audience || ""} onChange={e=>updContentTemplate(i, { ...template, audience:e.target.value })} placeholder="Audience" style={{ ...inputStyle, fontSize:12, padding:"6px 8px" }}/>
                        <input value={(template.channels || []).join(", ")} onChange={e=>updContentTemplate(i, { ...template, channels:e.target.value.split(",").map(s=>s.trim()).filter(Boolean) })} placeholder="Channels, comma separated" style={{ ...inputStyle, fontSize:12, padding:"6px 8px" }}/>
                        <input value={template.deliverable_type || ""} onChange={e=>updContentTemplate(i, { ...template, deliverable_type:e.target.value })} placeholder="Deliverable type" style={{ ...inputStyle, fontSize:12, padding:"6px 8px" }}/>
                        <input value={(template.required_fields || []).join(", ")} onChange={e=>updContentTemplate(i, { ...template, required_fields:e.target.value.split(",").map(s=>s.trim()).filter(Boolean) })} placeholder="Required fields" style={{ ...inputStyle, fontSize:12, padding:"6px 8px" }}/>
                        <input value={(template.workflow_steps || []).join(", ")} onChange={e=>updContentTemplate(i, { ...template, workflow_steps:e.target.value.split(",").map(s=>s.trim()).filter(Boolean) })} placeholder="Workflow steps" style={{ ...inputStyle, fontSize:12, padding:"6px 8px" }}/>
                      </div>
                      {(template.distinct_reason || template.created_by_agent) && (
                        <div style={{ fontSize:11, color:"var(--t4)", lineHeight:1.5 }}>
                          {template.created_by_agent ? "Created by onboarding agent. " : ""}{template.distinct_reason}
                        </div>
                      )}
                    </div>
                  ))}
                  {!contentTemplates.length && (
                    <div style={{ textAlign:"center", padding:"22px 0", color:"var(--t4)", fontSize:12, borderRadius:9, border:"1px dashed var(--border)" }}>
                      No templates yet. Start onboarding or add one manually.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Programmes ── */}
          {section==="programmes" && (
            <div>
              <div style={{ fontSize:12, color:"var(--t3)", marginBottom:14, lineHeight:1.6 }}>
	                Programmes are now primarily edited from Strategy. This settings mirror remains available for compatibility, template configuration, and admin fallback.
              </div>

              {/* Empty state */}
              {programmes.length === 0 && (
                <div style={{ padding:"20px 16px", borderRadius:10, border:"1px dashed var(--border)", marginBottom:16, textAlign:"center" }}>
                  <div style={{ fontSize:13, fontWeight:500, color:"var(--t2)", marginBottom:8 }}>No programmes yet</div>
                  <div style={{ fontSize:11, color:"var(--t4)", lineHeight:1.6, marginBottom:14, maxWidth:340, margin:"0 auto 14px" }}>
                    Examples: Product spotlight, Founder insights, Case studies, Educational tips, Industry commentary, Behind the scenes, Customer stories, Market insight
                  </div>
                  <button onClick={()=>addProgramme()} style={{ padding:"7px 18px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer" }}>
                    Add first programme
                  </button>
                </div>
              )}

              {/* Programme cards */}
              {programmes.map((prog, i) => (
                <div key={prog.id||i} style={{ borderRadius:10, border:"1px solid var(--border)", background:"var(--card)", marginBottom:10, overflow:"hidden", borderLeft:`3px solid ${prog.color||"var(--border)"}` }}>
                  {/* Header */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderBottom:"1px solid var(--border2)", background:"var(--bg2)" }}>
                    {/* Color picker */}
                    <div style={{ position:"relative" }}>
                      <div style={{ width:20, height:20, borderRadius:5, background:prog.color||"#888", cursor:"pointer", border:"2px solid var(--border)", flexShrink:0 }}/>
                      <input type="color" value={prog.color||"#888"} onChange={e=>updProg(i,{...prog,color:e.target.value})} style={{ position:"absolute", inset:0, opacity:0, cursor:"pointer", width:"100%", height:"100%" }}/>
                    </div>
                    <input value={prog.name} onChange={e=>updProg(i,{...prog,name:e.target.value})} style={{ fontSize:13, fontWeight:600, color:"var(--t1)", background:"transparent", border:"none", outline:"none", flex:1, fontFamily:"inherit" }} placeholder="Programme name"/>
                    <select value={prog.role||"balanced"} onChange={e=>updProg(i,{...prog,role:e.target.value})} style={{ fontSize:11, padding:"3px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
                      {ROLES.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                    <button onClick={()=>updProg(i,{...prog,active:prog.active===false})} title={prog.active===false?"Enable":"Disable"} style={{ fontSize:10, padding:"2px 7px", borderRadius:5, border:"0.5px solid var(--border)", background:prog.active===false?"var(--fill2)":"rgba(74,155,127,0.12)", color:prog.active===false?"var(--t4)":"#4A9B7F", cursor:"pointer", flexShrink:0 }}>
                      {prog.active===false?"off":"on"}
                    </button>
                    <button onClick={()=>delProg(i)} style={{ width:24, height:24, borderRadius:5, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <Trash2 size={12} color="var(--t4)"/>
                    </button>
                  </div>

                  {/* Body */}
                  <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:12 }}>
                    {/* Active + weight row */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      <div>
                        <div style={{ fontSize:11, color:"var(--t3)", marginBottom:6 }}>Weekly slot share</div>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                          <input type="number" min="0" max="100" step="5" value={prog.weight||0}
                            onChange={e=>updProg(i,{...prog,weight:Math.min(100,Math.max(0,parseInt(e.target.value)||0))})}
                            style={{ width:48, padding:"4px 8px", borderRadius:6, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:13, outline:"none", textAlign:"center", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}/>
                          <span style={{ fontSize:12, color:"var(--t3)" }}>%</span>
                        </div>
                        <div style={{ position:"relative", height:3, borderRadius:2, background:"var(--bg3)" }}>
                          <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${prog.weight||0}%`, background:prog.color||"var(--t3)", borderRadius:2, transition:"width 0.15s" }}/>
                          <input type="range" min="0" max="100" step="5" value={prog.weight||0}
                            onChange={e=>updProg(i,{...prog,weight:parseInt(e.target.value)})}
                            style={{ position:"absolute", inset:0, width:"100%", opacity:0, cursor:"pointer", height:"100%", margin:0 }}/>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:"var(--t3)", marginBottom:6 }}>Angle suggestions</div>
                        <input value={(prog.angle_suggestions||[]).join(", ")} onChange={e=>updProg(i,{...prog,angle_suggestions:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}
                          style={{ width:"100%", padding:"6px 8px", borderRadius:6, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none" }}
                          placeholder="product launch, founder story, how-to..."/>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <div style={{ fontSize:11, color:"var(--t3)", marginBottom:4 }}>Description</div>
                      <textarea value={prog.description||""} onChange={e=>updProg(i,{...prog,description:e.target.value})} rows={2}
                        style={{ width:"100%", padding:"6px 8px", borderRadius:6, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none", resize:"vertical", fontFamily:"inherit" }}
                        placeholder="What kind of content lives in this programme? Who is it for?"/>
                    </div>

                    {/* Cadence + platforms */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      <div>
                        <div style={{ fontSize:11, color:"var(--t3)", marginBottom:4 }}>Cadence</div>
                        <input value={prog.cadence||""} onChange={e=>updProg(i,{...prog,cadence:e.target.value})}
                          style={{ width:"100%", padding:"6px 8px", borderRadius:6, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none" }}
                          placeholder="Weekly, bi-weekly, monthly..."/>
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:"var(--t3)", marginBottom:4 }}>Platforms</div>
                        <input value={(prog.platforms||[]).join(", ")} onChange={e=>updProg(i,{...prog,platforms:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}
                          style={{ width:"100%", padding:"6px 8px", borderRadius:6, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none" }}
                          placeholder="Instagram, LinkedIn, YouTube..."/>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Total weight */}
              {programmes.length>0 && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)", marginTop:4 }}>
                  <span style={{ fontSize:12, color:"var(--t3)" }}>Total weight</span>
                  <span style={{ fontSize:13, fontWeight:700, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:programmes.reduce((a,p)=>a+(p.weight||0),0)===100?"#4A9B7F":"#C0666A" }}>
                    {programmes.reduce((a,p)=>a+(p.weight||0),0)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Rules & Alerts ── */}
          {section==="rules" && (
            <div>
              {/* Sub-tabs */}
              <div style={{ display:"flex", gap:2, marginBottom:20, padding:"4px", borderRadius:9, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
                {[{key:"scheduling",label:"Scheduling rules"},{key:"alerts",label:"Alert thresholds"},{key:"quality_gate",label:"Quality gate"}].map(t=>(
                  <button key={t.key} onClick={()=>setRulesTab(t.key)} style={{ flex:1, padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:rulesTab===t.key?500:400, background:rulesTab===t.key?"var(--card)":"transparent", color:rulesTab===t.key?"var(--t1)":"var(--t3)", border:rulesTab===t.key?"0.5px solid var(--border)":"none", cursor:"pointer" }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {rulesTab==="alerts" && (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, marginBottom:16 }}>
                    Thresholds that control when the Production Alert triggers and how far ahead it plans. Adjust based on your publishing rhythm.
                  </div>
                  {[
                    { key:"stock_healthy", label:"Healthy stock threshold", hint:"Stories ready — above this = green", min:5, max:60, step:5 },
                    { key:"stock_low",     label:"Low stock threshold",     hint:"Stories ready — below this = red",  min:2, max:30, step:2 },
                    { key:"horizon_days",  label:"Planning horizon",        hint:"Days ahead to calculate coverage",  min:7, max:42, step:7 },
                  ].map(({key,label,hint,min,max,step})=>{
                    const val = settings.strategy?.alerts?.[key] ?? (key==="stock_healthy"?20:key==="stock_low"?10:21);
                    return (
                      <div key={key} style={{ marginBottom:16 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                          <span style={{ fontSize:13, color:"var(--t1)", flex:1 }}>{label}</span>
                          <input type="number" min={min} max={max} step={step} value={val}
                            onChange={e=>upd(`strategy.alerts.${key}`,Math.min(max,Math.max(min,parseInt(e.target.value)||min)))}
                            style={{ width:52, padding:"4px 8px", borderRadius:6, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:13, outline:"none", textAlign:"center", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}/>
                          <span style={{ fontSize:12, color:"var(--t3)", width:28 }}>{key==="horizon_days"?"days":""}</span>
                        </div>
                        <div style={{ fontSize:11, color:"var(--t3)", marginBottom:6 }}>{hint}</div>
                        <div style={{ position:"relative", height:3, borderRadius:2, background:"var(--bg3)" }}>
                          <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${((val-min)/(max-min))*100}%`, background:"var(--t1)", borderRadius:2, transition:"width 0.15s" }}/>
                          <input type="range" min={min} max={max} step={step} value={val}
                            onChange={e=>upd(`strategy.alerts.${key}`,parseInt(e.target.value))}
                            style={{ position:"absolute", inset:0, width:"100%", opacity:0, cursor:"pointer", height:"100%", margin:0 }}/>
                        </div>
                      </div>
                    );
                  })}
                  {/* Custom threshold — shown when Add threshold clicked in header */}
                  {showCustomThreshold && (
                    <div style={{ marginTop:8, padding:"14px", borderRadius:9, border:"0.5px solid var(--border)", background:"var(--card)" }}>
                      <div style={{ fontSize:13, color:"var(--t1)", marginBottom:4 }}>New threshold</div>
                      <div style={{ fontSize:11, color:"var(--t3)", marginBottom:12 }}>
                        Define a custom alert condition. When the metric crosses this value, it will appear in the Production Alert banner.
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        <input value={customThresholdName} onChange={e=>setCustomThresholdName(e.target.value)}
                          placeholder="Name (e.g. Min watch completion rate)"
                          style={{ width:"100%", padding:"7px 10px", borderRadius:7, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none" }}/>
                        <div style={{ display:"flex", gap:8 }}>
                          <select value={customThresholdMetric} onChange={e=>setCustomThresholdMetric(e.target.value)}
                            style={{ flex:1, padding:"7px 10px", borderRadius:7, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none" }}>
                            <option value="views">Views</option>
                            <option value="completion">Watch completion %</option>
                            <option value="saves">Saves</option>
                            <option value="shares">Shares</option>
                            <option value="follows">Follows generated</option>
                            <option value="score">Story score</option>
                            <option value="reach_score">Reach score</option>
                            <option value="stock">Stories in stock</option>
                          </select>
                          <select value={customThresholdOp} onChange={e=>setCustomThresholdOp(e.target.value)}
                            style={{ width:90, padding:"7px 10px", borderRadius:7, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none" }}>
                            <option value="above">above</option>
                            <option value="below">below</option>
                          </select>
                          <input type="number" value={customThresholdValue} onChange={e=>setCustomThresholdValue(e.target.value)}
                            placeholder="Value"
                            style={{ width:80, padding:"7px 10px", borderRadius:7, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none", textAlign:"center", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}/>
                        </div>
                        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                          <button onClick={()=>{setShowCustomThreshold(false);setCustomThresholdName("");setCustomThresholdValue("");}} style={{ padding:"6px 12px", borderRadius:7, fontSize:12, background:"transparent", border:"0.5px solid var(--border)", color:"var(--t3)", cursor:"pointer" }}>Cancel</button>
                          <button onClick={()=>{
                            if(!customThresholdName.trim()||!customThresholdValue) return;
                            const key="custom_"+customThresholdName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_");
                            upd(`strategy.alerts.${key}`, {
                              label: customThresholdName.trim(),
                              metric: customThresholdMetric,
                              operator: customThresholdOp,
                              value: parseInt(customThresholdValue),
                            });
                            setCustomThresholdName(""); setCustomThresholdValue(""); setShowCustomThreshold(false);
                          }} style={{ padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer" }}>
                            Save threshold
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Existing custom thresholds */}
                  {Object.entries(settings.strategy?.alerts||{}).filter(([k])=>k.startsWith("custom_")).map(([k,v])=>(
                    <div key={k} style={{ display:"flex", alignItems:"center", gap:10, marginTop:8, padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border2)" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, color:"var(--t1)" }}>{v?.label||k.replace("custom_","").replace(/_/g," ")}</div>
                        <div style={{ fontSize:11, color:"var(--t3)", marginTop:1 }}>{v?.metric} {v?.operator} {v?.value}</div>
                      </div>
                      <button onClick={()=>{ const a={...settings.strategy?.alerts}; delete a[k]; upd("strategy.alerts",a); }} style={{ fontSize:12, color:"var(--t4)", background:"transparent", border:"none", cursor:"pointer", padding:"0 4px" }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {rulesTab==="scheduling" && (<div>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, marginBottom:16 }}>
                Rules are applied in priority order — Rule 1 takes precedence over Rule 2. The auto-fill calendar respects these rules when scheduling stories.
              </div>
              {/* Conflict banner */}
              {conflicts.length>0 && (
                <div style={{ padding:"12px 14px", borderRadius:9, background:"rgba(192,102,106,0.08)", border:"1px solid rgba(192,102,106,0.2)", marginBottom:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <AlertCircle size={13} color="#C0666A"/>
                      <span style={{ fontSize:12, fontWeight:600, color:"#C0666A" }}>{conflicts.length} conflict{conflicts.length>1?"s":""} detected</span>
                    </div>
                  </div>
                  {conflicts.map((c,i)=>(
                    <div key={i} style={{ fontSize:11, color:"var(--t2)", marginBottom:4 }}>• {c.reason}</div>
                  ))}
                  <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"flex-start" }}>
                    <textarea value={resolveText} onChange={e=>setResolveText(e.target.value)} placeholder="Optional: tell AI how to resolve (e.g. 'reach wins on Mon-Wed, community Fri-Sun')" rows={2} style={{ ...inputStyle, flex:1, fontSize:12, resize:"none" }}/>
                    <button onClick={resolveConflicts} disabled={resolving} style={{ padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600, background:"#C0666A", color:"white", border:"none", cursor:resolving?"not-allowed":"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                      {resolving?"Resolving...":"Resolve with AI"}
                    </button>
                  </div>
                </div>
              )}

              {/* AI audit + suggestions — merged bubble */}
              {(auditResult || suggestions.length > 0) && (
                <div style={{ borderRadius:9, border:"0.5px solid var(--border)", background:"var(--fill2)", marginBottom:16, overflow:"hidden" }}>
                  {auditResult && (
                    <div style={{ padding:"14px 16px", fontSize:12, color:"var(--t2)", lineHeight:1.7, whiteSpace:"pre-wrap", borderBottom: suggestions.length>0 ? "0.5px solid var(--border2)" : "none" }}>
                      {auditResult}
                    </div>
                  )}
                  {suggestions.length > 0 && (
                    <div style={{ padding:"12px 16px" }}>
                      <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Suggested rules</div>
                      {suggestions.map((s,i)=>(
                        <div key={i} style={{ padding:"10px 12px", borderRadius:8, background:"var(--card)", border:"0.5px solid var(--border2)", marginBottom:6 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, color:"var(--t1)", marginBottom:3 }}>{s.label}</div>
                              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.5 }}>{s.reasoning}</div>
                            </div>
                            <button onClick={()=>{ upd("strategy.rules",[...rules,{id:crypto.randomUUID(),active:true,...(s.config||{}),type:s.type}]); setSuggestions(sugg=>sugg.filter((_,j)=>j!==i)); }} style={{ padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer", flexShrink:0 }}>
                              Add
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ padding:"10px 16px", borderTop:"0.5px solid var(--border2)", display:"flex", gap:8, alignItems:"center" }}>
                    <textarea value={aiAuditText} onChange={e=>setAiAuditText(e.target.value)} placeholder="Add context for follow-up..." rows={1} style={{ flex:1, padding:"6px 10px", borderRadius:7, background:"var(--card)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none", resize:"none", fontFamily:"inherit" }}/>
                    <button onClick={()=>{suggestRules();runAudit();}} disabled={suggestRunning||auditRunning} style={{ padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t2)", cursor:"pointer", flexShrink:0 }}>
                      {suggestRunning||auditRunning?"Analysing...":"Re-run"}
                    </button>
                  </div>
                </div>
              )}

              {/* Rules list */}
              <div style={{ fontSize:11, color:"var(--t3)", marginBottom:8 }}>Rules are applied in order — Rule 1 takes priority over Rule 2 and so on.</div>
              {!rules.length && <div style={{ textAlign:"center", padding:"32px 0", color:"var(--t4)", fontSize:12 }}>No rules yet. Add rules manually or use AI suggestions.</div>}
              {rules.map((rule,i)=>(
                <RuleBuilder key={rule.id||i} rule={rule} index={i} onChange={v=>updRule(i,v)} onDelete={()=>delRule(i)} conflicts={conflicts} totalRules={rules.length}/>
              ))}
              </div>)}

              {rulesTab==="quality_gate" && (() => {
                const GQ_TYPES = [
                  { key:"narrative",    label:"Narrative",    defaults:{ minAngle:35, minScriptWords:90,  maxScriptWords:260, needsHook:true, needsFact:true,  needsObjective:false, needsAudience:false, needsChannel:false, needsDeliverable:false } },
                  { key:"ad",           label:"Ad",           defaults:{ minAngle:20, minScriptWords:25,  maxScriptWords:180, needsHook:true, needsFact:false, needsObjective:true,  needsAudience:true,  needsChannel:true,  needsDeliverable:true  } },
                  { key:"publicity",    label:"Publicity",    defaults:{ minAngle:24, minScriptWords:35,  maxScriptWords:320, needsHook:true, needsFact:true,  needsObjective:true,  needsAudience:false, needsChannel:true,  needsDeliverable:true  } },
                  { key:"product_post", label:"Product post", defaults:{ minAngle:22, minScriptWords:25,  maxScriptWords:220, needsHook:true, needsFact:false, needsObjective:true,  needsAudience:true,  needsChannel:true,  needsDeliverable:true  } },
                  { key:"educational",  label:"Educational",  defaults:{ minAngle:26, minScriptWords:50,  maxScriptWords:320, needsHook:true, needsFact:false, needsObjective:true,  needsAudience:true,  needsChannel:true,  needsDeliverable:true  } },
                  { key:"community",    label:"Community",    defaults:{ minAngle:20, minScriptWords:20,  maxScriptWords:180, needsHook:true, needsFact:false, needsObjective:true,  needsAudience:true,  needsChannel:true,  needsDeliverable:false } },
                  { key:"generic",      label:"Generic",      defaults:{ minAngle:28, minScriptWords:40,  maxScriptWords:260, needsHook:true, needsFact:false, needsObjective:true,  needsAudience:true,  needsChannel:true,  needsDeliverable:true  } },
                ];
                const anchorTerms = settings.quality_gate?.factual_anchor_terms || [];
                const activeType = GQ_TYPES.find(t => t.key === gateProfileType) || GQ_TYPES[0];
                const custom = settings.quality_gate?.profiles?.[activeType.key] || {};
                const defs = activeType.defaults;
                const numField = (field, min, max, step=1) => {
                  const effective = custom[field] ?? defs[field];
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:12, color:"var(--t2)" }}>{field==="minAngle"?"Min angle chars":field==="minScriptWords"?"Min words":"Max words"}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          {custom[field]!=null && <span style={{ fontSize:10, color:"var(--t4)" }}>default: {defs[field]}</span>}
                          <input type="number" min={min} max={max} step={step} value={effective}
                            onChange={e=>updQGProfile(activeType.key, field, Math.min(max,Math.max(min,parseInt(e.target.value)||min)))}
                            style={{ width:56, padding:"3px 6px", borderRadius:6, background:"var(--fill2)", border:`0.5px solid ${custom[field]!=null?"var(--t2)":"var(--border)"}`, color:"var(--t1)", fontSize:12, outline:"none", textAlign:"center", fontFamily:"var(--font-mono)" }}/>
                        </div>
                      </div>
                    </div>
                  );
                };
                const boolField = (field, label) => {
                  const effective = custom[field] ?? defs[field];
                  return (
                    <button onClick={()=>updQGProfile(activeType.key, field, !effective)} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:6, fontSize:11, background:effective?"var(--t1)":"var(--fill2)", color:effective?"var(--bg)":"var(--t3)", border:`0.5px solid ${custom[field]!=null?"var(--t2)":"var(--border)"}`, cursor:"pointer" }}>
                      {effective ? "✓" : "–"} {label}
                    </button>
                  );
                };
                const hasOverrides = Object.keys(custom).length > 0;
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                    {/* Factual anchor terms */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Factual anchor terms</div>
                      <div style={{ fontSize:11, color:"var(--t3)", marginBottom:10, lineHeight:1.5 }}>Words that count as factual grounding. Stories without any of these (or a year/number) get a "no factual anchor" warning.</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
                        {anchorTerms.map((term,i)=>(
                          <span key={i} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:99, background:"var(--fill2)", border:"0.5px solid var(--border)", fontSize:12, color:"var(--t1)" }}>
                            {term}
                            <button onClick={()=>upd("quality_gate.factual_anchor_terms", anchorTerms.filter((_,j)=>j!==i))} style={{ background:"none", border:"none", cursor:"pointer", padding:0, color:"var(--t4)", lineHeight:1, display:"flex" }}>
                              <X size={10}/>
                            </button>
                          </span>
                        ))}
                        <input value={anchorInput} onChange={e=>setAnchorInput(e.target.value)}
                          onKeyDown={e=>{ if((e.key==="Enter"||e.key===",")&&anchorInput.trim()){ e.preventDefault(); const t=anchorInput.trim().replace(/,$/,""); if(t&&!anchorTerms.includes(t)){upd("quality_gate.factual_anchor_terms",[...anchorTerms,t]);} setAnchorInput(""); } }}
                          onBlur={()=>{ const t=anchorInput.trim().replace(/,$/,""); if(t&&!anchorTerms.includes(t)){upd("quality_gate.factual_anchor_terms",[...anchorTerms,t]);} setAnchorInput(""); }}
                          placeholder="Add term…" style={{ padding:"3px 8px", borderRadius:99, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none", width:100 }}/>
                      </div>
                      {!anchorTerms.length && <div style={{ fontSize:11, color:"var(--t4)", fontStyle:"italic" }}>Using built-in defaults (final, playoff, draft, trade, injury, rookie, mvp, all-star)</div>}
                    </div>

                    {/* Per-type profile overrides */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Gate profile overrides</div>
                      <div style={{ fontSize:11, color:"var(--t3)", marginBottom:12, lineHeight:1.5 }}>Customise thresholds and required checks per content type. Highlighted fields have been overridden from defaults.</div>
                      {/* Type pills */}
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:14 }}>
                        {GQ_TYPES.map(t=>{
                          const tCustom = settings.quality_gate?.profiles?.[t.key];
                          const hasC = tCustom && Object.keys(tCustom).length > 0;
                          return (
                            <button key={t.key} onClick={()=>setGateProfileType(t.key)} style={{ padding:"4px 10px", borderRadius:99, fontSize:11, fontWeight:gateProfileType===t.key?600:400, background:gateProfileType===t.key?"var(--t1)":"var(--fill2)", color:gateProfileType===t.key?"var(--bg)":hasC?"var(--t2)":"var(--t3)", border:`0.5px solid ${gateProfileType===t.key?"var(--t1)":hasC?"var(--t2)":"var(--border)"}`, cursor:"pointer" }}>
                              {t.label}{hasC?" ·":""}
                            </button>
                          );
                        })}
                      </div>
                      {/* Fields for active type */}
                      <div style={{ padding:"14px", borderRadius:9, background:"var(--fill2)", border:"0.5px solid var(--border)", display:"flex", flexDirection:"column", gap:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontSize:12, fontWeight:600, color:"var(--t1)" }}>{activeType.label}</span>
                          {hasOverrides && <button onClick={()=>{ setSettings(s=>{const n=JSON.parse(JSON.stringify(s)); if(n.quality_gate?.profiles) delete n.quality_gate.profiles[activeType.key]; return n; }); }} style={{ fontSize:11, color:"var(--t4)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline", padding:0 }}>Reset to defaults</button>}
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                          {numField("minAngle", 5, 80)}
                          {numField("minScriptWords", 5, 500)}
                          {numField("maxScriptWords", 20, 2000, 10)}
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:"var(--t3)", marginBottom:6 }}>Required checks</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                            {boolField("needsHook", "Hook")}
                            {boolField("needsFact", "Fact")}
                            {boolField("needsObjective", "Objective")}
                            {boolField("needsAudience", "Audience")}
                            {boolField("needsChannel", "Channel")}
                            {boolField("needsDeliverable", "Deliverable")}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Providers ── */}
	          {section==="providers" && (
	          <ProvidersSection tenant={activeTenant} version={VERSION_NUM} />
	          )}

	          {/* ── Workspace Memory ── */}
	          {section==="memory" && (
	            <WorkspaceMemoryPanel
	              memories={insights.filter(insight => insight.category === "memory" || insight.source === "workspace_memory")}
	              loading={insightsLoading}
	              error={insightError}
	              onRefresh={loadInsights}
	              onUpdateStatus={updateInsightStatus}
	              onUpdateSummary={updateInsightSummary}
	            />
	          )}

	          {/* ── Intelligence ── */}
	          {section==="intelligence" && (
	            <IntelligenceDashboard
              stories={stories}
              settings={settings}
              conflicts={conflicts}
              appName={appName}
              version={VERSION_NUM}
              insightCount={insightCount}
              insights={insights}
              snapshotCount={snapshotCount}
              insightsLoading={insightsLoading}
              insightError={insightError}
              onGenerateFeedbackInsights={generateFeedbackInsights}
              generatingInsights={generatingInsights}
              onUpdateInsightStatus={updateInsightStatus}
              onRunPredictions={onRunPredictions}
              runningPredictions={runningPredictions}
              pendingFeedbackCount={pendingFeedbackCount}
              onApplyCalibrationHint={applyCalibrationHint}
            />
          )}

          {/* ── Appearance ── */}
          {section==="appearance" && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6 }}>
                Display settings. Theme follows your system preference by default — override here if needed.
              </div>

              {/* Theme */}
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Theme</div>
                <div style={{ display:"flex", gap:8 }}>
                  {[{key:"system",label:"System",hint:"Follows OS setting"},{key:"light",label:"Light"},{key:"dark",label:"Dark"}].map(t=>(
                    <button key={t.key} className="ce-choice-card" onClick={()=>upd("appearance.theme",t.key)} style={{ flex:1, padding:"10px 12px", borderRadius:9, border:`0.5px solid ${(settings.appearance?.theme||"system")===t.key?"var(--t1)":"var(--border)"}`, background:(settings.appearance?.theme||"system")===t.key?"var(--t1)":"var(--fill2)", cursor:"pointer", textAlign:"left" }}>
                      <div style={{ fontSize:12, fontWeight:500, color:(settings.appearance?.theme||"system")===t.key?"var(--bg)":"var(--t1)" }}>{t.label}</div>
                      {t.hint&&<div style={{ fontSize:10, color:(settings.appearance?.theme||"system")===t.key?"rgba(255,255,255,0.6)":"var(--t3)", marginTop:2 }}>{t.hint}</div>}
                    </button>
                  ))}
                </div>
              </div>

	              {/* Density */}
	              <div>
	                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Density</div>
                <div style={{ display:"flex", gap:8 }}>
                  {[{key:"compact",label:"Compact",hint:"Smaller cards, more stories visible"},{key:"comfortable",label:"Comfortable",hint:"Balanced (default)"},{key:"spacious",label:"Spacious",hint:"More breathing room"}].map(d=>(
                    <button key={d.key} className="ce-choice-card" onClick={()=>upd("appearance.density",d.key)} style={{ flex:1, padding:"10px 12px", borderRadius:9, border:`0.5px solid ${(settings.appearance?.density||"comfortable")===d.key?"var(--t1)":"var(--border)"}`, background:(settings.appearance?.density||"comfortable")===d.key?"var(--t1)":"var(--fill2)", cursor:"pointer", textAlign:"left" }}>
                      <div style={{ fontSize:12, fontWeight:500, color:(settings.appearance?.density||"comfortable")===d.key?"var(--bg)":"var(--t1)" }}>{d.label}</div>
                      <div style={{ fontSize:10, color:(settings.appearance?.density||"comfortable")===d.key?"rgba(255,255,255,0.6)":"var(--t3)", marginTop:2 }}>{d.hint}</div>
                    </button>
                  ))}
	                </div>
	              </div>

	              {/* Pipeline display */}
	              <div>
	                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Pipeline display</div>
	                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:8 }}>
	                  {[
	                    { key:"essential", label:"Essential", hint:"Shows status, next action, and readiness." },
	                    { key:"detailed", label:"Detailed", hint:"Adds AI scores, reach/community signals, tags, and scoring details." },
	                  ].map(option => {
	                    const selected = (pipelineDisplayMode || "essential") === option.key;
	                    return (
	                      <button key={option.key} className="ce-choice-card" onClick={() => onPipelineDisplayModeChange?.(option.key)} style={{ padding:"10px 12px", borderRadius:9, border:`0.5px solid ${selected ? "var(--t1)" : "var(--border)"}`, background:selected ? "var(--t1)" : "var(--fill2)", cursor:"pointer", textAlign:"left" }}>
	                        <div style={{ fontSize:12, fontWeight:600, color:selected ? "var(--bg)" : "var(--t1)" }}>{option.label}</div>
	                        <div style={{ fontSize:10, color:selected ? "rgba(255,255,255,0.68)" : "var(--t3)", marginTop:2, lineHeight:1.4 }}>{option.hint}</div>
	                      </button>
	                    );
	                  })}
	                </div>
	                <div style={{ fontSize:10, color:"var(--t4)", marginTop:8 }}>Saved on this device as an interface preference. It does not change scoring, ranking, generation, or brand strategy.</div>
	              </div>

	              {/* Default tab */}
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Default tab on load</div>
                <select value={settings.appearance?.default_tab||"pipeline"} onChange={e=>upd("appearance.default_tab",e.target.value)} style={selStyle}>
                  {["pipeline","research","create","calendar","analyze"].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </select>
              </div>

              <div style={{ padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)", fontSize:11, color:"var(--t4)" }}>
                Brand color customization is available for Track 3 Creative Engine clients. Contact us to configure.
              </div>
            </div>
          )}

          {/* ── Workspace ── */}
          {section==="workspace" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6 }}>
                Your workspace contains all stories, scripts, and settings. Team members share the same workspace with different access levels.
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                {[
                  { label:"Workspace", value:appName, editable:false },
                  { label:"Workspace ID",   value:WORKSPACE_ID, editable:false, mono:true },
                  { label:"Plan",           value:"Internal", editable:false },
                ].map(({label,value,editable,mono})=>(
                  <div key={label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"0.5px solid var(--border2)" }}>
                    <span style={{ fontSize:13, color:"var(--t3)" }}>{label}</span>
                    <span style={{ fontSize:13, color:editable?"var(--t1)":"var(--t4)", fontFamily:mono?"ui-monospace,'SF Mono',Menlo,monospace":"inherit" }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ padding:"14px", borderRadius:9, border:"0.5px solid var(--border)", background:"var(--fill2)", display:"flex", justifyContent:"space-between", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                <div style={{ minWidth:220 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--t1)", marginBottom:3 }}>Smart onboarding</div>
                  <div style={{ fontSize:11, color:"var(--t3)", lineHeight:1.5 }}>
                    Re-run source-first onboarding for this brand. A new onboarding session is created, and final strategy settings are changed only after approval.
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button onClick={() => onRunOnboarding?.(false)} style={{ padding:"7px 12px", borderRadius:7, border:"0.5px solid var(--border)", background:"var(--t1)", color:"var(--bg)", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    Run onboarding
                  </button>
                  <button onClick={() => onRunOnboarding?.(true)} style={{ padding:"7px 12px", borderRadius:7, border:"0.5px solid var(--border)", background:"transparent", color:"var(--t2)", fontSize:12, fontWeight:500, cursor:"pointer" }}>
                    Refresh strategy
                  </button>
                </div>
              </div>

              <WorkspaceMembersPanel workspaceId={WORKSPACE_ID} appName={appName} />
            </div>
          )}

          {/* ── Privacy & Data Handling ── */}
          {section==="privacy" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6 }}>
                Privacy modes control how Creative Engine minimizes prompts, blocks high-risk routing, and describes provider handling. Providers necessarily process prompts during inference; no-training and no-retention are different controls, and unknowns are treated conservatively.
              </div>

              {privacyLoading && <div style={{ fontSize:12, color:"var(--t4)" }}>Loading privacy settings...</div>}
              {privacyError && <div style={{ fontSize:12, color:"var(--error)", lineHeight:1.5 }}>{privacyError}</div>}

              <div style={{ padding:"14px", borderRadius:9, border:"0.5px solid var(--border)", background:"var(--fill2)" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--t4)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Current privacy mode</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:8 }}>
                  {[
                    { key:PRIVACY_MODES.STANDARD, label:"Standard", desc:"Normal SME content production. Commercial AI APIs may be used; raw logs disabled by Creative Engine." },
                    { key:PRIVACY_MODES.CONFIDENTIAL, label:"Confidential", desc:"Stricter minimization. Confidential data blocked from unknown-retention providers." },
                    { key:PRIVACY_MODES.ENHANCED_PRIVACY, label:"Enhanced Privacy", desc:"Confidential/sensitive data requires approved zero/no-retention or client-owned routes." },
                    { key:PRIVACY_MODES.ENTERPRISE_CUSTOM, label:"Enterprise Custom", desc:"Custom routing, client-owned storage/credentials, and bespoke security settings." },
                  ].map(mode => {
                    const selectedMode = (privacySettings?.privacy_mode || PRIVACY_MODES.STANDARD) === mode.key;
                    const disabled = !privacySettings?.can_manage || privacySaving;
                    return (
                      <button key={mode.key} onClick={() => savePrivacySettings({ privacy_mode:mode.key })} disabled={disabled} style={{ padding:"12px", borderRadius:8, border:`0.5px solid ${selectedMode ? "var(--t1)" : "var(--border)"}`, background:selectedMode ? "var(--t1)" : "var(--bg)", color:selectedMode ? "var(--bg)" : "var(--t2)", textAlign:"left", cursor:disabled?"not-allowed":"pointer", opacity:disabled&&!selectedMode?0.65:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{mode.label}</div>
                        <div style={{ fontSize:11, lineHeight:1.45, color:selectedMode ? "rgba(255,255,255,0.72)" : "var(--t3)" }}>{mode.desc}</div>
                      </button>
                    );
                  })}
                </div>
                {!privacySettings?.can_manage && (
                  <div style={{ fontSize:11, color:"var(--t4)", marginTop:10 }}>Only workspace owners and admins can change privacy mode.</div>
                )}
              </div>

              <div style={{ padding:"14px", borderRadius:9, border:"0.5px solid var(--border)", background:"var(--fill2)" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--t4)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Default brand data class</div>
                <select
                  value={privacySettings?.default_data_class || DATA_CLASSES.D1_BUSINESS_STANDARD}
                  disabled={!privacySettings?.can_manage || privacySaving}
                  onChange={e => savePrivacySettings({ default_data_class:e.target.value })}
                  style={selStyle}
                >
                  <option value={DATA_CLASSES.D0_PUBLIC}>D0 Public</option>
                  <option value={DATA_CLASSES.D1_BUSINESS_STANDARD}>D1 Business Standard</option>
                  <option value={DATA_CLASSES.D2_CONFIDENTIAL}>D2 Confidential</option>
                  <option value={DATA_CLASSES.D3_SENSITIVE}>D3 Sensitive</option>
                </select>
                <div style={{ fontSize:11, color:"var(--t4)", lineHeight:1.5, marginTop:8 }}>
                  D4 Secret is reserved for keys/tokens/credentials and is always blocked from AI/media providers.
                </div>
              </div>

              <div style={{ padding:"14px", borderRadius:9, border:"0.5px solid var(--border)", background:"var(--fill2)" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--t4)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Provider transparency</div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, color:"var(--t2)" }}>
                    <thead>
                      <tr style={{ color:"var(--t4)", textAlign:"left" }}>
                        {["Provider","Purpose","Data processed","Retention","No-training","Enhanced"].map(h => <th key={h} style={{ padding:"7px 8px", borderBottom:"0.5px solid var(--border)" }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {(privacySettings?.providers || []).map(row => (
                        <tr key={row.name}>
                          <td style={{ padding:"8px", borderBottom:"0.5px solid var(--border2)", fontWeight:600, color:"var(--t1)" }}>{row.name}</td>
                          <td style={{ padding:"8px", borderBottom:"0.5px solid var(--border2)" }}>{row.purpose}</td>
                          <td style={{ padding:"8px", borderBottom:"0.5px solid var(--border2)" }}>{row.data_processed}</td>
                          <td style={{ padding:"8px", borderBottom:"0.5px solid var(--border2)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}>{row.retention_profile}</td>
                          <td style={{ padding:"8px", borderBottom:"0.5px solid var(--border2)" }}>{String(row.no_training_status)}</td>
                          <td style={{ padding:"8px", borderBottom:"0.5px solid var(--border2)", color:row.enhanced_privacy_compatible ? "var(--success)" : "var(--warning)" }}>{row.enhanced_privacy_compatible ? "Yes" : "No/TBD"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize:11, color:"var(--t4)", lineHeight:1.5, marginTop:10 }}>
                  This is an internal transparency layer, not final legal copy. Unknown retention is not treated as safe for confidential or sensitive data.
                </div>
              </div>
            </div>
          )}

          {/* ── Billing ── */}
          {section==="billing" && (
            <BillingSection
              billing={billing}
              billingLoading={billingLoading}
              billingAction={billingAction}
              billingMsg={billingMsg}
              userRole={null}
              workspaceId={WORKSPACE_ID}
              onCheckout={startCheckout}
              onPortal={openPortal}
              onDismissMsg={()=>setBillingMsg(null)}
            />
          )}

          {/* ── Danger Zone ── */}
          {section==="danger" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, marginBottom:4 }}>
                These actions are irreversible. Take care.
              </div>
              {[
                { label:"Reset all settings", hint:"Restore all settings to default values. Your stories and scripts are not affected.", action:"Reset settings", color:"var(--t3)", onClick:()=>{ setSettings(DEFAULT_SETTINGS); try{localStorage.removeItem(tenantStorageKey("settings", activeTenant));}catch{}; } },
                { label:"Clear dismissed alerts", hint:"Restore all dismissed production alerts.", action:"Clear alerts", color:"var(--t3)", onClick:()=>{ try{localStorage.removeItem("uc_dismissed_alerts");}catch{}; } },
                { label:"Export all stories", hint:"Download all stories and scripts as a CSV file.", action:"Export", color:"var(--t2)", onClick:()=>{ if(typeof window!=="undefined"){const d=encodeURIComponent(JSON.stringify(stories,null,2));const a=document.createElement("a");a.href="data:application/json;charset=utf-8,"+d;a.download="uncle-carter-stories.json";a.click();} } },
              ].map(({label,hint,action,color,onClick})=>(
                <div key={label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px", borderRadius:9, border:"0.5px solid var(--border)", background:"var(--fill2)" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:"var(--t1)", marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:11, color:"var(--t3)" }}>{hint}</div>
                  </div>
                  <button onClick={onClick} style={{ padding:"6px 14px", borderRadius:7, fontSize:11, fontWeight:500, background:"transparent", color, border:`0.5px solid ${color}`, cursor:"pointer", flexShrink:0, marginLeft:16 }}>
                    {action}
                  </button>
                </div>
              ))}
              <div style={{ padding:"12px 14px", borderRadius:9, border:"0.5px solid rgba(192,102,106,0.3)", background:"rgba(192,102,106,0.05)", marginTop:4 }}>
                <div style={{ fontSize:12, fontWeight:500, color:"#C0666A", marginBottom:6 }}>Delete workspace</div>
                <div style={{ fontSize:11, color:"var(--t3)", marginBottom:10 }}>Permanently delete this workspace, all stories, scripts, and settings. This cannot be undone. Your assets in Supabase Storage will be removed.</div>
                <button style={{ padding:"6px 14px", borderRadius:7, fontSize:11, fontWeight:600, background:"rgba(192,102,106,0.1)", color:"#C0666A", border:"0.5px solid rgba(192,102,106,0.3)", cursor:"pointer" }}>
                  Delete workspace
                </button>
              </div>
            </div>
          )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
