"use client";
import { useState, useEffect, useRef } from "react";
import { X, Check, AlertCircle, ChevronRight, Plus, Trash2, GripVertical, Zap, RefreshCw, ArrowRight } from "lucide-react";
import { FORMATS, FORMAT_MAP, ARCHETYPES } from "@/lib/constants";
import { supabase, callClaude } from "@/lib/db";
import { uploadAsset, listAssets, deleteAsset, updateAssetSummary, extractTextFromFile, ASSET_TYPES } from "@/lib/assets";

const UNCLE_CARTER_PROFILE_ID = "00000000-0000-0000-0000-000000000001";

const DEFAULT_SETTINGS = {
  brand: {
    name: "Uncle Carter",
    voice: "Calm, warm, slightly mischievous. Never reactive. Never loud.",
    avoid: "Hot takes, highlight reels, clichés, exclamation marks",
    content_type: "narrative",
    goal_primary: "community",
    goal_secondary: "reach",
    language_primary: "EN",
    languages_secondary: ["FR","ES","PT"],
  },
  strategy: {
    weekly_cadence: 4,
    format_mix: { standard:60, classics:25, performance_special:15, special_edition:0 },
    sequence_rules: {
      no_consecutive_classics: true,
      no_consecutive_performance_special: true,
      no_consecutive_same_format: false,
    },
    rules: [],
    programmes: [
      { id:"standard",           name:"Standard",            color:"#C49A3C", role:"reach",     weight:60, angle_suggestions:["redemption","rivalry","legacy","pressure"], custom_fields:[] },
      { id:"classics",           name:"Classics",            color:"#4A9B7F", role:"community", weight:25, angle_suggestions:["sacrifice","legacy","brotherhood","loyalty"], custom_fields:[] },
      { id:"performance_special",name:"Performance Special", color:"#C0666A", role:"balanced",  weight:15, angle_suggestions:["shock","resilience","triumph"], custom_fields:[] },
      { id:"special_edition",    name:"Special Edition",     color:"#8B7EC8", role:"special",   weight:0,  angle_suggestions:[], custom_fields:[] },
    ],
  },
  providers: {
    script:   { provider:"anthropic", model:"claude-haiku-4-5-20251001", status:"configured" },
    voice:    { provider:"elevenlabs", voice_id:"", model_id:"eleven_multilingual_v2", stability:0.5, similarity_boost:0.75, status:"needs_key" },
    visual:   { provider:"stub", model:"", status:"not_configured" },
    assembly: { provider:"capcut_export", status:"configured" },
  },
};

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

// ── Rule builder ──
function RuleBuilder({ rule, onChange, onDelete, index, conflicts, totalRules }) {
  const hasConflict = conflicts.some(c => c.i===index || c.j===index);

  return (
    <div style={{ borderRadius:9, border:`1px solid ${hasConflict?"#C0666A":"var(--border)"}`, background:"var(--card)", marginBottom:8, overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderBottom:"1px solid var(--border2)" }}>
        <GripVertical size={14} color="var(--t4)" style={{ cursor:"grab", flexShrink:0 }}/>
        <span style={{ fontSize:10, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"var(--t4)", width:18 }}>{index+1}</span>
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

// ── Section nav ──
const SECTIONS = [
  { key:"brand",       label:"Brand Profile" },
  { key:"strategy",    label:"Content Strategy" },
  { key:"programmes",  label:"Programmes" },
  { key:"rules",       label:"Programming Rules" },
  { key:"providers",   label:"Providers" },
  { key:"intelligence",label:"Intelligence" },
];

const ROLES = [
  { key:"reach",     label:"Reach-leaning",    color:"#5B8FB9" },
  { key:"community", label:"Community-leaning", color:"#4A9B7F" },
  { key:"balanced",  label:"Balanced",          color:"#C49A3C" },
  { key:"special",   label:"Special",           color:"#8B7EC8" },
];

const PRESET_COLORS = ["#C49A3C","#4A9B7F","#C0666A","#8B7EC8","#5B8FB9","#B87333","#7B9E6B","#9B7B6E"];

export default function SettingsModal({ isOpen, onClose, stories=[], onSettingsChange, initialSettings }) {
  const [section,  setSection]  = useState("brand");
  const [settings, setSettings] = useState(initialSettings||DEFAULT_SETTINGS);
  const [saved,    setSaved]    = useState(false);
  const [saving,   setSaving]   = useState(false);

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

  useEffect(() => { if (initialSettings) setSettings(initialSettings); }, [initialSettings]);

  // Keyboard close
  useEffect(() => {
    const h = (e) => { if (e.key==="Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!isOpen) return null;

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

  const fmtTotal = Object.values(settings.strategy?.format_mix||{}).reduce((a,b)=>a+b,0);

  const programmes = settings.strategy?.programmes || [];

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

    const prompt = `You are auditing the content strategy for "${settings.brand.name}".

Brand goal: ${settings.brand.goal_primary} (secondary: ${settings.brand.goal_secondary})
Weekly cadence: ${settings.strategy?.weekly_cadence} episodes/week
Current programme mix: ${programmes.map(p=>`${p.name} ${p.weight}%`).join(", ")}
Performance by programme: ${perfSummary||"No data yet"}
${stratContext ? `User context: "${stratContext}"` : ""}

Audit the strategy. Cover:
1. Mix alignment with goals
2. Cadence sustainability
3. Programme balance gaps
4. Specific recommendations with numbers

Be direct. Use • bullets. Max 6 points.`;

    try {
      const text = await callClaude(prompt, 600, "haiku");
      setStratAudit(text);
    } catch(e) { setStratAudit("Audit failed."); }
    setStratRunning(false);
  };

  const suggestProgrammes = async () => {
    setProgRunning(true);
    const prompt = `You are suggesting content programmes for "${settings.brand.name}", a ${settings.brand.content_type} brand.

Goal: ${settings.brand.goal_primary}
Current programmes: ${programmes.map(p=>p.name).join(", ")||"None"}
Voice: ${settings.brand.voice}
Avoid: ${settings.brand.avoid}

Suggest 2-3 additional programmes that would complement the existing ones.
Return JSON array: [{ name, role ("reach"|"community"|"balanced"|"special"), weight (0-100 integer), color (hex), angle_suggestions: [array of 3-4 content angle strings], rationale }]
JSON only.`;

    try {
      const text = await callClaude(prompt, 600, "haiku");
      const clean = text.replace(/\`\`\`json\s*/g,"").replace(/\`\`\`\s*/g,"").trim();
      let parsed = null;
      try { parsed = JSON.parse(clean); } catch {}
      if (!parsed) { const m=clean.match(/\[\s*\{[\s\S]*\}\s*\]/); if(m) try{parsed=JSON.parse(m[0]);}catch{} }
      if (parsed) setProgAudit(parsed);
    } catch(e) { console.error(e); }
    setProgRunning(false);
  };

  const addProgramme = (preset) => {
    const newProg = preset || { id:crypto.randomUUID(), name:"New Programme", color:"#888", role:"balanced", weight:0, angle_suggestions:[], custom_fields:[] };
    upd("strategy.programmes", [...programmes, newProg]);
  };

  const updProg = (i, val) => {
    upd("strategy.programmes", programmes.map((p,idx)=>idx===i?val:p));
  };

  const delProg = (i) => {
    upd("strategy.programmes", programmes.filter((_,idx)=>idx!==i));
  };

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from("brand_profiles").upsert({
        id: UNCLE_CARTER_PROFILE_ID,
        name: settings.brand.name,
        identity_voice: settings.brand.voice,
        identity_avoid: settings.brand.avoid,
        goal_primary: settings.brand.goal_primary,
        goal_secondary: settings.brand.goal_secondary,
        language_primary: settings.brand.language_primary,
        languages_secondary: settings.brand.languages_secondary,
        brief_doc: settings,
        provider_config: settings.providers,
      });
      if (onSettingsChange) onSettingsChange(settings);
      setSaved(true);
      setTimeout(()=>setSaved(false), 2000);
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  // AI rule suggestions
  const suggestRules = async () => {
    setSuggestRunning(true);
    const published = stories.filter(s=>s.status==="published"&&s.metrics_completion);
    const prompt = `You are an AI content strategy advisor for "${settings.brand.name}", a ${settings.brand.content_type} brand.

Goal: ${settings.brand.goal_primary} (secondary: ${settings.brand.goal_secondary})
Weekly cadence: ${settings.strategy?.weekly_cadence} episodes
Format mix: ${JSON.stringify(settings.strategy?.format_mix)}
Published stories with data: ${published.length}
${published.length>0?`Top performers: ${published.sort((a,b)=>b.metrics_completion-a.metrics_completion).slice(0,3).map(s=>`${s.title} (${s.format}, ${s.archetype}, ${s.metrics_completion}% completion)`).join("; ")}`:"No performance data yet"}

Suggest 3-5 smart scheduling rules for this brand. Be specific and actionable.
Return JSON array: [{ type: "format_day"|"format_freq"|"score_priority"|"format_seq"|"archetype_seq"|"day_restrict", label: "short label", reasoning: "why this rule helps", config: { ...rule fields } }]
JSON only. No markdown.`;

    try {
      const text = await callClaude(prompt, 800, "haiku");
      const clean = text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
      let parsed = null;
      try { parsed = JSON.parse(clean); } catch {}
      if (!parsed) { const m=clean.match(/\[\s*\{[\s\S]*\}\s*\]/); if(m) try{parsed=JSON.parse(m[0]);}catch{} }
      setSuggestions(parsed||[]);
    } catch(e) { console.error(e); }
    setSuggestRunning(false);
  };

  // AI strategy audit
  const runAudit = async () => {
    setAuditRunning(true);
    const prompt = `You are auditing the content strategy for "${settings.brand.name}".

Current rules:
${rules.length ? rules.map((r,i)=>`${i+1}. ${ruleDescription(r)} (${r.active!==false?"active":"inactive"})`).join("\n") : "No rules configured"}

Detected conflicts: ${conflicts.length ? conflicts.map(c=>c.reason).join("; ") : "None"}

Goal: ${settings.brand.goal_primary}
Format mix: ${JSON.stringify(settings.strategy?.format_mix)}
${aiAuditText ? `Additional context from user: "${aiAuditText}"` : ""}

Provide a brief audit (3-5 bullet points). Identify: gaps, conflicts, improvements, alignment with goal.
Be direct and specific. Plain text, use • for bullets.`;

    try {
      const text = await callClaude(prompt, 600, "haiku");
      setAuditResult(text);
    } catch(e) { setAuditResult("Audit failed — try again."); }
    setAuditRunning(false);
  };

  // AI conflict resolution
  const resolveConflicts = async () => {
    setResolving(true);
    const prompt = `You are resolving conflicts in a content scheduling ruleset for "${settings.brand.name}".

Current rules (in priority order):
${rules.map((r,i)=>`${i+1}. ${ruleDescription(r)}`).join("\n")}

Conflicts detected:
${conflicts.map(c=>`- ${c.reason}`).join("\n")}

${resolveText ? `User preference: "${resolveText}"` : ""}

Reorder and/or adjust these rules to resolve conflicts while respecting the user's preference.
Return JSON: { 
  "new_order": [array of original 0-based indices in new order],
  "changes": ["brief description of each change made"],
  "explanation": "1-2 sentence summary"
}
JSON only.`;

    try {
      const text = await callClaude(prompt, 600, "haiku");
      const clean = text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
      let parsed = null;
      try { parsed = JSON.parse(clean); } catch {}
      if (!parsed) { const m=clean.match(/\{[\s\S]*\}/); if(m) try{parsed=JSON.parse(m[0]);}catch{} }
      if (parsed?.new_order) {
        const reordered = parsed.new_order.map(i=>rules[i]).filter(Boolean);
        upd("strategy.rules", reordered);
        setAuditResult(`✓ Resolved: ${parsed.explanation}\n\nChanges:\n${(parsed.changes||[]).map(c=>`• ${c}`).join("\n")}`);
      }
    } catch(e) { console.error(e); }
    setResolving(false);
  };

  // Onboarding state
  const [obStep,      setObStep]      = useState(null); // null=off, "chat"=active
  const [obMessages,  setObMessages]  = useState([]);
  const [obInput,     setObInput]     = useState("");
  const [obLoading,   setObLoading]   = useState(false);
  const [obDraft,     setObDraft]     = useState(null); // extracted brand fields

  // Asset library state
  const [assets,      setAssets]      = useState([]);
  const [assetsLoading,setAssetsLoading]=useState(false);
  const [uploadingAsset,setUploadingAsset]=useState(false);
  const [assetError,  setAssetError]  = useState(null);
  const [dragOver,    setDragOver]    = useState(false);

  const BRAND_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
  const WORKSPACE_ID     = "00000000-0000-0000-0000-000000000001";

  // Load assets when brand section opens
  useEffect(() => {
    if (section === "brand") {
      setAssetsLoading(true);
      listAssets(BRAND_PROFILE_ID)
        .then(data => setAssets(data))
        .catch(() => setAssets([]))
        .finally(() => setAssetsLoading(false));
    }
  }, [section]);

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

    const history = newMessages.map(m => `${m.role==="user"?"User":"Assistant"}: ${m.text}`).join("

");
    const currentBrand = JSON.stringify(settings.brand, null, 2);

    const prompt = `You are an onboarding assistant helping set up a brand profile for an AI content production tool.

Current brand settings:
${currentBrand}

Conversation so far:
${history}

Your job:
1. Ask short, focused questions to fill in missing brand info (voice, avoid, goals, audience, locked elements like a closing line)
2. If a document was shared, extract what you can and only ask about genuine gaps
3. When you have enough info, output a JSON block with extracted fields
4. Be conversational and fast — don't ask more than 2 questions at once

If you have enough info to extract brand fields, end your response with:
<brand_extract>
{
  "name": "...",
  "voice": "...",
  "avoid": "...",
  "goal_primary": "community|reach|conversion|awareness",
  "goal_secondary": "community|reach|conversion|awareness",
  "content_type": "narrative|advertising|educational|product|custom",
  "locked_elements": ["..."]
}
</brand_extract>

Otherwise just respond conversationally. Keep it short.`;

    try {
      const response = await callClaude(prompt, 800, "haiku");

      // Check for extracted brand fields
      const extractMatch = response.match(/<brand_extract>([\s\S]*?)<\/brand_extract>/);
      let cleanResponse = response.replace(/<brand_extract>[\s\S]*?<\/brand_extract>/, "").trim();

      if (extractMatch) {
        try {
          const extracted = JSON.parse(extractMatch[1].trim());
          setObDraft(extracted);
          cleanResponse = cleanResponse || "Here's what I've extracted from our conversation. Review and confirm to apply to your brand profile.";
        } catch {}
      }

      setObMessages(prev => [...prev, { role:"assistant", text: cleanResponse }]);
    } catch(e) { setObMessages(prev => [...prev, { role:"assistant", text:"Something went wrong — try again." }]); }
    setObLoading(false);
  };

  const applyObDraft = () => {
    if (!obDraft) return;
    Object.entries(obDraft).forEach(([k,v]) => {
      if (k === "locked_elements") upd("brand.locked_elements", v);
      else if (k in settings.brand) upd(`brand.${k}`, v);
    });
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
        const summaryPrompt = `Summarize this brand document in 2-3 sentences, focusing on what's useful for content generation (voice, restrictions, audience, key messages).

Document excerpt:
${fileText.slice(0, 2000)}

Summary only. No preamble.`;
        try {
          const summary = await callClaude(summaryPrompt, 200, "haiku");
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

  const inputStyle = { width:"100%", padding:"8px 10px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:13, outline:"none", fontFamily:"inherit" };
  const selStyle = { ...inputStyle };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(8px)", padding:24 }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:820, height:"85vh", display:"flex", borderRadius:14, overflow:"hidden", background:"var(--sheet)", boxShadow:"0 32px 80px rgba(0,0,0,0.3)" }}>

        {/* ── Left nav ── */}
        <div style={{ width:200, borderRight:"1px solid var(--border2)", padding:"20px 0", flexShrink:0, display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"0 16px 16px", borderBottom:"1px solid var(--border2)", marginBottom:8 }}>
            <div style={{ fontSize:13, fontWeight:600, color:"var(--t1)" }}>Settings</div>
            <div style={{ fontSize:11, color:"var(--t3)", marginTop:1 }}>{settings.brand.name}</div>
          </div>
          {SECTIONS.map(s=>(
            <button key={s.key} onClick={()=>setSection(s.key)} style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"9px 16px", fontSize:13, fontWeight:section===s.key?500:400,
              background:section===s.key?"var(--fill2)":"transparent",
              color:section===s.key?"var(--t1)":"var(--t3)",
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
            <button onClick={save} disabled={saving} style={{
              width:"100%", padding:"8px", borderRadius:8, fontSize:12, fontWeight:600,
              background:saved?"#4A9B7F":saving?"var(--fill2)":"var(--t1)",
              color:saved||(!saving)?"var(--bg)":"var(--t3)",
              border:"none", cursor:saving?"not-allowed":"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:5,
            }}>
              {saved?<><Check size={12}/>Saved</>:saving?"Saving...":"Save"}
            </button>
          </div>
        </div>

        {/* ── Right content ── */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div style={{ fontSize:16, fontWeight:600, color:"var(--t1)", letterSpacing:"-0.01em" }}>{SECTIONS.find(s=>s.key===section)?.label}</div>
            <button onClick={onClose} style={{ width:28, height:28, borderRadius:7, border:"1px solid var(--border)", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <X size={13} color="var(--t3)"/>
            </button>
          </div>

          {/* ── Brand ── */}
          {section==="brand" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Brand name</div>
                  <input value={settings.brand.name} onChange={e=>upd("brand.name",e.target.value)} style={inputStyle} placeholder="Uncle Carter"/>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Content type</div>
                  <select value={settings.brand.content_type} onChange={e=>upd("brand.content_type",e.target.value)} style={selStyle}>
                    {["narrative","advertising","educational","product","custom"].map(v=><option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Voice</div>
                <textarea value={settings.brand.voice} onChange={e=>upd("brand.voice",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="Calm, warm, slightly mischievous..."/>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Avoid</div>
                <textarea value={settings.brand.avoid} onChange={e=>upd("brand.avoid",e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" }} placeholder="Hot takes, clichés..."/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {["goal_primary","goal_secondary"].map(k=>(
                  <div key={k}>
                    <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>{k==="goal_primary"?"Primary goal":"Secondary goal"}</div>
                    <select value={settings.brand[k]} onChange={e=>upd(`brand.${k}`,e.target.value)} style={selStyle}>
                      {["community","reach","conversion","awareness"].map(v=><option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Strategy ── */}
          {section==="strategy" && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Weekly cadence</div>
                <div style={{ display:"flex", gap:5 }}>
                  {[1,2,3,4,5,6,7].map(n=>(
                    <button key={n} onClick={()=>upd("strategy.weekly_cadence",n)} style={{ width:36, height:36, borderRadius:7, fontSize:13, fontWeight:600, background:settings.strategy?.weekly_cadence===n?"var(--t1)":"var(--fill2)", color:settings.strategy?.weekly_cadence===n?"var(--bg)":"var(--t3)", border:"1px solid var(--border)", cursor:"pointer" }}>{n}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Format mix</div>
                  <span style={{ fontSize:11, fontFamily:"'DM Mono',monospace", color:fmtTotal===100?"#4A9B7F":"#C0666A", fontWeight:600 }}>{fmtTotal}%</span>
                </div>
                {FORMATS.map(f=>{
                  const val = settings.strategy?.format_mix?.[f.key]||0;
                  return (
                    <div key={f.key} style={{ marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ width:8, height:8, borderRadius:2, background:f.color, display:"inline-block" }}/>
                          <span style={{ fontSize:12, color:"var(--t2)" }}>{f.label}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <input type="range" min="0" max="100" step="5" value={val} onChange={e=>upd(`strategy.format_mix.${f.key}`,parseInt(e.target.value))} style={{ width:100 }}/>
                          <span style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Mono',monospace", color:f.color, width:32, textAlign:"right" }}>{val}%</span>
                        </div>
                      </div>
                      <div style={{ height:3, borderRadius:2, background:"var(--bg3)" }}>
                        <div style={{ height:"100%", width:`${val}%`, background:f.color, borderRadius:2, transition:"width 0.2s" }}/>
                      </div>
                    </div>
                  );
                })}
                {fmtTotal!==100 && <div style={{ fontSize:11, color:"#C0666A", display:"flex", alignItems:"center", gap:5 }}><AlertCircle size={11}/>Must total 100%</div>}
              </div>
            </div>
          )}

          {/* ── Programmes ── */}
          {section==="programmes" && (
            <div>
              <div style={{ fontSize:12, color:"var(--t3)", marginBottom:14, lineHeight:1.6 }}>
                Programmes define your content formats — name, role, cadence weight, and angle suggestions. The auto-fill and intelligence layer use these to plan and score content.
              </div>

              {/* AI tools */}
              <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                <button onClick={()=>addProgramme()} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer" }}>
                  <Plus size={12}/> New programme
                </button>
                <button onClick={suggestProgrammes} disabled={progRunning} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                  <Zap size={12} color="#C49A3C"/> {progRunning?"Thinking...":"AI suggest programmes"}
                </button>
                <button onClick={runStratAudit} disabled={stratRunning} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                  <RefreshCw size={12}/> {stratRunning?"Auditing...":"Strategy audit"}
                </button>
              </div>

              {/* AI suggested programmes */}
              {progAudit && Array.isArray(progAudit) && progAudit.length>0 && (
                <div style={{ padding:"12px 14px", borderRadius:9, background:"rgba(196,154,60,0.06)", border:"1px solid rgba(196,154,60,0.2)", marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#C49A3C", marginBottom:10 }}>⚡ AI suggested programmes</div>
                  {progAudit.map((p,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, padding:"8px 10px", borderRadius:7, background:"var(--fill2)", borderLeft:`3px solid ${p.color||"var(--border)"}` }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:"var(--t1)" }}>{p.name} <span style={{ fontSize:10, color:"var(--t3)", fontWeight:400 }}>· {p.role} · {p.weight}%</span></div>
                        <div style={{ fontSize:11, color:"var(--t3)", marginTop:2 }}>{p.rationale}</div>
                      </div>
                      <button onClick={()=>{ addProgramme({id:crypto.randomUUID(),...p,angle_suggestions:p.angle_suggestions||[],custom_fields:[]}); setProgAudit(a=>a.filter((_,j)=>j!==i)); }} style={{ padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:600, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer", flexShrink:0 }}>
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Strategy audit result */}
              {stratAudit && (
                <div style={{ padding:"12px 14px", borderRadius:9, background:"var(--fill2)", border:"1px solid var(--border)", marginBottom:16, fontSize:12, color:"var(--t2)", lineHeight:1.7, whiteSpace:"pre-wrap" }}>
                  {stratAudit}
                  <div style={{ marginTop:10 }}>
                    <textarea value={stratContext} onChange={e=>setStratContext(e.target.value)} placeholder="Add context for follow-up..." rows={2} style={{ width:"100%", padding:"7px 10px", borderRadius:7, background:"var(--bg2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none", resize:"none", fontFamily:"inherit" }}/>
                    <button onClick={runStratAudit} disabled={stratRunning} style={{ marginTop:6, padding:"5px 12px", borderRadius:6, fontSize:11, fontWeight:500, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                      Re-audit with context
                    </button>
                  </div>
                </div>
              )}

              {/* Programme platform intelligence note */}
              <div style={{ padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--t4)", flexShrink:0 }}/>
                <div style={{ fontSize:11, color:"var(--t4)" }}>Platform benchmark suggestions unlock when 5+ clients + 50 videos per client in your vertical are active on Creative Engine.</div>
              </div>

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
                    <button onClick={()=>delProg(i)} style={{ width:24, height:24, borderRadius:5, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <Trash2 size={12} color="var(--t4)"/>
                    </button>
                  </div>

                  {/* Body */}
                  <div style={{ padding:"12px 14px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    {/* Weight */}
                    <div>
                      <div style={{ fontSize:10, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Cadence weight · {prog.weight||0}%</div>
                      <input type="range" min="0" max="100" step="5" value={prog.weight||0} onChange={e=>updProg(i,{...prog,weight:parseInt(e.target.value)})} style={{ width:"100%" }}/>
                    </div>

                    {/* Angle suggestions */}
                    <div>
                      <div style={{ fontSize:10, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Content angle suggestions</div>
                      <input value={(prog.angle_suggestions||[]).join(", ")} onChange={e=>updProg(i,{...prog,angle_suggestions:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}
                        style={{ width:"100%", padding:"6px 8px", borderRadius:6, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:12, outline:"none" }}
                        placeholder="redemption, rivalry, legacy..."/>
                    </div>

                    {/* Custom fields */}
                    <div style={{ gridColumn:"1/-1" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <div style={{ fontSize:10, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Custom fields</div>
                        <button onClick={()=>updProg(i,{...prog,custom_fields:[...(prog.custom_fields||[]),{key:"",value:""}]})} style={{ fontSize:10, color:"var(--t3)", background:"transparent", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:3 }}>
                          <Plus size={10}/> Add field
                        </button>
                      </div>
                      {(prog.custom_fields||[]).length===0 && <div style={{ fontSize:11, color:"var(--t4)" }}>No custom fields — add any metadata specific to this programme.</div>}
                      {(prog.custom_fields||[]).map((cf,fi)=>(
                        <div key={fi} style={{ display:"flex", gap:6, marginBottom:4, alignItems:"center" }}>
                          <input value={cf.key} onChange={e=>{ const cfs=[...(prog.custom_fields||[])]; cfs[fi]={...cf,key:e.target.value}; updProg(i,{...prog,custom_fields:cfs}); }} placeholder="Field name" style={{ flex:1, padding:"5px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:11, outline:"none" }}/>
                          <input value={cf.value} onChange={e=>{ const cfs=[...(prog.custom_fields||[])]; cfs[fi]={...cf,value:e.target.value}; updProg(i,{...prog,custom_fields:cfs}); }} placeholder="Default value" style={{ flex:1, padding:"5px 8px", borderRadius:5, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:11, outline:"none" }}/>
                          <button onClick={()=>{ const cfs=(prog.custom_fields||[]).filter((_,j)=>j!==fi); updProg(i,{...prog,custom_fields:cfs}); }} style={{ width:20, height:20, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <X size={11} color="var(--t4)"/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {/* Total weight */}
              {programmes.length>0 && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)", marginTop:4 }}>
                  <span style={{ fontSize:12, color:"var(--t3)" }}>Total weight</span>
                  <span style={{ fontSize:13, fontWeight:700, fontFamily:"'DM Mono',monospace", color:programmes.reduce((a,p)=>a+(p.weight||0),0)===100?"#4A9B7F":"#C0666A" }}>
                    {programmes.reduce((a,p)=>a+(p.weight||0),0)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Rules ── */}
          {section==="rules" && (
            <div>
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

              {/* AI suggestions */}
              <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                <button onClick={addRule} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer" }}>
                  <Plus size={12}/> Add rule
                </button>
                <button onClick={suggestRules} disabled={suggestRunning} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                  <Zap size={12} color="#C49A3C"/> {suggestRunning?"Thinking...":"AI suggest rules"}
                </button>
                <button onClick={runAudit} disabled={auditRunning} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                  <RefreshCw size={12}/> {auditRunning?"Auditing...":"Strategy audit"}
                </button>
              </div>

              {/* AI suggestions list */}
              {suggestions.length>0 && (
                <div style={{ padding:"12px 14px", borderRadius:9, background:"rgba(196,154,60,0.06)", border:"1px solid rgba(196,154,60,0.2)", marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#C49A3C", marginBottom:8 }}>⚡ AI suggested rules</div>
                  {suggestions.map((s,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:500, color:"var(--t1)" }}>{s.label}</div>
                        <div style={{ fontSize:11, color:"var(--t3)" }}>{s.reasoning}</div>
                      </div>
                      <button onClick={()=>{ upd("strategy.rules",[...rules,{id:crypto.randomUUID(),active:true,...(s.config||{}),type:s.type}]); setSuggestions(sugg=>sugg.filter((_,j)=>j!==i)); }} style={{ padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:600, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer", flexShrink:0 }}>
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Audit result */}
              {auditResult && (
                <div style={{ padding:"12px 14px", borderRadius:9, background:"var(--fill2)", border:"1px solid var(--border)", marginBottom:16, fontSize:12, color:"var(--t2)", lineHeight:1.6, whiteSpace:"pre-wrap" }}>
                  {auditResult}
                  <div style={{ marginTop:8 }}>
                    <textarea value={aiAuditText} onChange={e=>setAiAuditText(e.target.value)} placeholder="Add context for a follow-up audit..." rows={2} style={{ ...inputStyle, fontSize:12, resize:"none" }}/>
                    <button onClick={runAudit} disabled={auditRunning} style={{ marginTop:6, padding:"5px 12px", borderRadius:6, fontSize:11, fontWeight:500, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                      Re-audit with context
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
            </div>
          )}

          {/* ── Providers ── */}
          {section==="providers" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ fontSize:12, color:"var(--t3)", padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)" }}>
                API keys are set as environment variables in Vercel — never stored in the database.
              </div>
              {[
                { slot:"script",   label:"Script provider",   providers:[{v:"anthropic",l:"Anthropic (Claude)"},{v:"openai",l:"OpenAI (GPT)"},{v:"stub",l:"Stub (test)"}],
                  models:{ anthropic:[{v:"claude-haiku-4-5-20251001",l:"Claude Haiku"},{v:"claude-sonnet-4-6",l:"Claude Sonnet"},{v:"claude-opus-4-6",l:"Claude Opus"}], openai:[{v:"gpt-4o-mini",l:"GPT-4o Mini"},{v:"gpt-4o",l:"GPT-4o"}], stub:[{v:"stub",l:"Stub"}] }
                },
                { slot:"voice",    label:"Voice provider",    providers:[{v:"elevenlabs",l:"ElevenLabs"},{v:"playht",l:"PlayHT"},{v:"stub",l:"Stub (test)"}] },
                { slot:"visual",   label:"Visual provider",   providers:[{v:"replicate",l:"Replicate (SDXL/Flux)"},{v:"dalle",l:"DALL-E 3"},{v:"stub",l:"Stub (test)"}] },
                { slot:"assembly", label:"Assembly provider", providers:[{v:"capcut_export",l:"CapCut (manual)"},{v:"creatomate",l:"Creatomate (API)"},{v:"remotion",l:"Remotion (Phase 2)"},{v:"stub",l:"Stub (test)"}] },
              ].map(({ slot, label, providers, models })=>{
                const cfg = settings.providers?.[slot]||{};
                const statusColor = cfg.status==="configured"?"#4A9B7F":cfg.status==="needs_key"?"#C49A3C":"var(--t4)";
                return (
                  <div key={slot} style={{ padding:"14px", borderRadius:9, border:"1px solid var(--border)", background:"var(--fill2)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      <span style={{ fontSize:13, fontWeight:500, color:"var(--t1)" }}>{label}</span>
                      <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99, background:`${statusColor}15`, color:statusColor, border:`1px solid ${statusColor}25`, fontWeight:600 }}>
                        {cfg.status==="configured"?"Configured":cfg.status==="needs_key"?"Needs API key":"Not configured"}
                      </span>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      <div>
                        <div style={{ fontSize:10, color:"var(--t3)", marginBottom:4 }}>Provider</div>
                        <select value={cfg.provider||""} onChange={e=>upd(`providers.${slot}.provider`,e.target.value)} style={selStyle}>
                          {providers.map(p=><option key={p.v} value={p.v}>{p.l}</option>)}
                        </select>
                      </div>
                      {models && models[cfg.provider] && (
                        <div>
                          <div style={{ fontSize:10, color:"var(--t3)", marginBottom:4 }}>Model</div>
                          <select value={cfg.model||""} onChange={e=>upd(`providers.${slot}.model`,e.target.value)} style={selStyle}>
                            {(models[cfg.provider]||[]).map(m=><option key={m.v} value={m.v}>{m.l}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    {slot==="voice" && (
                      <div style={{ marginTop:8 }}>
                        <div style={{ fontSize:10, color:"var(--t3)", marginBottom:4 }}>Voice ID</div>
                        <input value={cfg.voice_id||""} onChange={e=>upd(`providers.${slot}.voice_id`,e.target.value)} placeholder="From ElevenLabs dashboard" style={inputStyle}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Intelligence ── */}
          {section==="intelligence" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                {[
                  { label:"Published",     value:stories.filter(s=>s.status==="published").length },
                  { label:"With metrics",  value:stories.filter(s=>s.metrics_completion).length },
                  { label:"Until Stage 2", value:Math.max(0,50-stories.filter(s=>s.status==="published").length) },
                  { label:"Until Stage 3", value:Math.max(0,100-stories.filter(s=>s.status==="published").length) },
                ].map(m=>(
                  <div key={m.label} style={{ padding:"12px 14px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)" }}>
                    <div style={{ fontSize:10, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>{m.label}</div>
                    <div style={{ fontSize:22, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"var(--t1)" }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, padding:"12px 14px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)" }}>
                Score weights, voice patterns, visual intelligence, and predictive scoring activate automatically as published content accumulates. No manual configuration needed — the system learns from every published video.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
