"use client";
import { useState, useEffect, useRef } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import { X, Check, AlertCircle, ChevronRight, Plus, Trash2, GripVertical, Zap, RefreshCw, ArrowRight } from "lucide-react";
import { FORMATS, FORMAT_MAP, ARCHETYPES } from "@/lib/constants";
import { supabase } from "@/lib/db";
import { runPrompt } from "@/lib/ai/runner";
import ProvidersSection from "@/components/ProvidersSection";
import ErrorBoundary from "@/components/ErrorBoundary";
import { uploadAsset, listAssets, deleteAsset, updateAssetSummary, extractTextFromFile, ASSET_TYPES } from "@/lib/assets";
import { DEFAULT_BRAND_PROFILE_ID, DEFAULT_WORKSPACE_ID } from "@/lib/brand";

const UNCLE_CARTER_PROFILE_ID = DEFAULT_BRAND_PROFILE_ID;

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
    programmes: [
      { id:"standard",           name:"Standard",            color:"#C49A3C", role:"reach",     weight:60, angle_suggestions:["redemption","rivalry","legacy","pressure"], custom_fields:[] },
      { id:"classics",           name:"Classics",            color:"#4A9B7F", role:"community", weight:25, angle_suggestions:["sacrifice","legacy","brotherhood","loyalty"], custom_fields:[] },
      { id:"performance_special",name:"Performance Special", color:"#C0666A", role:"balanced",  weight:15, angle_suggestions:["shock","resilience","triumph"], custom_fields:[] },
      { id:"special_edition",    name:"Special Edition",     color:"#8B7EC8", role:"special",   weight:0,  angle_suggestions:[], custom_fields:[] },
    ],
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
};

// Defensive merge: ensures all top-level keys from DEFAULT_SETTINGS exist
// even when initialSettings (loaded from Supabase) is partial or has a
// stale shape. Prevents undefined-access crashes like settings.brand.name.
function mergeSettings(incoming) {
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

// ── Section nav ──
const SECTIONS = [
  { key:"brand",       label:"Brand Profile" },
  { key:"strategy",    label:"Content Strategy" },
  { key:"programmes",  label:"Programmes" },
  { key:"rules",       label:"Rules & Alerts" },
  { key:"appearance",  label:"Appearance" },
  { key:"workspace",   label:"Workspace" },
  { key:"providers",   label:"Providers" },
  { key:"intelligence",label:"Intelligence" },
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

export default function SettingsModal({ isOpen, onClose, stories=[], onSettingsChange, initialSettings, version="" }) {
  const VERSION_NUM = version;
  const [section,  setSection]  = usePersistentState("settings_section", "brand");
  const [settings, setSettings] = useState(mergeSettings(initialSettings));
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

  useEffect(() => { if (initialSettings) setSettings(mergeSettings(initialSettings)); }, [initialSettings]);

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

  const BRAND_PROFILE_ID = DEFAULT_BRAND_PROFILE_ID;
  const WORKSPACE_ID     = DEFAULT_WORKSPACE_ID;

  useEffect(() => {
    if (section === "brand" && isOpen && assets.length === 0) {
      setAssetsLoading(true);
      listAssets(BRAND_PROFILE_ID)
        .then(data => setAssets(data||[]))
        .catch(() => setAssets([]))
        .finally(() => setAssetsLoading(false));
    }
  }, [section, isOpen]);

  const [rulesTab, setRulesTab] = useState("scheduling");

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
        // provider_config removed in v3.10.1 — provider credentials now
        // saved via /api/provider-config to the secure provider_secrets
        // table, not exposed in brand_profiles JSON.
      });
      if (onSettingsChange) onSettingsChange(settings);
      try { localStorage.setItem("uc_settings", JSON.stringify(settings)); } catch {}
      setSaved(true);
      setTimeout(()=>setSaved(false), 2000);
    } catch(e) { console.error(e); }
    setSaving(false);
  };

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
    } catch(e) { console.error(e); }
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
    } catch(e) { console.error(e); }
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

    try {
      const { text: response, parsed } = await runPrompt({
        type:   "onboarding-chat",
        params: { current_brand_json: currentBrand, history },
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
            <div style={{ fontSize:11, color:"var(--t3)", marginTop:1 }}>{settings.brand.name}</div>
          </div>
          {SECTIONS.map(s=>(
            <button key={s.key} onClick={()=>setSection(s.key)} style={{
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
                <button onClick={()=>{suggestProgrammes();runStratAudit();}} disabled={progRunning||stratRunning} style={{ padding:"5px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                  {progRunning||stratRunning?"Analysing...":"AI audit"}
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
                Define your brand voice, content type, and goals. The AI uses this to generate scripts, score stories, and make recommendations that match your brand.
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
                          <span style={{ color:"var(--t4)" }}>{k}:</span> {Array.isArray(v)?v.join(", "):String(v)}
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
                  <input value={settings.brand.name||""} onChange={e=>upd("brand.name",e.target.value)} style={inputStyle} placeholder="Uncle Carter"/>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>Content type</div>
                  <select value={settings.brand.content_type||"narrative"} onChange={e=>upd("brand.content_type",e.target.value)} style={selStyle}>
                    {["narrative","advertising","educational","product","custom"].map(v=><option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}
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
                  <span style={{ fontSize:12, color:"var(--t3)" }}>episodes per week</span>
                </div>
              </div>
              {/* Content defaults */}
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12 }}>Content defaults</div>
                <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                  {[
                    { key:"auto_translate", label:"Auto-translate after script generation", hint:"EN → FR/ES/PT automatically" },
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
            </div>
          )}

          {/* ── Programmes ── */}
          {section==="programmes" && (
            <div>
              <div style={{ fontSize:12, color:"var(--t3)", marginBottom:14, lineHeight:1.6 }}>
                Programmes define your content formats — name, role, cadence weight, and angle suggestions. The auto-fill and intelligence layer use these to plan and score content.
              </div>

              {/* AI audit */}
              <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                <button onClick={()=>{suggestProgrammes();runStratAudit();}} disabled={progRunning||stratRunning} style={{ padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:500, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                  {progRunning||stratRunning?"Analysing...":"AI audit & suggest"}
                </button>
              </div>

              {/* AI suggested programmes */}
              {progAudit && Array.isArray(progAudit) && progAudit.length>0 && (
                <div style={{ padding:"12px 14px", borderRadius:9, background:"rgba(196,154,60,0.06)", border:"1px solid rgba(196,154,60,0.2)", marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#C49A3C", marginBottom:10 }}>⚡ AI suggested programmes</div>
                  {progAudit.map((p,i)=>(
                    <div key={i} style={{ marginBottom:10, borderRadius:9, border:"0.5px solid var(--border)", overflow:"hidden", borderLeft:`3px solid ${p.color||"var(--border)"}` }}>
                      <div style={{ padding:"12px 14px", background:"var(--fill2)" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:500, color:"var(--t1)", marginBottom:3 }}>{p.name}</div>
                            <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                              <span style={{ fontSize:11, color:"var(--t3)" }}>{p.role}</span>
                              <span style={{ fontSize:11, color:"var(--t3)" }}>·</span>
                              <span style={{ fontSize:11, color:"var(--t3)" }}>{p.weight}% of slots</span>
                            </div>
                            <div style={{ fontSize:12, color:"var(--t2)", lineHeight:1.5 }}>{p.rationale}</div>
                          </div>
                          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                            <button onClick={()=>{ addProgramme({id:crypto.randomUUID(),...p,angle_suggestions:p.angle_suggestions||[],custom_fields:[]}); setProgAudit(a=>a.filter((_,j)=>j!==i)); }} style={{ padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:500, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer" }}>
                              Add
                            </button>
                            <button onClick={()=>setProgExpandIdx(i===progExpandIdx?null:i)} style={{ padding:"5px 10px", borderRadius:6, fontSize:12, background:"var(--fill2)", border:"0.5px solid var(--border)", color:"var(--t2)", cursor:"pointer" }}>
                              {i===progExpandIdx?"↑":"Discuss"}
                            </button>
                          </div>
                        </div>
                      </div>
                      {i===progExpandIdx && (
                        <ProgDiscuss programme={p} brandName={settings.brand.name}/>
                      )}
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
                {[{key:"scheduling",label:"Scheduling rules"},{key:"alerts",label:"Alert thresholds"}].map(t=>(
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
            </div>
          )}

          {/* ── Providers ── */}
          {section==="providers" && (
            <ProvidersSection />
          )}

          {/* ── Intelligence ── */}
          {section==="intelligence" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6 }}>
                The intelligence layer activates automatically as you publish content. No manual configuration — it learns from every video, performance snapshot, and editorial decision.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                {[
                  { label:"Published",     value:stories.filter(s=>s.status==="published").length },
                  { label:"With metrics",  value:stories.filter(s=>s.metrics_completion).length },
                  { label:"Until Stage 2", value:Math.max(0,50-stories.filter(s=>s.status==="published").length) },
                  { label:"Until Stage 3", value:Math.max(0,100-stories.filter(s=>s.status==="published").length) },
                ].map(m=>(
                  <div key={m.label} style={{ padding:"12px 14px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
                    <div style={{ fontSize:11, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>{m.label}</div>
                    <div style={{ fontSize:18, fontWeight:400, color:"var(--t1)", letterSpacing:0 }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, padding:"12px 14px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
                Score weights, voice patterns, visual intelligence, and predictive scoring activate automatically as published content accumulates. No manual configuration needed — the system learns from every published video.
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderTop:"0.5px solid var(--border2)", marginTop:4 }}>
                <span style={{ fontSize:11, color:"var(--t4)" }}>Uncle Carter Pipeline</span>
                <span style={{ fontSize:11, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:"var(--t4)" }}>v{VERSION_NUM}</span>
              </div>
            </div>
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
                    <button key={t.key} onClick={()=>upd("appearance.theme",t.key)} style={{ flex:1, padding:"10px 12px", borderRadius:9, border:`0.5px solid ${(settings.appearance?.theme||"system")===t.key?"var(--t1)":"var(--border)"}`, background:(settings.appearance?.theme||"system")===t.key?"var(--t1)":"var(--fill2)", cursor:"pointer", textAlign:"left" }}>
                      <div style={{ fontSize:12, fontWeight:500, color:(settings.appearance?.theme||"system")===t.key?"var(--bg)":"var(--t1)" }}>{t.label}</div>
                      {t.hint&&<div style={{ fontSize:10, color:(settings.appearance?.theme||"system")===t.key?"rgba(255,255,255,0.6)":"var(--t3)", marginTop:2 }}>{t.hint}</div>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Density */}
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Density</div>
                <div style={{ fontSize:11, color:"var(--t3)", marginBottom:10 }}>Affects card spacing and padding throughout the app.</div>
                <div style={{ display:"flex", gap:8 }}>
                  {[{key:"compact",label:"Compact",hint:"Smaller cards, more stories visible"},{key:"comfortable",label:"Comfortable",hint:"Balanced (default)"},{key:"spacious",label:"Spacious",hint:"More breathing room"}].map(d=>(
                    <button key={d.key} onClick={()=>upd("appearance.density",d.key)} style={{ flex:1, padding:"10px 12px", borderRadius:9, border:`0.5px solid ${(settings.appearance?.density||"comfortable")===d.key?"var(--t1)":"var(--border)"}`, background:(settings.appearance?.density||"comfortable")===d.key?"var(--t1)":"var(--fill2)", cursor:"pointer", textAlign:"left" }}>
                      <div style={{ fontSize:12, fontWeight:500, color:(settings.appearance?.density||"comfortable")===d.key?"var(--bg)":"var(--t1)" }}>{d.label}</div>
                      <div style={{ fontSize:10, color:(settings.appearance?.density||"comfortable")===d.key?"rgba(255,255,255,0.6)":"var(--t3)", marginTop:2 }}>{d.hint}</div>
                    </button>
                  ))}
                </div>
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
                  { label:"Workspace", value:"Uncle Carter Pipeline", editable:false },
                  { label:"Workspace ID",   value:DEFAULT_WORKSPACE_ID, editable:false, mono:true },
                  { label:"Plan",           value:"Peek Studios — Internal", editable:false },
                ].map(({label,value,editable,mono})=>(
                  <div key={label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"0.5px solid var(--border2)" }}>
                    <span style={{ fontSize:13, color:"var(--t3)" }}>{label}</span>
                    <span style={{ fontSize:13, color:editable?"var(--t1)":"var(--t4)", fontFamily:mono?"ui-monospace,'SF Mono',Menlo,monospace":"inherit" }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Team members */}
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Team members</div>
                <div style={{ padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)", fontSize:12, color:"var(--t2)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontWeight:500 }}>Théo Mauroy</div>
                    <div style={{ fontSize:11, color:"var(--t3)" }}>Owner · admin@peekmedia.cc</div>
                  </div>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99, background:"var(--bg3)", color:"var(--t3)", border:"0.5px solid var(--border)" }}>Owner</span>
                </div>
                <button style={{ marginTop:8, width:"100%", padding:"8px", borderRadius:8, fontSize:12, color:"var(--t3)", background:"transparent", border:"0.5px dashed var(--border)", cursor:"pointer" }}>
                  + Invite team member
                </button>
                <div style={{ marginTop:6, fontSize:11, color:"var(--t4)" }}>Team member roles: Owner, Admin, Editor, Viewer. Multi-user access available on Creative Engine plans.</div>
              </div>

              {/* API */}
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>API access</div>
                <div style={{ padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)", fontSize:12, color:"var(--t3)" }}>
                  API access for programmatic integration is available on Creative Engine Track 3. Contact us to enable.
                </div>
              </div>
            </div>
          )}

          {/* ── Danger Zone ── */}
          {section==="danger" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, marginBottom:4 }}>
                These actions are irreversible. Take care.
              </div>
              {[
                { label:"Reset all settings", hint:"Restore all settings to default values. Your stories and scripts are not affected.", action:"Reset settings", color:"var(--t3)", onClick:()=>{ setSettings(DEFAULT_SETTINGS); try{localStorage.removeItem("uc_settings");}catch{}; } },
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
