"use client";
import { useState, useEffect } from "react";
import { Check, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { FORMATS, FORMAT_MAP, ARCHETYPES } from "@/lib/constants";
import { supabase } from "@/lib/db";
import { DEFAULT_BRAND_PROFILE_ID } from "@/lib/brand";

const UNCLE_CARTER_PROFILE_ID = DEFAULT_BRAND_PROFILE_ID;

const DEFAULT_SETTINGS = {
  brand: {
    name:           "Uncle Carter",
    voice:          "Calm, warm, slightly mischievous. Never reactive. Never loud.",
    avoid:          "Hot takes, highlight reels, clichés, exclamation marks",
    locked_elements:["Because the score is never the whole story."],
    content_type:   "narrative",
    goal_primary:   "community",
    goal_secondary: "reach",
    language_primary:   "EN",
    languages_secondary:["FR","ES","PT"],
  },
  strategy: {
    weekly_cadence: 4,
    format_mix: {
      standard:             60,
      classics:             25,
      performance_special:  15,
      special_edition:       0,
    },
    sequence_rules: {
      no_consecutive_classics:            true,
      no_consecutive_performance_special: true,
      no_consecutive_same_format:         false,
    },
  },
  providers: {
    script: {
      provider: "anthropic",
      model:    "claude-haiku-4-5-20251001",
      status:   "configured",
    },
    voice: {
      provider:  "elevenlabs",
      voice_id:  "",
      model_id:  "eleven_multilingual_v2",
      stability: 0.5,
      similarity_boost: 0.75,
      status:    "needs_key",
    },
    visual: {
      provider: "stub",
      model:    "",
      status:   "not_configured",
    },
    assembly: {
      provider: "capcut_export",
      status:   "configured",
    },
  },
};

function Section({ title, children, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderRadius:10, border:"1px solid var(--border)", marginBottom:12, overflow:"hidden" }}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"14px 16px", background:"var(--bg2)", border:"none", cursor:"pointer",
      }}>
        <span style={{ fontSize:13, fontWeight:600, color:"var(--t1)" }}>{title}</span>
        {open ? <ChevronUp size={14} color="var(--t3)"/> : <ChevronDown size={14} color="var(--t3)"/>}
      </button>
      {open && <div style={{ padding:"16px" }}>{children}</div>}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>{label}</div>
      {hint && <div style={{ fontSize:11, color:"var(--t4)", marginBottom:6 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, multiline=false }) {
  const style = { width:"100%", padding:"8px 10px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical" };
  if (multiline) return <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={2} style={style}/>;
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={style}/>;
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} style={{ width:"100%", padding:"8px 10px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:13, outline:"none" }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ value, onChange, label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0" }}>
      <span style={{ fontSize:13, color:"var(--t2)" }}>{label}</span>
      <button onClick={()=>onChange(!value)} style={{
        width:40, height:22, borderRadius:11, border:"none", cursor:"pointer",
        background: value ? "var(--t1)" : "var(--t4)", position:"relative", transition:"background 0.2s", flexShrink:0,
      }}>
        <div style={{ position:"absolute", top:3, left:value?20:3, width:16, height:16, borderRadius:"50%", background:"white", transition:"left 0.2s" }}/>
      </button>
    </div>
  );
}

function ProviderSlot({ label, config, onChange }) {
  const statusColor = config.status==="configured" ? "#4A9B7F" : config.status==="needs_key" ? "#C49A3C" : "var(--t4)";
  const statusLabel = config.status==="configured" ? "Configured" : config.status==="needs_key" ? "Needs API key" : "Not configured";

  return (
    <div style={{ padding:"12px 14px", borderRadius:9, background:"var(--fill2)", border:"1px solid var(--border)", marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <span style={{ fontSize:12, fontWeight:600, color:"var(--t1)" }}>{label}</span>
        <span style={{ fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:99, background:`${statusColor}15`, color:statusColor, border:`1px solid ${statusColor}25` }}>{statusLabel}</span>
      </div>

      {label==="Script" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <Field label="Provider">
            <Select value={config.provider} onChange={v=>onChange({...config,provider:v})} options={[
              {value:"anthropic", label:"Anthropic (Claude)"},
              {value:"openai",    label:"OpenAI (GPT)"},
              {value:"stub",      label:"Stub (test)"},
            ]}/>
          </Field>
          <Field label="Model">
            <Select value={config.model} onChange={v=>onChange({...config,model:v})} options={
              config.provider==="anthropic" ? [
                {value:"claude-haiku-4-5-20251001",  label:"Claude Haiku (fast)"},
                {value:"claude-sonnet-4-6", label:"Claude Sonnet (balanced)"},
                {value:"claude-opus-4-6",   label:"Claude Opus (best)"},
              ] : config.provider==="openai" ? [
                {value:"gpt-4o-mini", label:"GPT-4o Mini"},
                {value:"gpt-4o",      label:"GPT-4o"},
              ] : [{value:"stub", label:"Stub"}]
            }/>
          </Field>
        </div>
      )}

      {label==="Voice" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <Field label="Provider">
              <Select value={config.provider} onChange={v=>onChange({...config,provider:v,status:v==="stub"?"configured":"needs_key"})} options={[
                {value:"elevenlabs", label:"ElevenLabs"},
                {value:"playht",     label:"PlayHT"},
                {value:"stub",       label:"Stub (test)"},
              ]}/>
            </Field>
            <Field label="Model">
              <Select value={config.model_id||""} onChange={v=>onChange({...config,model_id:v})} options={[
                {value:"eleven_multilingual_v2", label:"Multilingual v2"},
                {value:"eleven_monolingual_v1",  label:"English v1"},
                {value:"eleven_turbo_v2",        label:"Turbo v2 (fast)"},
              ]}/>
            </Field>
          </div>
          <Field label="Voice ID" hint="From your ElevenLabs dashboard">
            <Input value={config.voice_id||""} onChange={v=>onChange({...config,voice_id:v,status:v?"configured":"needs_key"})} placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"/>
          </Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <Field label={`Stability · ${config.stability??0.5}`}>
              <input type="range" min="0" max="1" step="0.05" value={config.stability??0.5} onChange={e=>onChange({...config,stability:parseFloat(e.target.value)})} style={{width:"100%"}}/>
            </Field>
            <Field label={`Similarity · ${config.similarity_boost??0.75}`}>
              <input type="range" min="0" max="1" step="0.05" value={config.similarity_boost??0.75} onChange={e=>onChange({...config,similarity_boost:parseFloat(e.target.value)})} style={{width:"100%"}}/>
            </Field>
          </div>
        </div>
      )}

      {label==="Visual" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <Field label="Provider">
            <Select value={config.provider} onChange={v=>onChange({...config,provider:v,status:v==="stub"?"configured":"needs_key"})} options={[
              {value:"replicate", label:"Replicate (SDXL/Flux)"},
              {value:"dalle",     label:"DALL-E 3 (OpenAI)"},
              {value:"stub",      label:"Stub (test)"},
            ]}/>
          </Field>
          <Field label="Model">
            <Select value={config.model||""} onChange={v=>onChange({...config,model:v})} options={
              config.provider==="replicate" ? [
                {value:"flux-schnell", label:"Flux Schnell (fast)"},
                {value:"sdxl",         label:"SDXL"},
                {value:"flux-dev",     label:"Flux Dev (quality)"},
              ] : config.provider==="dalle" ? [
                {value:"dall-e-3", label:"DALL-E 3"},
              ] : [{value:"stub", label:"Stub"}]
            }/>
          </Field>
        </div>
      )}

      {label==="Assembly" && (
        <Field label="Provider">
          <Select value={config.provider} onChange={v=>onChange({...config,provider:v})} options={[
            {value:"capcut_export", label:"CapCut (manual brief export)"},
            {value:"creatomate",    label:"Creatomate (API)"},
            {value:"remotion",      label:"Remotion (Phase 2)"},
            {value:"stub",          label:"Stub (test)"},
          ]}/>
        </Field>
      )}
    </div>
  );
}

export default function SettingsView({ stories, onSettingsChange, initialSettings }) {
  const [settings, setSettings] = useState(initialSettings || DEFAULT_SETTINGS);
  const [saved,    setSaved]    = useState(false);
  const [saving,   setSaving]   = useState(false);

  // Format mix — ensure percentages sum to 100
  const fmtTotal = Object.values(settings.strategy.format_mix).reduce((a,b)=>a+b,0);
  const fmtValid = fmtTotal === 100;

  const updateBrand    = (key, val) => setSettings(s=>({...s, brand:    {...s.brand,    [key]:val}}));
  const updateStrategy = (key, val) => setSettings(s=>({...s, strategy: {...s.strategy, [key]:val}}));
  const updateFmtMix   = (key, val) => setSettings(s=>({...s, strategy: {...s.strategy, format_mix: {...s.strategy.format_mix, [key]:parseInt(val)||0}}}));
  const updateSeqRule  = (key, val) => setSettings(s=>({...s, strategy: {...s.strategy, sequence_rules: {...s.strategy.sequence_rules, [key]:val}}}));
  const updateProvider = (slot, val) => setSettings(s=>({...s, providers: {...s.providers, [slot]:val}}));

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from("brand_profiles").upsert({
        id:           UNCLE_CARTER_PROFILE_ID,
        name:         settings.brand.name,
        identity_voice: settings.brand.voice,
        identity_avoid: settings.brand.avoid,
        goal_primary:   settings.brand.goal_primary,
        goal_secondary: settings.brand.goal_secondary,
        language_primary:    settings.brand.language_primary,
        languages_secondary: settings.brand.languages_secondary,
        brief_doc: settings,
        provider_config: settings.providers,
      });
      if (onSettingsChange) onSettingsChange(settings);
      setSaved(true);
      setTimeout(()=>setSaved(false), 2500);
    } catch(err) { console.error(err); }
    setSaving(false);
  };

  return (
    <div className="animate-fade-in">

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:600, color:"var(--t1)", letterSpacing:"-0.02em" }}>Settings</div>
          <div style={{ fontSize:12, color:"var(--t3)", marginTop:2 }}>Brand profile, content strategy, and provider configuration</div>
        </div>
        <button onClick={save} disabled={saving||!fmtValid} style={{
          padding:"8px 20px", borderRadius:8, fontSize:13, fontWeight:600,
          background: saved?"#4A9B7F":saving||!fmtValid?"var(--fill2)":"var(--t1)",
          color: saved||(!saving&&fmtValid)?"var(--bg)":"var(--t3)",
          border:"none", cursor: saving||!fmtValid?"not-allowed":"pointer",
          display:"flex", alignItems:"center", gap:6,
        }}>
          {saved ? <><Check size={13}/>Saved</> : saving ? "Saving..." : "Save settings"}
        </button>
      </div>

      {/* ── 1. Brand Profile ── */}
      <Section title="Brand Profile">
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Brand name">
            <Input value={settings.brand.name} onChange={v=>updateBrand("name",v)} placeholder="Uncle Carter"/>
          </Field>
          <Field label="Content type">
            <Select value={settings.brand.content_type} onChange={v=>updateBrand("content_type",v)} options={[
              {value:"narrative",    label:"Narrative storytelling"},
              {value:"advertising",  label:"Advertising"},
              {value:"educational",  label:"Educational"},
              {value:"product",      label:"Product"},
              {value:"custom",       label:"Custom"},
            ]}/>
          </Field>
        </div>
        <Field label="Voice descriptors" hint="How the brand sounds — tone, personality, energy">
          <Input value={settings.brand.voice} onChange={v=>updateBrand("voice",v)} multiline placeholder="Calm, warm, slightly mischievous..."/>
        </Field>
        <Field label="Avoid" hint="Topics, tones, and approaches explicitly excluded">
          <Input value={settings.brand.avoid} onChange={v=>updateBrand("avoid",v)} multiline placeholder="Hot takes, clickbait, exclamation marks..."/>
        </Field>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Primary goal">
            <Select value={settings.brand.goal_primary} onChange={v=>updateBrand("goal_primary",v)} options={[
              {value:"community",  label:"Community (loyalty)"},
              {value:"reach",      label:"Reach (discovery)"},
              {value:"conversion", label:"Conversion"},
              {value:"awareness",  label:"Awareness"},
            ]}/>
          </Field>
          <Field label="Secondary goal">
            <Select value={settings.brand.goal_secondary} onChange={v=>updateBrand("goal_secondary",v)} options={[
              {value:"reach",      label:"Reach (discovery)"},
              {value:"community",  label:"Community (loyalty)"},
              {value:"conversion", label:"Conversion"},
              {value:"awareness",  label:"Awareness"},
            ]}/>
          </Field>
        </div>
        <Field label="Primary language">
          <Select value={settings.brand.language_primary} onChange={v=>updateBrand("language_primary",v)} options={[
            {value:"EN",label:"English"},{value:"FR",label:"French"},
            {value:"ES",label:"Spanish"},{value:"PT",label:"Portuguese"},
            {value:"DE",label:"German"},{value:"IT",label:"Italian"},
          ]}/>
        </Field>
      </Section>

      {/* ── 2. Content Strategy ── */}
      <Section title="Content Strategy">
        <Field label="Weekly cadence" hint="Target number of episodes per week">
          <div style={{ display:"flex", gap:6 }}>
            {[1,2,3,4,5,6,7].map(n=>(
              <button key={n} onClick={()=>updateStrategy("weekly_cadence",n)} style={{
                width:36, height:36, borderRadius:7, fontSize:13, fontWeight:600,
                background: settings.strategy.weekly_cadence===n?"var(--t1)":"var(--fill2)",
                color:      settings.strategy.weekly_cadence===n?"var(--bg)":"var(--t3)",
                border:"1px solid var(--border)", cursor:"pointer",
              }}>{n}</button>
            ))}
          </div>
        </Field>

        <Field label="Format mix" hint={`Percentages must total 100 — currently ${fmtTotal}%`}>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {FORMATS.map(f => {
              const val = settings.strategy.format_mix[f.key]||0;
              const max = Math.max(...Object.values(settings.strategy.format_mix))||1;
              return (
                <div key={f.key}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ width:10, height:10, borderRadius:2, background:f.color, display:"inline-block" }}/>
                      <span style={{ fontSize:12, color:"var(--t2)" }}>{f.label}</span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <input type="range" min="0" max="100" step="5" value={val}
                        onChange={e=>updateFmtMix(f.key,e.target.value)}
                        style={{ width:120 }}/>
                      <span style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Mono',monospace", color:f.color, width:36, textAlign:"right" }}>{val}%</span>
                    </div>
                  </div>
                  <div style={{ height:3, borderRadius:2, background:"var(--bg3)", overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${val}%`, background:f.color, borderRadius:2, transition:"width 0.2s" }}/>
                  </div>
                </div>
              );
            })}
            {!fmtValid && (
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#C0666A" }}>
                <AlertCircle size={12}/> Percentages must total 100% (currently {fmtTotal}%)
              </div>
            )}
          </div>
        </Field>

        <Field label="Sequence rules" hint="Prevents repetitive scheduling patterns">
          <div style={{ padding:"4px 0" }}>
            <Toggle value={settings.strategy.sequence_rules.no_consecutive_classics} onChange={v=>updateSeqRule("no_consecutive_classics",v)} label="No two Classics back to back"/>
            <Toggle value={settings.strategy.sequence_rules.no_consecutive_performance_special} onChange={v=>updateSeqRule("no_consecutive_performance_special",v)} label="No two Performance Specials back to back"/>
            <Toggle value={settings.strategy.sequence_rules.no_consecutive_same_format} onChange={v=>updateSeqRule("no_consecutive_same_format",v)} label="No two of the same format back to back (any)"/>
          </div>
        </Field>
      </Section>

      {/* ── 3. Providers ── */}
      <Section title="Providers">
        <div style={{ fontSize:12, color:"var(--t3)", marginBottom:14 }}>
          API keys are stored in environment variables — never in the database. Configure them in your Vercel project settings.
        </div>
        {[
          {slot:"script",   label:"Script"},
          {slot:"voice",    label:"Voice"},
          {slot:"visual",   label:"Visual"},
          {slot:"assembly", label:"Assembly"},
        ].map(({slot,label})=>(
          <ProviderSlot key={slot} label={label} config={settings.providers[slot]||{}} onChange={v=>updateProvider(slot,v)}/>
        ))}
      </Section>

      {/* ── 4. Intelligence (read-only) ── */}
      <Section title="Intelligence Layer" defaultOpen={false}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:10 }}>
          {[
            {label:"Published",    value:stories.filter(s=>s.status==="published").length, threshold:null},
            {label:"Until Stage 2",value:Math.max(0,50-stories.filter(s=>s.status==="published").length), threshold:50},
            {label:"Until Stage 3",value:Math.max(0,100-stories.filter(s=>s.status==="published").length), threshold:100},
            {label:"Until Stage 4",value:Math.max(0,200-stories.filter(s=>s.status==="published").length), threshold:200},
          ].map(m=>(
            <div key={m.label} style={{ padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)" }}>
              <div style={{ fontSize:10, color:"var(--t3)", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>{m.label}</div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"var(--t1)" }}>{m.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:12, fontSize:12, color:"var(--t3)" }}>
          Score weights, voice patterns, and visual intelligence activate automatically as published content accumulates. No manual configuration needed.
        </div>
      </Section>
    </div>
  );
}
