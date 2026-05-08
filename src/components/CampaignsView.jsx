"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Plus, Trash2, X, ChevronDown, ChevronRight, Sparkles, Target, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/db";
import { CONTENT_TYPES, CHANNELS, STAGES } from "@/lib/constants";
import { contentChannel, getBrandName } from "@/lib/brandConfig";
import { InlineTextInput, Panel, buttonStyle, labelStyle } from "@/components/OperationalUI";

// ── Constants ─────────────────────────────────────────────

const CAMPAIGN_COLORS = [
  "#4A9B7F", "#C49A3C", "#C0666A", "#8B7EC8",
  "#5B8FB9", "#7B9E6B", "#B87333", "#7B8FA8",
];

const STATUS_META = {
  planning:  { label: "Planning",  bg: "var(--fill2)",      color: "var(--t3)"    },
  active:    { label: "Active",    bg: "rgba(74,155,127,.12)", color: "#4A9B7F"   },
  complete:  { label: "Complete",  bg: "rgba(91,143,185,.12)", color: "#5B8FB9"   },
  archived:  { label: "Archived",  bg: "var(--fill2)",      color: "var(--t4)"    },
};

const DONE_STAGES   = new Set(["scripted","produced","published"]);
const ACTIVE_STAGES = new Set(["accepted","approved"]);

// ── Helpers ───────────────────────────────────────────────

function storyChannel(s) { return s.channel || s.metadata?.channel || ""; }
function storyType(s)    { return s.content_type || s.metadata?.content_type || "narrative"; }

function deliverableProgress(deliverable, linkedStories) {
  const matches = linkedStories.filter(s =>
    storyType(s) === deliverable.content_type &&
    (!deliverable.channel || storyChannel(s) === deliverable.channel)
  );
  return {
    done:    matches.filter(s => DONE_STAGES.has(s.status)).length,
    active:  matches.filter(s => ACTIVE_STAGES.has(s.status)).length,
    total:   deliverable.count_planned || 0,
  };
}

function campaignProgress(campaign, linkedStories) {
  const deliverables = campaign.deliverables || [];
  if (!deliverables.length) {
    const done   = linkedStories.filter(s => DONE_STAGES.has(s.status)).length;
    return { done, total: linkedStories.length, pct: linkedStories.length ? done / linkedStories.length : 0 };
  }
  const total = deliverables.reduce((s, d) => s + (d.count_planned || 0), 0);
  const done  = deliverables.reduce((s, d) => s + deliverableProgress(d, linkedStories).done, 0);
  return { done, total, pct: total ? done / total : 0 };
}

// ── Progress ring ─────────────────────────────────────────

function ProgressRing({ pct, color, size = 30 }) {
  const r    = (size - 5) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg3)" strokeWidth={3} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(1, pct))}
        strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.4s" }} />
    </svg>
  );
}

// ── Deliverable row ───────────────────────────────────────

function DeliverableRow({ row, linkedStories, onChange, onDelete }) {
  const { done, active, total } = deliverableProgress(row, linkedStories);
  const pct     = total > 0 ? done / total : 0;
  const atRisk  = active > 0 && done < total;
  const complete = done >= total && total > 0;
  const missing  = total > 0 && done === 0 && active === 0;

  const sel = {
    fontSize: 12, borderRadius: 5,
    border: "0.5px solid var(--border)", background: "var(--fill2)",
    color: "var(--t1)", padding: "4px 7px", outline: "none",
    fontFamily: "inherit", cursor: "pointer",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 72px 1fr 28px", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid var(--border2)" }}>
      <select value={row.content_type || ""} onChange={e => onChange({ ...row, content_type: e.target.value })} style={sel}>
        <option value="">Type…</option>
        {CONTENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      <select value={row.channel || ""} onChange={e => onChange({ ...row, channel: e.target.value })} style={sel}>
        <option value="">Any channel</option>
        {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <input type="number" min={1} max={99} value={row.count_planned || 1}
        onChange={e => onChange({ ...row, count_planned: Math.max(1, parseInt(e.target.value) || 1) })}
        style={{ ...sel, width: "100%", textAlign: "center" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--bg3)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct * 100}%`, borderRadius: 2,
            background: complete ? "var(--success)" : atRisk ? "var(--warning)" : "var(--t3)",
            transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: complete ? "var(--success)" : missing ? "var(--error)" : "var(--t3)", minWidth: 32, textAlign: "right" }}>
          {done}/{total}
        </span>
        {complete && <Check size={10} color="var(--success)" />}
        {missing  && total > 0 && <AlertCircle size={10} color="var(--error)" />}
      </div>
      <button onClick={onDelete} style={{ ...buttonStyle("ghost", { padding: "4px 6px", height: 26 }) }}>
        <X size={11} />
      </button>
    </div>
  );
}

// ── Story chip ────────────────────────────────────────────

function StoryChip({ story, campaigns, onMove }) {
  const gate = story.quality_gate_status || (Number(story.quality_gate_blockers) > 0 ? "blocked" : Number(story.quality_gate_warnings) > 0 ? "warnings" : story.quality_gate ? "passed" : null);
  const st   = STAGES[story.status];
  const type = CONTENT_TYPES.find(t => t.key === storyType(story));
  const ch   = storyChannel(story);

  return (
    <div style={{ padding: "9px 11px", borderRadius: 8, background: "var(--card)", border: "0.5px solid var(--border2)", display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", lineHeight: 1.4, flex: 1 }}>{story.title}</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "var(--fill2)", color: "var(--t3)", flexShrink: 0 }}>{st?.label || story.status}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        {type && <span style={{ fontSize: 10, color: "var(--t4)" }}>{type.label}</span>}
        {ch   && <><span style={{ color: "var(--t4)", fontSize: 10 }}>·</span><span style={{ fontSize: 10, color: "var(--t4)" }}>{ch}</span></>}
        {story.score_total != null && <><span style={{ color: "var(--t4)", fontSize: 10 }}>·</span><span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--t3)" }}>{story.score_total}</span></>}
        {gate === "blocked"  && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--error)",   background: "var(--error-bg)",   border: "0.5px solid var(--error-border)", borderRadius: 3, padding: "1px 5px" }}>blocked</span>}
        {gate === "warnings" && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--warning)", background: "var(--warning-bg)", border: "0.5px solid rgba(196,154,60,.3)",  borderRadius: 3, padding: "1px 5px" }}>warning</span>}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 2, alignItems: "center" }}>
        {story.campaign_id && (
          <button onClick={() => onMove(story, null)} title="Remove from campaign" style={{ width: 22, height: 22, borderRadius: 4, border: "0.5px solid var(--border)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={9} color="var(--t4)" />
          </button>
        )}
        <select value="" onChange={e => { if (e.target.value) onMove(story, e.target.value); }}
          style={{ flex: 1, fontSize: 10, borderRadius: 5, border: "0.5px solid var(--border)", background: "var(--fill2)", color: "var(--t3)", padding: "3px 6px", outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
          <option value="">{story.campaign_id ? "Move to…" : "Assign to…"}</option>
          {campaigns.filter(c => c.id !== story.campaign_id && c.status !== "archived").map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Campaign card (sidebar) ───────────────────────────────

function CampaignCard({ campaign, linkedStories, isActive, onClick }) {
  const prog = campaignProgress(campaign, linkedStories);
  const sm   = STATUS_META[campaign.status] || STATUS_META.planning;
  const dateRange = [campaign.start_date, campaign.end_date].filter(Boolean)
    .map(d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })).join(" – ");

  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", padding: "10px 12px 10px 10px", borderRadius: 8,
      background: isActive ? "var(--fill2)" : "transparent",
      border: isActive ? "0.5px solid var(--border)" : "0.5px solid transparent",
      borderLeft: `3px solid ${campaign.color || "#4A9B7F"}`,
      cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
      transition: "background 0.1s",
    }}>
      <ProgressRing pct={prog.pct} color={campaign.color || "#4A9B7F"} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{campaign.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: sm.bg, color: sm.color }}>{sm.label}</span>
          {dateRange && <span style={{ fontSize: 9, color: "var(--t4)" }}>{dateRange}</span>}
        </div>
        <div style={{ fontSize: 10, color: "var(--t4)", marginTop: 1 }}>
          {prog.done}/{prog.total} deliverable{prog.total !== 1 ? "s" : ""} · {linkedStories.length} {linkedStories.length === 1 ? "story" : "stories"}
        </div>
      </div>
    </button>
  );
}

// ── Timeline ──────────────────────────────────────────────

function fmtDate(d) { return d.toISOString().split("T")[0]; }

function CampaignTimeline({ campaigns, stories, activeCampaignId, onSelect }) {
  const dated = campaigns.filter(c => c.start_date && c.end_date);
  const undated = campaigns.filter(c => !c.start_date || !c.end_date);

  if (!dated.length && !undated.length) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh", color:"var(--t4)", fontSize:13 }}>
      No campaigns to display. Create one and set start/end dates to see the timeline.
    </div>
  );

  const today = new Date(); today.setHours(0,0,0,0);

  // Build time range from all dated campaigns + today ± padding
  const allMs = dated.flatMap(c => [new Date(c.start_date).getTime(), new Date(c.end_date).getTime()]);
  allMs.push(today.getTime());
  const rangeStart = new Date(Math.min(...allMs) - 14 * 86400000); rangeStart.setHours(0,0,0,0);
  const rangeEnd   = new Date(Math.max(...allMs) + 14 * 86400000); rangeEnd.setHours(0,0,0,0);
  const totalMs    = rangeEnd - rangeStart;

  function pct(dateStr) {
    if (!dateStr) return 0;
    const ms = new Date(dateStr).getTime() - rangeStart.getTime();
    return Math.max(0, Math.min(100, (ms / totalMs) * 100));
  }

  // Generate month markers
  const months = [];
  const cur = new Date(rangeStart); cur.setDate(1);
  while (cur <= rangeEnd) {
    months.push({ label: cur.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), pct: pct(fmtDate(cur)) });
    cur.setMonth(cur.getMonth() + 1);
  }

  const todayPct = pct(fmtDate(today));

  return (
    <div style={{ padding: "20px 24px 32px", overflowX: "auto", minWidth: 500 }}>
      {/* Month axis */}
      <div style={{ position: "relative", height: 28, marginLeft: 150, marginBottom: 4 }}>
        {months.map((m, i) => (
          <div key={i} style={{ position: "absolute", left: `${m.pct}%`, transform: "translateX(-50%)", fontSize: 10, color: "var(--t4)", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>
            {m.label}
          </div>
        ))}
        {/* Today marker label */}
        <div style={{ position: "absolute", left: `${todayPct}%`, transform: "translateX(-50%)", fontSize: 9, color: "var(--t1)", fontWeight: 700, whiteSpace: "nowrap", bottom: 0 }}>
          Today
        </div>
      </div>

      {/* Campaign rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[...dated].sort((a,b) => a.start_date.localeCompare(b.start_date)).map(c => {
          const left  = pct(c.start_date);
          const right = pct(c.end_date);
          const width = Math.max(1, right - left);
          const linked = stories.filter(s => s.campaign_id === c.id);
          const prog   = campaignProgress(c, linked);
          const sm     = STATUS_META[c.status] || STATUS_META.planning;
          const isActive = c.id === activeCampaignId;

          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Name column */}
              <div style={{ width: 138, flexShrink: 0, textAlign: "right", display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? "var(--t1)" : "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: sm.color }}>{sm.label}</span>
              </div>

              {/* Bar track */}
              <div style={{ flex: 1, position: "relative", height: 28, background: "var(--fill2)", borderRadius: 6, cursor: "pointer" }} onClick={() => onSelect(c.id)}>
                {/* Campaign bar */}
                <div style={{
                  position: "absolute", left: `${left}%`, width: `${width}%`, top: 3, bottom: 3,
                  background: c.color || "#4A9B7F", borderRadius: 4,
                  opacity: isActive ? 1 : 0.72,
                  outline: isActive ? `2px solid ${c.color || "#4A9B7F"}` : "none",
                  outlineOffset: 2,
                  transition: "opacity 0.15s",
                }}>
                  {/* Progress fill */}
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${prog.pct * 100}%`, background: "rgba(255,255,255,0.25)", borderRadius: 4 }} />
                  {/* Story count badge */}
                  {linked.length > 0 && (
                    <div style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
                      {linked.length}
                    </div>
                  )}
                </div>

                {/* Scheduled story dots */}
                {linked.filter(s => s.scheduled_date).map(s => (
                  <div key={s.id} title={s.title} style={{
                    position: "absolute", left: `${pct(s.scheduled_date)}%`,
                    top: "50%", transform: "translate(-50%, -50%)",
                    width: 7, height: 7, borderRadius: "50%",
                    background: "var(--bg)", border: `2px solid ${c.color || "#4A9B7F"}`,
                    zIndex: 3, pointerEvents: "none",
                  }} />
                ))}

                {/* Today line */}
                <div style={{ position: "absolute", left: `${todayPct}%`, top: -3, bottom: -3, width: 1.5, background: "var(--t1)", opacity: 0.6, zIndex: 4, pointerEvents: "none" }} />
              </div>

              {/* Stats */}
              <div style={{ width: 60, flexShrink: 0, fontSize: 10, color: "var(--t4)", fontFamily: "var(--font-mono)", textAlign: "right" }}>
                {prog.done}/{prog.total}
              </div>
            </div>
          );
        })}

        {/* Undated campaigns */}
        {undated.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginLeft: 150, marginTop: 8 }}>No dates set</div>
            {undated.map(c => {
              const isActive = c.id === activeCampaignId;
              const linked   = stories.filter(s => s.campaign_id === c.id);
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 138, flexShrink: 0, textAlign: "right" }}>
                    <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? "var(--t1)" : "var(--t2)" }}>{c.name}</span>
                  </div>
                  <div onClick={() => onSelect(c.id)} style={{ flex: 1, height: 28, borderRadius: 6, border: `1.5px dashed ${c.color || "var(--border)"}`, cursor: "pointer", opacity: isActive ? 1 : 0.6, display:"flex", alignItems:"center", paddingLeft:10 }}>
                    <span style={{ fontSize: 10, color: "var(--t4)" }}>Set start &amp; end dates in campaign detail</span>
                  </div>
                  <div style={{ width: 60, flexShrink: 0, fontSize: 10, color: "var(--t4)", fontFamily: "var(--font-mono)", textAlign: "right" }}>{linked.length} stories</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────

export default function CampaignsView({
  stories, campaigns, onCreateCampaign, onUpdateCampaign, onDeleteCampaign, onUpdateStory, settings, tenant,
}) {
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [statusFilter,     setStatusFilter]     = useState("all");
  const [timelineView,     setTimelineView]     = useState(false);
  const [analysisOpen,     setAnalysisOpen]     = useState(false);
  const [analysisText,     setAnalysisText]     = useState("");
  const [analysisLoading,  setAnalysisLoading]  = useState(false);
  const [addStoriesOpen,   setAddStoriesOpen]   = useState(false);
  const [suggestLoading,   setSuggestLoading]   = useState(false);
  const [confirmDelete,    setConfirmDelete]    = useState(false);
  const [localName,        setLocalName]        = useState("");
  const [pickerSearch,     setPickerSearch]     = useState("");

  const campaign = useMemo(() => campaigns.find(c => c.id === activeCampaignId) || null, [campaigns, activeCampaignId]);
  useEffect(() => { setLocalName(campaign?.name || ""); }, [campaign?.id]);

  const linkedStories = useMemo(() =>
    campaign ? stories.filter(s => s.campaign_id === campaign.id) : [],
    [stories, campaign]
  );

  const filteredCampaigns = useMemo(() =>
    campaigns.filter(c => statusFilter === "all" || c.status === statusFilter),
    [campaigns, statusFilter]
  );

  // ── Deliverable helpers ──────────────────────────────────

  const saveDeliverables = useCallback((newDeliverables) => {
    if (!campaign) return;
    onUpdateCampaign({ ...campaign, deliverables: newDeliverables });
  }, [campaign, onUpdateCampaign]);

  const addDeliverable = () => saveDeliverables([
    ...(campaign.deliverables || []),
    { id: crypto.randomUUID(), content_type: "narrative", channel: "", count_planned: 1, note: "" },
  ]);

  const updateDeliverable = (id, next) => saveDeliverables(
    (campaign.deliverables || []).map(d => d.id === id ? next : d)
  );

  const deleteDeliverable = (id) => saveDeliverables(
    (campaign.deliverables || []).filter(d => d.id !== id)
  );

  // ── Story move ───────────────────────────────────────────

  const moveStory = useCallback((story, targetCampaignId) => {
    const targetCampaign = campaigns.find(c => c.id === targetCampaignId);
    onUpdateStory(story.id, {
      campaign_id:   targetCampaignId || null,
      campaign_name: targetCampaign?.name || null,
    });
  }, [campaigns, onUpdateStory]);

  // ── AI: Suggest deliverables ─────────────────────────────

  const suggestDeliverables = useCallback(async () => {
    if (!campaign || suggestLoading) return;
    setSuggestLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const system = `You are a content campaign planner. Output ONLY a valid JSON array of deliverable targets for a campaign. Each item: {"id":"uuid","content_type":"narrative|ad|publicity|product_post|educational|community","channel":"${CHANNELS.slice(0,8).join("|")}","count_planned":number}. Output ONLY the JSON array.`;
      const userMsg = `Campaign: "${campaign.name}"\nObjective: ${campaign.objective || "not specified"}\nAudience: ${campaign.audience || "not specified"}\nDuration: ${campaign.start_date || "TBD"} to ${campaign.end_date || "TBD"}\nSuggest 3-6 deliverable targets.`;

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          provider: "anthropic", model: "claude-haiku-4-5-20251001",
          system, messages: [{ role: "user", content: userMsg }], maxTokens: 400,
          brand_profile_id: tenant?.brand_profile_id,
        }),
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && !line.includes("[DONE]")) {
            try { const ev = JSON.parse(line.slice(6)); if (ev.text) full += ev.text; } catch {}
          }
        }
      }
      const match = full.match(/\[[\s\S]*\]/);
      if (match) {
        const suggestions = JSON.parse(match[0]).map(d => ({ ...d, id: d.id || crypto.randomUUID() }));
        saveDeliverables([...(campaign.deliverables || []), ...suggestions]);
      }
    } catch {} finally { setSuggestLoading(false); }
  }, [campaign, suggestLoading, tenant, saveDeliverables]);

  // ── AI: Analyze campaign ─────────────────────────────────

  const analyzeCampaign = useCallback(async () => {
    if (!campaign || analysisLoading) return;
    setAnalysisOpen(true);
    setAnalysisText("");
    setAnalysisLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const delivSummary = (campaign.deliverables || []).map(d => {
        const { done, active, total } = deliverableProgress(d, linkedStories);
        return `  • ${d.content_type}/${d.channel || "any"}: ${done}/${total} done, ${active} in progress`;
      }).join("\n") || "  (no deliverable targets set)";

      const storySummary = linkedStories.slice(0, 20).map(s =>
        `  • "${s.title}" [${s.status}]${s.score_total ? ` score:${s.score_total}` : ""}${s.quality_gate_status ? ` gate:${s.quality_gate_status}` : ""}`
      ).join("\n") || "  (no linked stories)";

      const system = `You are a campaign analyst for a content team. Be specific, actionable, and concise. Use bullet points. Max 250 words.`;
      const userMsg = `Campaign: "${campaign.name}" (${campaign.status})\nObjective: ${campaign.objective || "—"}\nDates: ${campaign.start_date || "—"} to ${campaign.end_date || "—"}\n\nDeliverable targets:\n${delivSummary}\n\nLinked stories:\n${storySummary}\n\nAnalyze: coverage status, quality concerns, scheduling recommendations, and 2-3 content angle suggestions for any gaps.`;

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          provider: "anthropic", model: "claude-sonnet-4-6",
          system, messages: [{ role: "user", content: userMsg }], maxTokens: 600,
          brand_profile_id: tenant?.brand_profile_id,
        }),
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = (buf + decoder.decode(value)).split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith("data: ") && !line.includes("[DONE]")) {
            try { const ev = JSON.parse(line.slice(6)); if (ev.text) setAnalysisText(t => t + ev.text); } catch {}
          }
        }
      }
    } catch (err) { setAnalysisText("Analysis failed: " + err.message); }
    finally { setAnalysisLoading(false); }
  }, [campaign, analysisLoading, linkedStories, tenant]);

  // ── Unlinked stories (for picker) ────────────────────────

  const unlinkedStories = useMemo(() =>
    stories
      .filter(s => !["rejected","archived"].includes(s.status) && s.campaign_id !== campaign?.id)
      .sort((a, b) => {
        const aOther = a.campaign_id ? 1 : 0;
        const bOther = b.campaign_id ? 1 : 0;
        if (aOther !== bOther) return aOther - bOther;
        return (b.score_total || 0) - (a.score_total || 0);
      }),
    [stories, campaign]
  );

  // ── Stage counts ─────────────────────────────────────────

  const stageCounts = useMemo(() => {
    const counts = {};
    for (const s of linkedStories) counts[s.status] = (counts[s.status] || 0) + 1;
    return counts;
  }, [linkedStories]);

  // ── Filtered pipeline picker ──────────────────────────────

  const filteredPipelineStories = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return unlinkedStories;
    return unlinkedStories.filter(s =>
      s.title?.toLowerCase().includes(q) ||
      (s.status || "").toLowerCase().includes(q)
    );
  }, [unlinkedStories, pickerSearch]);

  // ── Create handler (auto-selects new campaign) ───────────

  const handleCreate = useCallback(async () => {
    try {
      const created = await onCreateCampaign();
      if (created?.id) setActiveCampaignId(created.id);
    } catch {}
  }, [onCreateCampaign]);

  // ── Duplicate current campaign ────────────────────────────

  const handleDuplicate = useCallback(async () => {
    if (!campaign) return;
    try {
      const created = await onCreateCampaign();
      if (!created?.id) return;
      const copy = {
        ...created,
        name:        `Copy of ${campaign.name}`,
        color:       campaign.color,
        objective:   campaign.objective || "",
        audience:    campaign.audience  || "",
        deliverables: (campaign.deliverables || []).map(d => ({ ...d, id: crypto.randomUUID() })),
        status:      "planning",
        start_date:  null,
        end_date:    null,
      };
      await onUpdateCampaign(copy);
      setActiveCampaignId(created.id);
      setLocalName(copy.name);
      setConfirmDelete(false);
    } catch {}
  }, [campaign, onCreateCampaign, onUpdateCampaign]);

  // ── Field update shorthand ───────────────────────────────

  const updateField = (field, value) => {
    if (!campaign) return;
    onUpdateCampaign({ ...campaign, [field]: value });
  };

  // ── Render ───────────────────────────────────────────────

  const selStyle = {
    fontSize: 12, borderRadius: 6, border: "0.5px solid var(--border)",
    background: "var(--fill2)", color: "var(--t1)", padding: "5px 9px",
    outline: "none", fontFamily: "inherit", cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Left sidebar ── */}
      <div style={{ width: 240, flexShrink: 0, borderRight: "0.5px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 14px 10px", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Campaigns <span style={{ color: "var(--t4)", fontWeight: 400 }}>{campaigns.length}</span>
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {/* View toggle */}
              <div style={{ display: "flex", borderRadius: 6, border: "0.5px solid var(--border)", overflow: "hidden" }}>
                {[{ key: false, label: "List" }, { key: true, label: "Timeline" }].map(({ key, label }) => (
                  <button key={String(key)} onClick={() => setTimelineView(key)} style={{
                    padding: "3px 8px", fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer",
                    background: timelineView === key ? "var(--t1)" : "transparent",
                    color:      timelineView === key ? "var(--bg)"  : "var(--t4)",
                  }}>{label}</button>
                ))}
              </div>
              <button onClick={handleCreate} style={{ ...buttonStyle("primary", { padding: "4px 10px", fontSize: 11 }) }}>
                <Plus size={11} /> New
              </button>
            </div>
          </div>
          {/* Status filter */}
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {["all","active","planning","complete","archived"].map(s => {
              const cnt = s === "all" ? campaigns.length : campaigns.filter(c => c.status === s).length;
              return (
                <button key={s} onClick={() => setStatusFilter(s)} style={{
                  padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer",
                  background: statusFilter === s ? "var(--t1)" : "transparent",
                  color:      statusFilter === s ? "var(--bg)"  : "var(--t4)",
                }}>
                  {s === "all" ? "All" : STATUS_META[s]?.label}
                  {cnt > 0 && <span style={{ opacity: 0.65, marginLeft: 3 }}>{cnt}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Campaign list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
          {filteredCampaigns.length === 0 && (
            <div style={{ padding: "32px 12px", textAlign: "center", color: "var(--t4)", fontSize: 12 }}>
              {campaigns.length === 0 ? "No campaigns yet. Create one to start organizing your content." : "No campaigns match this filter."}
            </div>
          )}
          {filteredCampaigns.map(c => (
            <CampaignCard key={c.id}
              campaign={c}
              linkedStories={stories.filter(s => s.campaign_id === c.id)}
              isActive={c.id === activeCampaignId}
              onClick={() => { setActiveCampaignId(c.id); setAnalysisOpen(false); setAddStoriesOpen(false); setConfirmDelete(false); }}
            />
          ))}
        </div>
      </div>

      {/* ── Right workspace ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: timelineView ? 0 : "0 24px 32px" }}>
        {timelineView ? (
          <CampaignTimeline
            campaigns={filteredCampaigns}
            stories={stories}
            activeCampaignId={activeCampaignId}
            onSelect={(id) => { setActiveCampaignId(id); setTimelineView(false); setAnalysisOpen(false); setAddStoriesOpen(false); setConfirmDelete(false); }}
          />
        ) : !campaign ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12 }}>
            <Target size={36} style={{ opacity: 0.15 }} />
            <div style={{ fontSize: 14, color: "var(--t3)", textAlign: "center" }}>
              Select a campaign or create a new one<br/>
              <span style={{ fontSize: 12, color: "var(--t4)" }}>Organize stories, track deliverables, and keep launches on schedule.</span>
            </div>
            <button onClick={handleCreate} style={buttonStyle("primary", { marginTop: 8 })}>
              <Plus size={13} /> Create first campaign
            </button>
          </div>
        ) : (
          <>
            {/* ── Campaign header ── */}
            <div style={{ position: "sticky", top: 0, background: "var(--bg)", zIndex: 5, paddingTop: 20, paddingBottom: 12, borderBottom: "0.5px solid var(--border)", marginBottom: 20 }}>
              {/* Color + name row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                {/* Color picker */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingTop: 4, flexShrink: 0, width: 46 }}>
                  {CAMPAIGN_COLORS.map(c => (
                    <button key={c} onClick={() => updateField("color", c)} style={{
                      width: 18, height: 18, borderRadius: "50%", background: c, border: "none",
                      cursor: "pointer", outline: campaign.color === c ? `2px solid ${c}` : "none",
                      outlineOffset: 2,
                    }} />
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    value={localName}
                    onChange={e => setLocalName(e.target.value)}
                    onBlur={() => { const v = localName.trim(); if (v !== (campaign.name || "").trim()) updateField("name", v || "New campaign"); }}
                    placeholder="Campaign name"
                    style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", background: "transparent", border: "none", outline: "none", fontFamily: "inherit", width: "100%", marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <select value={campaign.status || "planning"} onChange={e => updateField("status", e.target.value)} style={{ ...selStyle, background: STATUS_META[campaign.status]?.bg, color: STATUS_META[campaign.status]?.color, fontWeight: 600 }}>
                      {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <input type="date" value={campaign.start_date || ""} onChange={e => updateField("start_date", e.target.value)} style={{ ...selStyle, color: "var(--t3)" }} />
                    <span style={{ color: "var(--t4)", fontSize: 12 }}>→</span>
                    <input type="date" value={campaign.end_date || ""} onChange={e => updateField("end_date", e.target.value)} style={{ ...selStyle, color: "var(--t3)" }} />
                    {campaign.start_date && campaign.end_date && campaign.start_date > campaign.end_date && (
                      <span style={{ fontSize: 10, color: "var(--error)", display: "flex", alignItems: "center", gap: 3 }}>
                        <AlertCircle size={10} /> End before start
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    <button onClick={analyzeCampaign} disabled={analysisLoading} style={buttonStyle("secondary", { gap: 5, fontSize: 11 })}>
                      <Sparkles size={12} /> {analysisLoading ? "Analyzing…" : "Analyze"}
                    </button>
                    {!confirmDelete && (
                      <button onClick={handleDuplicate} style={{ ...buttonStyle("ghost", { padding: "5px 10px", fontSize: 11 }), color: "var(--t3)" }}>Duplicate</button>
                    )}
                    {campaign.status !== "archived" && !confirmDelete && (
                      <button onClick={() => updateField("status", "archived")} style={{ ...buttonStyle("ghost", { padding: "5px 10px", fontSize: 11 }), color: "var(--t3)" }}>Archive</button>
                    )}
                    {!confirmDelete
                      ? <button onClick={() => setConfirmDelete(true)} style={buttonStyle("ghost", { padding: "5px 8px" })}><Trash2 size={13} /></button>
                      : <div style={{ display: "flex", gap: 5 }}>
                          <button onClick={() => { onDeleteCampaign(campaign.id); setActiveCampaignId(null); setConfirmDelete(false); }} style={{ ...buttonStyle("ghost", { padding: "5px 10px" }), color: "var(--error)", borderColor: "var(--error-border)" }}>Delete</button>
                          <button onClick={() => setConfirmDelete(false)} style={buttonStyle("ghost", { padding: "5px 8px" })}><X size={12} /></button>
                        </div>
                    }
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                    <div>
                      <div style={{ ...labelStyle, marginBottom: 3 }}>Objective</div>
                      <InlineTextInput value={campaign.objective || ""} placeholder="Campaign objective…" onSave={v => updateField("objective", v)} />
                    </div>
                    <div>
                      <div style={{ ...labelStyle, marginBottom: 3 }}>Audience</div>
                      <InlineTextInput value={campaign.audience || ""} placeholder="Target audience…" onSave={v => updateField("audience", v)} />
                    </div>
                  </div>
                  {/* Progress bar + stats */}
                  {(() => {
                    const prog = campaignProgress(campaign, linkedStories);
                    const pct  = Math.round(prog.pct * 100);
                    const daysLeft = campaign.end_date
                      ? Math.max(0, Math.ceil((new Date(campaign.end_date + "T23:59:59") - new Date()) / 86400000))
                      : null;
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--border2)" }}>
                        <ProgressRing pct={prog.pct} color={campaign.color || "#4A9B7F"} size={22} />
                        <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--bg3)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: campaign.color || "#4A9B7F", borderRadius: 2, transition: "width 0.4s" }} />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--t3)", whiteSpace: "nowrap" }}>{prog.done}/{prog.total} done</span>
                        <span style={{ color: "var(--t4)", fontSize: 11 }}>·</span>
                        <span style={{ fontSize: 11, color: "var(--t3)", whiteSpace: "nowrap" }}>{linkedStories.length} {linkedStories.length === 1 ? "story" : "stories"}</span>
                        {daysLeft !== null && <>
                          <span style={{ color: "var(--t4)", fontSize: 11 }}>·</span>
                          <span style={{ fontSize: 11, color: daysLeft <= 7 ? "var(--warning)" : "var(--t4)", whiteSpace: "nowrap" }}>{daysLeft}d left</span>
                        </>}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* ── AI analysis panel ── */}
            {analysisOpen && (
              <Panel style={{ marginBottom: 20, border: "0.5px solid var(--border)", position: "relative" }}>
                <button onClick={() => setAnalysisOpen(false)} style={{ position: "absolute", top: 10, right: 10, ...buttonStyle("ghost", { padding: "3px 6px" }) }}><X size={12} /></button>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Campaign analysis</div>
                {analysisLoading && !analysisText && <div style={{ fontSize: 12, color: "var(--t4)" }}>Analyzing…</div>}
                <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{analysisText}</div>
              </Panel>
            )}

            {/* ── Deliverable bundle ── */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Deliverable Bundle</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={suggestDeliverables} disabled={suggestLoading} style={buttonStyle("secondary", { fontSize: 11, gap: 4 })}>
                    <Sparkles size={11} /> {suggestLoading ? "Suggesting…" : "Suggest"}
                  </button>
                  <button onClick={addDeliverable} style={buttonStyle("secondary", { fontSize: 11, gap: 4 })}>
                    <Plus size={11} /> Add
                  </button>
                </div>
              </div>

              {(campaign.deliverables || []).length > 0 ? (
                <>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 72px 1fr 28px", gap: 8, padding: "4px 0 6px", borderBottom: "0.5px solid var(--border)" }}>
                    {["Content type","Channel","Count","Progress",""].map((h, i) => (
                      <span key={i} style={{ ...labelStyle }}>{h}</span>
                    ))}
                  </div>
                  {(campaign.deliverables || []).map(row => (
                    <DeliverableRow key={row.id} row={row} linkedStories={linkedStories}
                      onChange={next => updateDeliverable(row.id, next)}
                      onDelete={() => deleteDeliverable(row.id)}
                    />
                  ))}
                  {/* Summary */}
                  {(() => {
                    const { done, total } = campaignProgress(campaign, linkedStories);
                    return (
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, paddingTop: 10, fontSize: 12, color: "var(--t3)" }}>
                        <span>{done}/{total} total deliverables</span>
                        <div style={{ width: 80, height: 4, borderRadius: 2, background: "var(--bg3)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${total ? (done/total)*100 : 0}%`, background: done >= total && total > 0 ? "var(--success)" : "var(--t3)", borderRadius: 2, transition: "width 0.3s" }} />
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--t4)", fontSize: 12, lineHeight: 1.6 }}>
                  Deliverables define what this campaign should produce — e.g. 3 narrative posts + 2 ads for Instagram.<br />
                  <button onClick={suggestDeliverables} disabled={suggestLoading} style={{ background: "none", border: "none", color: "var(--t2)", cursor: "pointer", fontSize: 12, textDecoration: "underline", marginTop: 4 }}>
                    {suggestLoading ? "Suggesting…" : "Let AI suggest targets"}
                  </button>
                  {" "}&nbsp;or&nbsp;<button onClick={addDeliverable} style={{ background: "none", border: "none", color: "var(--t2)", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>add one manually</button>.
                </div>
              )}
            </div>

            {/* ── Stories ── */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Stories <span style={{ color: "var(--t4)", fontWeight: 400 }}>{linkedStories.length}</span>
                </span>
                <button onClick={() => { setAddStoriesOpen(o => !o); setPickerSearch(""); }} style={buttonStyle("secondary", { fontSize: 11, gap: 4 })}>
                  {addStoriesOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Add from pipeline
                </button>
              </div>

              {/* Stage funnel */}
              {linkedStories.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                  {Object.entries(STAGES).filter(([k]) => !["rejected","archived"].includes(k)).map(([key, st]) => {
                    const count = stageCounts[key] || 0;
                    if (!count) return null;
                    return (
                      <span key={key} style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 99, background: "var(--fill2)", border: "0.5px solid var(--border)", color: "var(--t2)" }}>
                        {st.label} · {count}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Story grid */}
              {linkedStories.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8, marginBottom: 16 }}>
                  {linkedStories.map(s => (
                    <StoryChip key={s.id} story={s} campaigns={campaigns} onMove={moveStory} />
                  ))}
                </div>
              ) : (
                <div style={{ padding: "24px 0 8px", textAlign: "center", color: "var(--t4)", fontSize: 12 }}>
                  No stories linked to this campaign yet.
                </div>
              )}

              {/* Add from pipeline picker */}
              {addStoriesOpen && (
                <div className="animate-fade-in" style={{ borderRadius: 10, border: "0.5px solid var(--border)", overflow: "hidden", marginTop: 8 }}>
                  <div style={{ padding: "10px 14px", background: "var(--bg2)", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>Add from pipeline</span>
                    <input
                      value={pickerSearch}
                      onChange={e => setPickerSearch(e.target.value)}
                      placeholder="Search stories…"
                      style={{ flex: 1, fontSize: 12, background: "var(--fill2)", border: "0.5px solid var(--border)", borderRadius: 5, padding: "4px 8px", color: "var(--t1)", outline: "none", fontFamily: "inherit" }}
                    />
                    {pickerSearch && (
                      <button onClick={() => setPickerSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                        <X size={12} color="var(--t4)" />
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {filteredPipelineStories.length === 0 ? (
                      <div style={{ padding: "20px", textAlign: "center", color: "var(--t4)", fontSize: 12 }}>
                        {unlinkedStories.length === 0 ? "All pipeline stories are already in this campaign." : "No stories match your search."}
                      </div>
                    ) : filteredPipelineStories.map(s => {
                      const inOtherCampaign = s.campaign_id && s.campaign_id !== campaign.id;
                      const otherName = inOtherCampaign ? campaigns.find(c => c.id === s.campaign_id)?.name : null;
                      return (
                        <button key={s.id} onClick={() => moveStory(s, campaign.id)}
                          style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "transparent", border: "none", borderBottom: "0.5px solid var(--border2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                            <div style={{ fontSize: 10, color: "var(--t4)", marginTop: 2 }}>
                              {STAGES[s.status]?.label || s.status}
                              {s.score_total ? ` · ${s.score_total}` : ""}
                              {otherName ? <span style={{ color: "var(--warning)" }}> · in "{otherName}"</span> : ""}
                            </div>
                          </div>
                          <Plus size={13} color="var(--t4)" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
