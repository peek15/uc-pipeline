"use client";
import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import { EmptyState, PageHeader, Panel, SectionHeader, SourceReviewButton, buttonStyle, labelStyle } from "@/components/OperationalUI";
import { buildAgentContext, buildBrandSnapshot } from "@/lib/agent/agentContext";
import { supabase } from "@/lib/db";
import { tenantStorageKey } from "@/lib/brand";
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

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings || { brand: {}, strategy: {} }));
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(/\n|,/).map(v => v.trim()).filter(Boolean);
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  const next = cloneSettings(obj);
  let cursor = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    cursor[key] = cursor[key] && typeof cursor[key] === "object" ? cursor[key] : {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
  return next;
}

function Field({ label, children }) {
  return (
    <label style={{ display:"block" }}>
      <div style={{ ...labelStyle, marginBottom:5 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = {
  width:"100%",
  padding:"8px 10px",
  borderRadius:7,
  background:"var(--fill2)",
  border:"0.5px solid var(--border)",
  color:"var(--t1)",
  fontSize:13,
  outline:"none",
  fontFamily:"inherit",
  boxSizing:"border-box",
};

function TextInput({ value, onChange, placeholder }) {
  return <input value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />;
}

function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...inputStyle, resize:"vertical", lineHeight:1.55 }} />;
}

function CsvInput({ value, onChange, placeholder }) {
  return <TextInput value={asArray(value).join(", ")} onChange={v => onChange(asArray(v))} placeholder={placeholder} />;
}

function SaveBar({ dirty, saving, saved, onSave, onReset }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"10px 12px", borderRadius:9, background:"var(--bg2)", border:"0.5px solid var(--border2)", marginBottom:16 }}>
      <div style={{ fontSize:12, color:dirty ? "var(--t2)" : "var(--t3)" }}>
        {saved ? "Strategy saved." : dirty ? "Unsaved strategy edits." : "Strategy is up to date."}
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {dirty && <button onClick={onReset} style={buttonStyle("ghost")}>Discard</button>}
        <button onClick={onSave} disabled={!dirty || saving} style={buttonStyle("primary", { opacity:!dirty || saving ? 0.5 : 1, cursor:!dirty || saving ? "not-allowed" : "pointer" })}>
          <Check size={13}/>{saving ? "Saving..." : "Save strategy"}
        </button>
      </div>
    </div>
  );
}

function ProgrammeEditor({ programmes, onChange }) {
  const updateProgramme = (index, patch) => {
    onChange(programmes.map((programme, i) => i === index ? { ...programme, ...patch } : programme));
  };
  const addProgramme = () => {
    onChange([
      ...programmes,
      {
        key: `programme_${Date.now()}`,
        label: "New programme",
        role: "",
        cadence: "",
        desc: "",
        platforms: [],
        active: true,
      },
    ]);
  };
  const removeProgramme = (index) => onChange(programmes.filter((_, i) => i !== index));

  return (
    <div style={{ display:"grid", gap:10 }}>
      {programmes.map((programme, index) => (
        <div key={programme.key || index} style={{ padding:"12px 0", borderTop:"1px solid var(--border2)" }}>
          <div style={{ display:"grid", gridTemplateColumns:"minmax(160px,1fr) minmax(130px,0.7fr) auto", gap:8, alignItems:"start" }}>
            <Field label="Name">
              <TextInput value={programme.label || programme.name || ""} onChange={value => updateProgramme(index, { label:value, name:value })} placeholder="Product education" />
            </Field>
            <Field label="Cadence">
              <TextInput value={programme.cadence || ""} onChange={value => updateProgramme(index, { cadence:value })} placeholder="Weekly" />
            </Field>
            <button onClick={() => removeProgramme(index)} style={buttonStyle("ghost", { marginTop:20, padding:"7px 9px" })} aria-label="Remove programme">
              <Trash2 size={13}/>
            </button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
            <Field label="Goal / role">
              <TextInput value={programme.role || programme.goal || ""} onChange={value => updateProgramme(index, { role:value, goal:value })} placeholder="Build trust with high-intent buyers" />
            </Field>
            <Field label="Platforms">
              <CsvInput value={programme.platforms || []} onChange={value => updateProgramme(index, { platforms:value })} placeholder="LinkedIn, YouTube" />
            </Field>
          </div>
          <div style={{ marginTop:8 }}>
            <Field label="Description">
              <TextArea value={programme.desc || programme.description || ""} onChange={value => updateProgramme(index, { desc:value, description:value })} placeholder="What kind of content belongs in this programme?" rows={2} />
            </Field>
          </div>
          <label style={{ display:"inline-flex", alignItems:"center", gap:8, marginTop:8, fontSize:12, color:"var(--t3)" }}>
            <input type="checkbox" checked={programme.active !== false} onChange={e => updateProgramme(index, { active:e.target.checked })} />
            Active programme
          </label>
        </div>
      ))}
      <button onClick={addProgramme} style={buttonStyle("secondary", { justifySelf:"start" })}><Plus size={13}/>Add programme</button>
    </div>
  );
}

export default function StrategyView({ settings = null, tenant = null, onRunOnboarding, onOpenAssistant, onSettingsChange }) {
  const [draft, setDraft] = useState(() => cloneSettings(settings));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(cloneSettings(settings));
  }, [settings]);

  const brandName = getBrandName(draft);
  const voice = getBrandVoice(draft);
  const avoid = getBrandAvoid(draft);
  const industry = getBrandIndustry(draft);
  const audience = getBrandTargetAudience(draft);
  const goals = getBrandContentGoals(draft);
  const pillars = getBrandContentPillars(draft);
  const platforms = getBrandTargetPlatforms(draft);
  const avoidAngles = asArray(getBrandAvoidAngles(draft));
  const sensitivities = asArray(getBrandComplianceSensitivities(draft));
  const claims = draft?.strategy?.claims_to_use_carefully || "";
  const programmes = draft?.strategy?.programmes || [];
  const activeProgrammes = getActiveProgrammes(draft);
  const dirty = useMemo(() => JSON.stringify(draft || {}) !== JSON.stringify(settings || {}), [draft, settings]);

  const updatePath = (path, value) => setDraft(current => setPath(current, path, value));

  const saveStrategy = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const next = cloneSettings(draft);
      if (tenant?.workspace_id && tenant?.brand_profile_id) {
        await supabase.from("brand_profiles").upsert({
          id: tenant.brand_profile_id,
          workspace_id: tenant.workspace_id,
          name: next.brand?.name || "Brand profile",
          identity_voice: next.brand?.voice,
          identity_avoid: next.brand?.avoid,
          goal_primary: next.brand?.goal_primary,
          goal_secondary: next.brand?.goal_secondary,
          language_primary: next.brand?.language_primary,
          languages_secondary: next.brand?.languages_secondary,
          settings: next,
          brief_doc: JSON.stringify(next),
        });
      }
      onSettingsChange?.(next);
      try { localStorage.setItem(tenantStorageKey("settings", tenant), JSON.stringify(next)); } catch {}
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const askAssistant = () => {
    onOpenAssistant?.(buildAgentContext({
      workspace_id: tenant?.workspace_id,
      brand_profile_id: tenant?.brand_profile_id,
      source_view: "brand_profile",
      source_component: "strategy_surface",
      source_entity_type: "brand_profile",
      source_entity_id: tenant?.brand_profile_id,
      task_type: "improve_brand_profile",
      brand_snapshot: buildBrandSnapshot(draft),
      settings_snapshot: {
        goals,
        pillars,
        platforms,
        active_programmes: activeProgrammes.map(p => p.label),
        compliance_sensitivities: sensitivities,
      },
      suggested_actions: [
        { id: "explain_strategy", label: "Explain this strategy", task_type: "explain_strategy", requires_confirmation: false },
        { id: "improve_profile", label: "Improve brand profile", task_type: "improve_brand_profile", requires_confirmation: true },
        { id: "programmes", label: "Suggest programmes", task_type: "suggest_programmes", requires_confirmation: true },
        { id: "claims", label: "Refine claims guidance", task_type: "explain_claims_guidance", requires_confirmation: true },
      ],
      requires_user_approval: true,
    }));
  };

  return (
    <div className="anim-fade">
      <PageHeader
        title="Strategy"
        description="The editable control surface for Brand Profile, Content Strategy, Programmes, and risk guidance."
        meta={brandName || "No brand profile"}
        action={
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button onClick={askAssistant} style={buttonStyle("secondary")}><Bot size={13}/>Ask assistant</button>
            <button onClick={() => onRunOnboarding?.(true)} style={buttonStyle("ghost")}><RefreshCw size={13}/>Refresh strategy</button>
          </div>
        }
      />

      <SaveBar dirty={dirty} saving={saving} saved={saved} onSave={saveStrategy} onReset={() => setDraft(cloneSettings(settings))} />

      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:18, alignItems:"start" }}>
        <Panel>
          <SectionHeader title="Brand Profile" description="Core business context used across Ideas, Pipeline, Create, compliance, and export." />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Field label="Brand name"><TextInput value={brandName} onChange={value => updatePath("brand.name", value)} placeholder="Brand name" /></Field>
            <Field label="Industry"><TextInput value={industry} onChange={value => updatePath("brand.industry", value)} placeholder="SaaS, retail, services..." /></Field>
            <Field label="Short description"><TextArea value={draft?.brand?.short_description || ""} onChange={value => updatePath("brand.short_description", value)} placeholder="What does this brand do and for whom?" rows={2} /></Field>
            <Field label="Products / services"><TextArea value={draft?.brand?.products_services || ""} onChange={value => updatePath("brand.products_services", value)} placeholder="Priority offers, services, or product lines" rows={2} /></Field>
            <Field label="Audience"><TextArea value={audience} onChange={value => updatePath("brand.target_audience", value)} placeholder="Primary audience and buyer context" rows={2} /></Field>
            <Field label="Voice"><TextArea value={voice} onChange={value => updatePath("brand.voice", value)} placeholder="Tone, style, vocabulary, and communication standards" rows={2} /></Field>
            <Field label="Avoid"><TextArea value={avoid} onChange={value => updatePath("brand.avoid", value)} placeholder="What the brand should avoid sounding like or doing" rows={2} /></Field>
            <Field label="Differentiators"><TextArea value={draft?.brand?.differentiators || ""} onChange={value => updatePath("brand.differentiators", value)} placeholder="What makes this brand meaningfully different?" rows={2} /></Field>
          </div>
        </Panel>

        <Panel>
          <SectionHeader
            title="Content Strategy"
            description="Direction for what Creative Engine should create and why."
            action={<SourceReviewButton work={["Read saved brand settings", "Checked strategy fields", "Prepared editable strategy summary"]} />}
          />
          <div style={{ display:"grid", gap:10 }}>
            <Field label="Content goals"><TextArea value={goals} onChange={value => updatePath("strategy.content_goals", value)} placeholder="What should content achieve?" rows={2} /></Field>
            <Field label="Target platforms"><CsvInput value={platforms} onChange={value => updatePath("strategy.target_platforms", value)} placeholder="LinkedIn, YouTube, TikTok..." /></Field>
            <Field label="Content pillars"><CsvInput value={pillars} onChange={value => updatePath("strategy.content_pillars", value)} placeholder="Education, proof, product, founder POV..." /></Field>
            <Field label="Key messages"><TextArea value={draft?.strategy?.key_messages || ""} onChange={value => updatePath("strategy.key_messages", value)} placeholder="Core messages to repeat consistently" rows={2} /></Field>
            <Field label="Preferred angles"><TextArea value={draft?.strategy?.preferred_angles || ""} onChange={value => updatePath("strategy.preferred_angles", value)} placeholder="Angles that are especially useful for this brand" rows={2} /></Field>
            <Field label="Angles to avoid"><TextArea value={avoidAngles.join(", ")} onChange={value => updatePath("strategy.avoid_angles", value)} placeholder="Sensitive, off-brand, or overused angles" rows={2} /></Field>
            <Field label="Calls to action"><TextInput value={draft?.strategy?.calls_to_action || ""} onChange={value => updatePath("strategy.calls_to_action", value)} placeholder="Book a call, download, request demo..." /></Field>
          </div>
        </Panel>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1.2fr) minmax(280px,0.8fr)", gap:18, marginTop:18, alignItems:"start" }}>
        <Panel>
          <SectionHeader title="Programmes" description="Recurring content lanes that make the strategy operational." meta={`${activeProgrammes.length}/${programmes.length} active`} />
          {programmes.length ? (
            <ProgrammeEditor programmes={programmes} onChange={value => updatePath("strategy.programmes", value)} />
          ) : (
            <EmptyState title="Create programmes" description="Programmes define repeatable output lanes. Add one here or refresh strategy from onboarding." action={() => updatePath("strategy.programmes", [{ key:"programme_1", label:"Product Education", role:"Build understanding", cadence:"Weekly", desc:"Explain the offer, use cases, objections, and proof.", platforms:platforms.slice(0,2), active:true }])} actionLabel="Add first programme" />
          )}
        </Panel>

        <Panel>
          <SectionHeader title="Risk / Claims Guidance" description="Used by compliance checks and safer assistant rewrites." />
          <div style={{ display:"grid", gap:10 }}>
            <Field label="Compliance sensitivities">
              <TextArea value={draft?.strategy?.compliance_sensitivities || sensitivities.join(", ")} onChange={value => updatePath("strategy.compliance_sensitivities", value)} placeholder="Regulated topics, restricted claims, platform-sensitive themes..." rows={3} />
            </Field>
            <Field label="Claims to use carefully">
              <TextArea value={claims} onChange={value => updatePath("strategy.claims_to_use_carefully", value)} placeholder="ROI, guarantees, health, finance, before/after, sustainability..." rows={3} />
            </Field>
          </div>
        </Panel>
      </div>
    </div>
  );
}
