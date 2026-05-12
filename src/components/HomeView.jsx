"use client";
import { ArrowRight, CheckCircle, Circle, FileText } from "lucide-react";
import { EmptyState, PageHeader, Panel, SectionHeader, SourceReviewButton, StatCard, buttonStyle } from "@/components/OperationalUI";
import { getActiveProgrammes, getBrandProgrammes, getBrandTargetPlatforms } from "@/lib/brandConfig";

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
  const programmes = getBrandProgrammes(settings);
  const activeProgrammes = getActiveProgrammes(settings);
  const hasBrand = Boolean(getBrandName(settings) || settings?.brand?.short_description || settings?.brand?.voice);
  const hasStrategy = Boolean(settings?.strategy?.content_goals || settings?.strategy?.content_pillars?.length || settings?.strategy?.key_messages);
  const hasProgrammes = activeProgrammes.length > 0;
  const hasContent = stories.length > 0;
  const checks = [
    { label: "Brand profile", done: hasBrand, action: "Finish strategy setup" },
    { label: "Content strategy", done: hasStrategy, action: "Review strategy" },
    { label: "Active programmes", done: hasProgrammes, action: "Review programmes" },
    { label: "Content pipeline", done: hasContent, action: "Generate first ideas" },
  ];
  return { checks, done: checks.filter(c => c.done).length, total: checks.length, programmes, activeProgrammes };
}

export default function HomeView({ stories = [], settings = null, onNavigate, onOpenSettings, onRunOnboarding }) {
  const r = readiness(settings, stories);
  const needsApproval = countWhere(stories, ["accepted"]);
  const inProgress = countWhere(stories, ["approved", "scripted", "produced"]);
  const readyToExport = countWhere(stories, ["produced"]);
  const published = countWhere(stories, ["published"]);
  const recent = latestItems(stories);
  const targetPlatforms = getBrandTargetPlatforms(settings);

  const nextAction = !r.checks[0].done
    ? { title: "Finish strategy setup", desc: "Create a clear brand profile before generating client-facing work.", action: () => onRunOnboarding?.(false), label: "Run onboarding" }
    : !r.checks[2].done
      ? { title: "Review programmes", desc: "Programmes define the recurring lanes Creative Engine should operate against.", action: () => onNavigate?.("strategy"), label: "Review programmes" }
      : !stories.length
        ? { title: "Generate or add first ideas", desc: "Start with source-aware opportunities before moving content into Pipeline.", action: () => onNavigate?.("research"), label: "Open Ideas" }
        : needsApproval
          ? { title: "Review content waiting in Pipeline", desc: `${needsApproval} item${needsApproval === 1 ? "" : "s"} need a human decision before drafting or export.`, action: () => onNavigate?.("pipeline"), label: "Open Pipeline" }
          : { title: "Ready to continue", desc: "Your workspace has strategy and active content. Continue where the work is moving.", action: () => onNavigate?.("create"), label: "Open Create" };

  return (
    <div className="anim-fade">
      <PageHeader
        title="Workspace overview"
        description="A calm cockpit for readiness, next actions, and operational signals."
      />

      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1.45fr) minmax(260px,0.75fr)", gap:18, alignItems:"start" }}>
        <Panel style={{ minHeight:168, padding:"22px 24px" }}>
          <SectionHeader
            title="Next action"
            description={nextAction.desc}
            action={<button onClick={nextAction.action} style={buttonStyle("primary")}><ArrowRight size={13}/>{nextAction.label}</button>}
          />
          <div style={{ fontSize:24, fontWeight:700, color:"var(--t1)", letterSpacing:0, marginTop:16, maxWidth:620 }}>{nextAction.title}</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:"7px 14px", marginTop:22, maxWidth:560 }}>
            {r.checks.map(check => (
              <div key={check.label} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:check.done ? "var(--t2)" : "var(--t3)" }}>
                {check.done ? <CheckCircle size={13} color="var(--t3)" /> : <Circle size={13} color="var(--t4)" />}
                <span>{check.label}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel style={{ padding:"18px 20px" }}>
          <SectionHeader title="Workspace readiness" meta={`${r.done}/${r.total}`} />
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {r.checks.map(check => (
              <div key={check.label} style={{ display:"flex", alignItems:"center", gap:9, fontSize:12, color:check.done?"var(--t2)":"var(--t3)" }}>
                {check.done ? <CheckCircle size={13} color="var(--t3)" /> : <Circle size={13} color="var(--t4)" />}
                <span>{check.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:10, marginTop:16 }}>
        <StatCard label="In progress" value={inProgress} />
        <StatCard label="Needs approval" value={needsApproval} />
        <StatCard label="Ready to export" value={readyToExport} />
        <StatCard label="Published / logged" value={published} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:16, marginTop:16 }}>
        <Panel>
          <SectionHeader
            title="Programmes"
            description="Recurring lanes for content operations."
            meta={`${r.activeProgrammes.length} active`}
            action={<button onClick={() => onNavigate?.("strategy")} style={buttonStyle("ghost")}>Review</button>}
          />
	          {r.activeProgrammes.length ? (
	            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
	              {r.activeProgrammes.slice(0,4).map(programme => (
	                <div key={programme.key} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderTop:"1px solid var(--border2)" }}>
	                  <span style={{ width:5, height:5, borderRadius:99, background:"var(--t4)", flexShrink:0 }} />
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:650, color:"var(--t1)" }}>{programme.label}</div>
                    <div style={{ fontSize:11, color:"var(--t3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{programme.cadence || programme.desc || "Active programme"}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Create or review programmes" description="Programmes make Creative Engine operational instead of one-off. Start from onboarding or Strategy." action={() => onNavigate?.("strategy")} actionLabel="Open Strategy" />
          )}
        </Panel>

        <Panel>
          <SectionHeader
            title="Workspace signals"
            description="Early operational transparency, not predictive analytics."
            action={<SourceReviewButton work={["Summarized current strategy fields", "Counted content by workflow state", "Checked active programmes"]} />}
          />
          <div style={{ display:"grid", gap:8 }}>
            <div style={{ fontSize:12, color:"var(--t2)", lineHeight:1.5 }}>
              {targetPlatforms.length ? `Target platforms: ${targetPlatforms.slice(0,4).join(", ")}${targetPlatforms.length > 4 ? "…" : ""}` : "Target platforms need confirmation in Strategy."}
            </div>
            <div style={{ fontSize:12, color:"var(--t2)", lineHeight:1.5 }}>
              {readyToExport ? `${readyToExport} item${readyToExport === 1 ? "" : "s"} look ready for export review.` : "No export-ready items yet. Create content and run approval checks first."}
            </div>
            <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.5 }}>
              Analyze will stay focused on transparency and workspace learning signals until there is enough real performance data.
            </div>
          </div>
        </Panel>
      </div>

      <Panel style={{ marginTop:16 }}>
        <SectionHeader title="Recent work" action={<button onClick={() => onNavigate?.("pipeline")} style={buttonStyle("ghost")}>Open Pipeline</button>} />
        {recent.length ? (
          <div style={{ display:"grid", gap:7 }}>
            {recent.map(item => (
              <div key={item.id} style={{ display:"grid", gridTemplateColumns:"20px minmax(0,1fr) auto", gap:10, alignItems:"center", padding:"8px 0", borderTop:"1px solid var(--border2)" }}>
                <FileText size={14} color="var(--t3)" />
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, color:"var(--t1)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.title}</div>
                  <div style={{ fontSize:11, color:"var(--t3)" }}>{item.status || "content item"}</div>
                </div>
                <span style={{ fontSize:11, color:"var(--t4)" }}>{item.content_type || "content"}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Generate or add first ideas" description="Once ideas move into Pipeline, recent work will appear here." action={() => onNavigate?.("research")} actionLabel="Open Ideas" />
        )}
      </Panel>
    </div>
  );
}
