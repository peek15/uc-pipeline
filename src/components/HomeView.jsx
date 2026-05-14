"use client";
import { useState, useEffect, useRef } from "react";
import { ArrowRight, CheckCircle, Circle, FileText, Clock, AlertCircle } from "lucide-react";
import { EmptyState, PageHeader, Panel, SectionHeader, SourceReviewButton, StatCard, buttonStyle } from "@/components/OperationalUI";
import { getActiveProgrammes, getBrandName, getBrandProgrammes, getBrandTargetPlatforms } from "@/lib/brandConfig";
import { supabase } from "@/lib/db";
import { getAdaptiveScore } from "@/lib/adaptiveScoring";

function countWhere(stories, statuses) {
  const set = new Set(statuses);
  return stories.filter(s => set.has(s.status)).length;
}

function latestItems(stories, count = 4) {
  return [...stories]
    .filter(s => !["rejected", "archived"].includes(s.status))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
    .slice(0, count);
}

function readiness(settings, stories) {
  const activeProgrammes = getActiveProgrammes(settings);
  const hasBrand = Boolean(getBrandName(settings) || settings?.brand?.short_description || settings?.brand?.voice);
  const hasStrategy = Boolean(settings?.strategy?.content_goals || settings?.strategy?.content_pillars?.length || settings?.strategy?.key_messages);
  const hasProgrammes = activeProgrammes.length > 0;
  const hasContent = stories.length > 0;
  const checks = [
    { label: "Brand profile", done: hasBrand },
    { label: "Content strategy", done: hasStrategy },
    { label: "Active programmes", done: hasProgrammes },
    { label: "Content pipeline", done: hasContent },
  ];
  return { checks, done: checks.filter(c => c.done).length, total: checks.length, activeProgrammes };
}

function scoreDistribution(stories, settings) {
  const scored = stories
    .filter(s => !["rejected", "archived"].includes(s.status))
    .map(s => getAdaptiveScore(s, settings).total)
    .filter(t => t > 0);
  if (!scored.length) return null;
  const high = scored.filter(t => t >= 70).length;
  const mid  = scored.filter(t => t >= 40 && t < 70).length;
  const low  = scored.filter(t => t < 40).length;
  const avg  = Math.round(scored.reduce((s, v) => s + v, 0) / scored.length);
  return { high, mid, low, avg, total: scored.length };
}

export default function HomeView({ stories = [], settings = null, tenant = null, onNavigate, onOpenSettings, onRunOnboarding, onUpdateStory }) {
  const [memoryCount, setMemoryCount] = useState(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || !tenant?.workspace_id) return;
    fetchedRef.current = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) return;
      const qs = new URLSearchParams({ workspace_id: tenant.workspace_id, limit: "1" });
      if (tenant.brand_profile_id) qs.set("brand_profile_id", tenant.brand_profile_id);
      fetch(`/api/workspace-memory?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(json => { if (json?.memory_context?.count != null) setMemoryCount(json.memory_context.count); })
        .catch(() => {});
    });
  }, [tenant?.workspace_id, tenant?.brand_profile_id]);

  const r = readiness(settings, stories);
  const needsApproval  = countWhere(stories, ["accepted"]);
  const inProgress     = countWhere(stories, ["approved", "scripted", "produced"]);
  const readyToExport  = countWhere(stories, ["produced"]);
  const published      = countWhere(stories, ["published"]);
  const recent         = latestItems(stories);
  const approvalQueue  = stories.filter(s => s.status === "accepted").slice(0, 4);
  const targetPlatforms = getBrandTargetPlatforms(settings);
  const scores         = scoreDistribution(stories, settings);

  const nextAction = !r.checks[0].done
    ? { title: "Finish strategy setup", desc: "Create a brand profile before generating client-facing work.", action: () => onRunOnboarding?.(false), label: "Run onboarding" }
    : !r.checks[2].done
      ? { title: "Review programmes", desc: "Programmes define recurring content lanes.", action: () => onNavigate?.("strategy"), label: "Review programmes" }
      : !stories.length
        ? { title: "Generate or add first ideas", desc: "Start with source-aware opportunities in Ideas.", action: () => onNavigate?.("research"), label: "Open Ideas" }
        : needsApproval
          ? { title: `${needsApproval} item${needsApproval === 1 ? "" : "s"} waiting for review`, desc: "These have been researched and need a decision before drafting.", action: () => onNavigate?.("pipeline"), label: "Open Pipeline" }
          : { title: "Ready to continue", desc: "Active content is in progress. Continue where the work is moving.", action: () => onNavigate?.("create"), label: "Open Create" };

  return (
    <div className="anim-fade">
      <PageHeader
        title="Workspace"
        description="Next action, readiness, and operational signals."
      />

      {/* Top row: next action + readiness */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.45fr) minmax(260px,0.75fr)", gap: 18, alignItems: "start" }}>
        <Panel style={{ minHeight: 160, padding: "22px 24px" }}>
          <SectionHeader
            title="Next action"
            description={nextAction.desc}
            action={<button onClick={nextAction.action} style={buttonStyle("primary")}><ArrowRight size={13} />{nextAction.label}</button>}
          />
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--t1)", marginTop: 14, maxWidth: 560 }}>{nextAction.title}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "6px 14px", marginTop: 18, maxWidth: 480 }}>
            {r.checks.map(check => (
              <div key={check.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: check.done ? "var(--t2)" : "var(--t3)" }}>
                {check.done ? <CheckCircle size={13} color="var(--t3)" /> : <Circle size={13} color="var(--t4)" />}
                <span>{check.label}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel style={{ padding: "18px 20px" }}>
          <SectionHeader title="Workspace readiness" meta={`${r.done}/${r.total}`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {r.checks.map(check => (
              <div key={check.label} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: check.done ? "var(--t2)" : "var(--t3)" }}>
                {check.done ? <CheckCircle size={13} color="var(--t3)" /> : <Circle size={13} color="var(--t4)" />}
                <span>{check.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginTop: 16 }}>
        <StatCard label="In progress"     value={inProgress} />
        <StatCard label="Needs approval"  value={needsApproval} />
        <StatCard label="Ready to export" value={readyToExport} />
        <StatCard label="Published"       value={published} />
      </div>

      {/* Approval queue — only when relevant */}
      {approvalQueue.length > 0 && (
        <Panel style={{ marginTop: 16 }}>
          <SectionHeader
            title="Approval queue"
            description="These items have been researched and are waiting for a decision."
            meta={needsApproval > 4 ? `+${needsApproval - 4} more` : null}
            action={<button onClick={() => onNavigate?.("pipeline")} style={buttonStyle("ghost")}>Open Pipeline</button>}
          />
          <div style={{ display: "grid", gap: 6 }}>
            {approvalQueue.map(item => (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "14px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--border2)" }}>
                <AlertCircle size={13} color="var(--t4)" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>{item.content_type || "content item"}</div>
                </div>
                <button onClick={() => onNavigate?.("pipeline")} style={{ ...buttonStyle("ghost"), fontSize: 11, padding: "3px 9px" }}>Review</button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Programmes + workspace signals */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, marginTop: 16 }}>
        <Panel>
          <SectionHeader
            title="Programmes"
            description="Recurring lanes for content operations."
            meta={`${r.activeProgrammes.length} active`}
            action={<button onClick={() => onNavigate?.("strategy")} style={buttonStyle("ghost")}>Review</button>}
          />
          {r.activeProgrammes.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {r.activeProgrammes.slice(0, 4).map(programme => (
                <div key={programme.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--border2)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--t4)", flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 650, color: "var(--t1)" }}>{programme.label}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{programme.cadence || programme.desc || "Active programme"}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Create or review programmes" description="Programmes make Creative Engine operational instead of one-off." action={() => onNavigate?.("strategy")} actionLabel="Open Strategy" />
          )}
        </Panel>

        <Panel>
          <SectionHeader
            title="Workspace signals"
            description="Operational transparency — not predictive analytics."
            action={<SourceReviewButton work={["Counted content by workflow state", "Summarised adaptive score distribution", "Fetched durable memory count"]} />}
          />
          <div style={{ display: "grid", gap: 10 }}>
            {/* Adaptive score distribution */}
            {scores ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                {[
                  { label: "Strong", value: scores.high, note: "≥70" },
                  { label: "Mid",    value: scores.mid,  note: "40–69" },
                  { label: "Weak",   value: scores.low,  note: "<40" },
                ].map(({ label, value, note }) => (
                  <div key={label} style={{ padding: "8px 10px", borderRadius: 7, background: "var(--fill2)", border: "0.5px solid var(--border)" }}>
                    <div style={{ fontSize: 10, color: "var(--t4)", marginBottom: 2 }}>{label} <span style={{ color: "var(--t4)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>{note}</span></div>
                    <div style={{ fontSize: 17, fontWeight: 650, color: "var(--t1)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5 }}>No scored content yet. Run Ideas to start building adaptive scores.</div>
            )}
            {/* Platform + memory row */}
            <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.5 }}>
              {targetPlatforms.length
                ? `Platforms: ${targetPlatforms.slice(0, 4).join(", ")}${targetPlatforms.length > 4 ? "…" : ""}`
                : "Target platforms not yet configured in Strategy."}
            </div>
            {memoryCount != null && (
              <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5, display: "flex", alignItems: "center", gap: 5 }}>
                <Clock size={11} color="var(--t4)" />
                {memoryCount > 0
                  ? `${memoryCount} workspace memory item${memoryCount === 1 ? "" : "s"} — guiding assistant, Ideas, and scoring.`
                  : "No workspace memory yet. Complete onboarding to build durable context."}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Recent work */}
      <Panel style={{ marginTop: 16 }}>
        <SectionHeader title="Recent work" action={<button onClick={() => onNavigate?.("pipeline")} style={buttonStyle("ghost")}>Open Pipeline</button>} />
        {recent.length ? (
          <div style={{ display: "grid", gap: 7 }}>
            {recent.map(item => {
              const score = getAdaptiveScore(item, settings);
              return (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "14px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--border2)" }}>
                  <FileText size={13} color="var(--t3)" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)" }}>{item.status}{item.content_type ? ` · ${item.content_type}` : ""}</div>
                  </div>
                  {score.total > 0 && (
                    <span style={{ fontSize: 11, color: "var(--t3)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>{score.total}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Generate or add first ideas" description="Once ideas move into Pipeline, recent work will appear here." action={() => onNavigate?.("research")} actionLabel="Open Ideas" />
        )}
      </Panel>
    </div>
  );
}
