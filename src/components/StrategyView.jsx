"use client";
import { Bot, Edit3, RefreshCw, ShieldAlert, Target } from "lucide-react";
import { EmptyState, PageHeader, Panel, Pill, SectionHeader, SourceReviewButton, buttonStyle, labelStyle } from "@/components/OperationalUI";
import { buildAgentContext, buildBrandSnapshot } from "@/lib/agent/agentContext";
import {
  getActiveProgrammes,
  getBrandAvoid,
  getBrandAvoidAngles,
  getBrandComplianceSensitivities,
  getBrandContentGoals,
  getBrandContentPillars,
  getBrandIndustry,
  getBrandName,
  getBrandProgrammes,
  getBrandTargetAudience,
  getBrandTargetPlatforms,
  getBrandVoice,
} from "@/lib/brandConfig";

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(/\n|,/).map(v => v.trim()).filter(Boolean);
}

function SummaryField({ label, value, fallback, action, actionLabel }) {
  const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
  return (
    <div style={{ padding:"10px 0", borderTop:"1px solid var(--border2)" }}>
      <div style={{ ...labelStyle, marginBottom:4 }}>{label}</div>
      {hasValue ? (
        Array.isArray(value) ? (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{value.map(item => <Pill key={item}>{item}</Pill>)}</div>
        ) : (
          <div style={{ fontSize:12, color:"var(--t2)", lineHeight:1.55 }}>{value}</div>
        )
      ) : (
        <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center" }}>
          <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.45 }}>{fallback}</div>
          {action && actionLabel && <button onClick={action} style={buttonStyle("ghost", { flexShrink:0 })}>{actionLabel}</button>}
        </div>
      )}
    </div>
  );
}

export default function StrategyView({ settings = null, tenant = null, onOpenSettings, onRunOnboarding, onOpenAssistant }) {
  const brandName = getBrandName(settings);
  const voice = getBrandVoice(settings);
  const avoid = getBrandAvoid(settings);
  const industry = getBrandIndustry(settings);
  const audience = getBrandTargetAudience(settings);
  const goals = getBrandContentGoals(settings);
  const pillars = getBrandContentPillars(settings);
  const platforms = getBrandTargetPlatforms(settings);
  const avoidAngles = asList(getBrandAvoidAngles(settings));
  const sensitivities = asList(getBrandComplianceSensitivities(settings));
  const claims = asList(settings?.strategy?.claims_to_use_carefully);
  const programmes = getBrandProgrammes(settings);
  const activeProgrammes = getActiveProgrammes(settings);
  const hasBrandProfile = Boolean(brandName || voice || audience || industry);
  const hasStrategy = Boolean(goals || pillars.length || platforms.length);

  const askAssistant = () => {
    onOpenAssistant?.(buildAgentContext({
      workspace_id: tenant?.workspace_id,
      brand_profile_id: tenant?.brand_profile_id,
      source_view: "brand_profile",
      source_component: "strategy_surface",
      source_entity_type: "brand_profile",
      source_entity_id: tenant?.brand_profile_id,
      task_type: "improve_brand_profile",
      brand_snapshot: buildBrandSnapshot(settings),
      settings_snapshot: {
        goals,
        pillars,
        platforms,
        active_programmes: activeProgrammes.map(p => p.label),
        compliance_sensitivities: sensitivities,
      },
      suggested_actions: [
        { id: "improve_profile", label: "Improve brand profile", task_type: "improve_brand_profile", requires_confirmation: true },
        { id: "content_pillars", label: "Suggest content pillars", task_type: "suggest_content_pillars", requires_confirmation: true },
        { id: "programmes", label: "Suggest programmes", task_type: "suggest_programmes", requires_confirmation: true },
      ],
      requires_user_approval: true,
    }));
  };

  return (
    <div className="anim-fade">
      <PageHeader
        title="Strategy"
        description="The strategic control surface for Brand Profile, Content Strategy, Programmes, and risk guidance. Editing still lives in Settings while this surface matures."
        meta={brandName || "No brand profile"}
        action={
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button onClick={askAssistant} style={buttonStyle("secondary")}><Bot size={13}/>Ask assistant</button>
            <button onClick={() => onRunOnboarding?.(true)} style={buttonStyle("ghost")}><RefreshCw size={13}/>Refresh strategy</button>
            <button onClick={onOpenSettings} style={buttonStyle("primary")}><Edit3 size={13}/>Edit in Settings</button>
          </div>
        }
      />

      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(280px,0.8fr)", gap:16, alignItems:"start" }}>
        <Panel>
          <SectionHeader title="Brand Profile" description="What Creative Engine should understand before generating content." />
          {hasBrandProfile ? (
            <>
              <SummaryField label="Brand" value={brandName} fallback="No brand name saved." action={onOpenSettings} actionLabel="Edit" />
              <SummaryField label="Industry" value={industry} fallback="Industry is not specified." action={onOpenSettings} actionLabel="Edit" />
              <SummaryField label="Audience" value={audience} fallback="Priority audience needs confirmation." action={onRunOnboarding} actionLabel="Run onboarding" />
              <SummaryField label="Voice" value={voice} fallback="Brand voice is not yet defined." action={onOpenSettings} actionLabel="Edit" />
              <SummaryField label="Avoid" value={avoid} fallback="No avoid guidance saved." action={onOpenSettings} actionLabel="Edit" />
            </>
          ) : (
            <EmptyState title="Run onboarding to create a brand profile" description="Creative Engine needs source-backed brand context before it can operate reliably." action={() => onRunOnboarding?.(false)} actionLabel="Run onboarding" />
          )}
        </Panel>

        <Panel>
          <SectionHeader title="Setup status" description="Useful enough to operate, not a score of brand quality." />
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <Pill tone={hasBrandProfile ? "success" : "warning"}>{hasBrandProfile ? "Ready" : "Needs setup"} · Brand profile</Pill>
            <Pill tone={hasStrategy ? "success" : "warning"}>{hasStrategy ? "Ready" : "Needs setup"} · Content strategy</Pill>
            <Pill tone={activeProgrammes.length ? "success" : "warning"}>{activeProgrammes.length ? `${activeProgrammes.length} active` : "Needs setup"} · Programmes</Pill>
            <Pill tone={sensitivities.length || claims.length ? "success" : "warning"}>{sensitivities.length || claims.length ? "Guidance present" : "Needs guidance"} · Claims/risk</Pill>
          </div>
          <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.5, marginTop:14 }}>
            Settings remains the editing/configuration surface for now. Strategy is the product review surface.
          </div>
        </Panel>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:16, marginTop:16 }}>
        <Panel>
          <SectionHeader title="Content Strategy" action={<SourceReviewButton work={["Read saved brand settings", "Summarized strategy fields", "Checked missing guidance"]} />} />
          <SummaryField label="Goals" value={goals} fallback="Main content goals are not defined." action={onOpenSettings} actionLabel="Edit" />
          <SummaryField label="Pillars" value={pillars} fallback="No content pillars are saved." action={onOpenSettings} actionLabel="Edit" />
          <SummaryField label="Platforms" value={platforms} fallback="Target platforms need confirmation." action={onOpenSettings} actionLabel="Edit" />
          <SummaryField label="Avoid angles" value={avoidAngles} fallback="No avoid-angle guidance saved." action={onOpenSettings} actionLabel="Edit" />
        </Panel>

        <Panel>
          <SectionHeader title="Risk / Claims Guidance" description="Warnings and sensitivity guidance for future compliance checks." />
          {sensitivities.length || claims.length ? (
            <>
              <SummaryField label="Compliance sensitivities" value={sensitivities} fallback="" />
              <SummaryField label="Claims to use carefully" value={claims} fallback="" />
            </>
          ) : (
            <EmptyState title="Add risk and claims guidance" description="This helps the assistant and compliance checks avoid risky claims before export." action={onOpenSettings} actionLabel="Edit guidance" meta="Needs confirmation" />
          )}
        </Panel>
      </div>

      <Panel style={{ marginTop:16 }}>
        <SectionHeader title="Programmes" description="Recurring content lanes that make Creative Engine operational." meta={`${activeProgrammes.length}/${programmes.length} active`} />
        {programmes.length ? (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:10 }}>
            {programmes.map(programme => (
              <div key={programme.key} style={{ padding:"12px", borderRadius:"var(--ce-radius)", background:"var(--fill2)", border:"1px solid var(--border)", opacity:programme.active === false ? 0.58 : 1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:8, alignItems:"flex-start", marginBottom:7 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)" }}>{programme.label}</div>
                    <div style={{ fontSize:11, color:"var(--t3)", marginTop:2 }}>{programme.cadence || programme.role || "Programme"}</div>
                  </div>
                  <Pill tone={programme.active === false ? "neutral" : "success"}>{programme.active === false ? "Inactive" : "Active"}</Pill>
                </div>
                <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.45 }}>{programme.desc || "No description saved yet."}</div>
                {programme.platforms?.length > 0 && (
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:10 }}>
                    {programme.platforms.slice(0,3).map(platform => <Pill key={platform}>{platform}</Pill>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Create programmes" description="Programmes define repeatable output lanes. Run onboarding or edit Settings to create the first set." action={() => onRunOnboarding?.(true)} actionLabel="Draft programmes" />
        )}
      </Panel>
    </div>
  );
}
