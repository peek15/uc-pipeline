"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import { Search, ArrowRight, FileText, Eye, ChevronRight, ChevronDown, SlidersHorizontal, X, Check, Trash2, RefreshCw } from "lucide-react";
import { STAGES, ERAS, ARCHETYPES, FORMAT_MAP, HOOK_TYPES, EMOTIONAL_ANGLES, CONTENT_TYPES, CHANNELS } from "@/lib/constants";
import { auditStoryQuality, qualityGatePatch } from "@/lib/qualityGate";
import { PageHeader, Pill, Panel, EmptyState, buttonStyle, InlineTextInput } from "@/components/OperationalUI";
import { contentAudience, contentChannel, contentObjective, getBrandLanguages, getBrandProgrammes, getContentTypeLabel, getStoryScript, subjectText } from "@/lib/brandConfig";
import { getAdaptiveScore } from "@/lib/adaptiveScoring";


const SORT_OPTS = [
  { key: "date_desc",       label: "Newest first" },
  { key: "date_asc",        label: "Oldest first" },
  { key: "predicted_desc",  label: "Signal: high → low" },
  { key: "score_desc",      label: "Adaptive score: high → low" },
  { key: "score_asc",       label: "Adaptive score: low → high" },
  { key: "reach_desc",      label: "Reach: high → low" },
  { key: "readiness_desc",  label: "Readiness: high → low" },
  { key: "title_asc",       label: "Title A → Z" },
];

function ScoreDots({ score }) {
  if (!score) return null;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ width:5, height:5, borderRadius:"50%", background: i<=score ? "var(--t1)" : "var(--t4)", display:"inline-block" }} />
      ))}
    </span>
  );
}

function getReadiness(s, settings) {
  const languages = getBrandLanguages(settings);
  const checks = [
    ...languages.map(l => !!getStoryScript(s, l.key)),
    !!s.hook,
    !!s.format,
    s.score_total != null,
    !!s.scheduled_date,
    ["produced","published"].includes(s.status),
  ];
  return { done: checks.filter(Boolean).length, total: checks.length };
}

function ScoreBar({ score, label, max=25 }) {
  if (score==null) return null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ fontSize:10, color:"var(--t3)", width:90, flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:3, borderRadius:2, background:"var(--bg3)", overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${(score/max)*100}%`, background:"var(--t1)", borderRadius:2 }} />
      </div>
      <span style={{ fontSize:10, fontFamily:"var(--font-mono)", color:"var(--t2)", width:20, textAlign:"right" }}>{score}</span>
    </div>
  );
}

function getGateStatus(s) {
  if (s.quality_gate_status) return s.quality_gate_status;
  if (Number(s.quality_gate_blockers) > 0) return "blocked";
  if (Number(s.quality_gate_warnings) > 0) return "warnings";
  if (s.quality_gate) return "passed";
  return "missing";
}

function nextActionForContent(s) {
  const gateStatus = getGateStatus(s);
  if (gateStatus === "blocked") return "Review blocker";
  if (Number(s.quality_gate_warnings) > 0) return "Review warnings";
  if (s.status === "accepted") return "Review idea";
  if (s.status === "approved") return "Draft content";
  if (s.status === "scripted") return "Run compliance check";
  if (s.status === "produced") return "Approve/export";
  if (s.status === "published") return "Review signals";
  return "Review item";
}

function advanceLabel(nextStage) {
  if (nextStage === "scripted") return "Send to Create";
  if (nextStage === "produced") return "Mark ready";
  if (nextStage === "published") return "Mark published";
  return STAGES[nextStage]?.label || "Move";
}

export default function PipelineView({ stories, onSelect, onStageChange, onBulkAction, onBulkReject, onBulkDelete, onUpdate, setActiveTab, settings = null, campaigns = [], displayMode = "essential" }) {
  // Filter state
  const [stageFilter, setStageFilter] = usePersistentState("pipeline_stage",     "all");
  const [search,      setSearch]      = usePersistentState("pipeline_search",    "");
  const [showFilters, setShowFilters] = usePersistentState("pipeline_showfilt",  false);
  const [era,         setEra]         = usePersistentState("pipeline_era",       "");
  const [archetype,   setArchetype]   = usePersistentState("pipeline_archetype", "");
  const [format,      setFormat]      = usePersistentState("pipeline_format",    "");
  const [contentType, setContentType] = usePersistentState("pipeline_content_type", "");
  const [channel,     setChannel]     = usePersistentState("pipeline_channel", "");
  const [hookType,    setHookType]    = usePersistentState("pipeline_hooktype",  "");
  const [emotAngle,   setEmotAngle]   = usePersistentState("pipeline_emotion",   "");
  const [ptStatus,    setPtStatus]    = usePersistentState("pipeline_pt",        "");
  const [quality,     setQuality]     = usePersistentState("pipeline_quality",   "");
  const [minScore,    setMinScore]    = usePersistentState("pipeline_minscore",  0);
  const [minReach,    setMinReach]    = usePersistentState("pipeline_minreach",  0);
  const [dateFrom,    setDateFrom]    = usePersistentState("pipeline_datefrom",  "");
  const [dateTo,      setDateTo]      = usePersistentState("pipeline_dateto",    "");
  const [sort,        setSort]        = usePersistentState("pipeline_sort",      "date_desc");

  // Selection / navigation state
  const [selected,    setSelected]    = useState(new Set());
  const [expanded,    setExpanded]    = usePersistentState("pipeline_expanded", new Set());
  const [focused,     setFocused]     = useState(null);
  const [auditing,    setAuditing]    = useState(false);
  const containerRef = useRef(null);
  const programmes = useMemo(() => getBrandProgrammes(settings), [settings]);
  const programmeMap = useMemo(() => Object.fromEntries(programmes.map(p => [p.key, p])), [programmes]);
  const languageKeys = useMemo(() => getBrandLanguages(settings).map(l => l.key), [settings]);
  const campaignMap = useMemo(() => Object.fromEntries(campaigns.map(c => [c.id, c])), [campaigns]);
  const detailedMode = displayMode === "detailed";

  const activeFilterCount = [contentType, channel, era, archetype, format, hookType, emotAngle, languageKeys.includes("pt") && ptStatus, quality, dateFrom, dateTo, minScore>0, minReach>0].filter(Boolean).length;
  const clearFilters = () => { setContentType(""); setChannel(""); setEra(""); setArchetype(""); setFormat(""); setHookType(""); setEmotAngle(""); setPtStatus(""); setQuality(""); setDateFrom(""); setDateTo(""); setMinScore(0); setMinReach(0); setSort("date_desc"); };

  const filtered = useMemo(() => {
    let list = stories.filter(s => {
      if (stageFilter !== "all" && s.status !== stageFilter) return false;
      if (s.status === "rejected" && stageFilter !== "rejected") return false;
      if (s.status === "archived" && stageFilter !== "archived") return false;
      if (search) {
        const q = search.toLowerCase();
        const subjects = subjectText(s);
        const searchFields = [
          s.title, subjects, s.archetype, s.era, s.angle, s.hook,
          s.format, s.hook_type, s.emotional_angle, s.content_type,
          contentObjective(s), contentAudience(s), contentChannel(s),
          s.campaign_name, s.deliverable_type,
          ...(s.subject_tags||[])
        ].map(f=>(f||"").toLowerCase());
        if (!searchFields.some(f => f.includes(q))) return false;
      }
      if (contentType && (s.content_type || s.metadata?.content_type || "narrative") !== contentType) return false;
      if (channel && contentChannel(s) !== channel) return false;
      if (era        && s.era            !== era)        return false;
      if (archetype  && s.archetype      !== archetype)  return false;
      if (format     && s.format         !== format)     return false;
      if (hookType   && s.hook_type      !== hookType)   return false;
      if (emotAngle  && s.emotional_angle!== emotAngle)  return false;
      if (minScore   && (getAdaptiveScore(s, settings).total||0)  < minScore*20) return false;
      if (minReach   && (s.reach_score||0)  < minReach*20) return false;
      if (ptStatus === "cleared" && languageKeys.includes("pt") && !s.pt_review_cleared) return false;
      if (ptStatus === "pending" && languageKeys.includes("pt") && s.pt_review_cleared)  return false;
      const gateStatus = getGateStatus(s);
      if (quality && gateStatus !== quality) return false;
      if (dateFrom) { const d = s.created_at?.split("T")[0]; if (!d||d<dateFrom) return false; }
      if (dateTo)   { const d = s.created_at?.split("T")[0]; if (!d||d>dateTo)   return false; }
      return true;
    });
    list.sort((a,b) => {
      if (sort==="date_desc")      return new Date(b.created_at||0) - new Date(a.created_at||0);
      if (sort==="date_asc")       return new Date(a.created_at||0) - new Date(b.created_at||0);
      if (sort==="predicted_desc") return ((b.predicted_score ?? getAdaptiveScore(b, settings).total) || 0)-((a.predicted_score ?? getAdaptiveScore(a, settings).total) || 0);
      if (sort==="score_desc")     return (getAdaptiveScore(b, settings).total||0)-(getAdaptiveScore(a, settings).total||0);
      if (sort==="score_asc")      return (getAdaptiveScore(a, settings).total||0)-(getAdaptiveScore(b, settings).total||0);
      if (sort==="reach_desc")     return (b.reach_score||0)-(a.reach_score||0);
      if (sort==="readiness_desc") return getReadiness(b, settings).done-getReadiness(a, settings).done;
      if (sort==="title_asc")      return (a.title||"").localeCompare(b.title||"");
      return 0;
    });
    return list;
  }, [stories, stageFilter, search, contentType, channel, era, archetype, format, hookType, emotAngle, ptStatus, quality, minScore, minReach, dateFrom, dateTo, sort, settings, languageKeys]);

  const bySt = {};
  for (const s of filtered) { bySt[s.status] = bySt[s.status]||[]; bySt[s.status].push(s); }
  const stageOrder = ["accepted","approved","scripted","produced","published"];
  const visibleIds = (stageFilter==="all" ? stageOrder : [stageFilter]).flatMap(k=>(bySt[k]||[]).map(s=>s.id));
  // ── Keyboard navigation ──
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (["INPUT","TEXTAREA","SELECT"].includes(tag)) return;

      // v3.11.4 — Pipeline sub-tab switching now requires Shift+Option
      // (plain Alt+Arrow is global tab cycling, defined in page.js)
      if (e.altKey && e.shiftKey && (e.key==="ArrowRight"||e.key==="ArrowLeft")) {
        e.preventDefault();
        const TABS = ["pipeline","research","create","calendar","analyze"];
        setActiveTab(prev => { const i=TABS.indexOf(prev); return e.key==="ArrowRight"?TABS[Math.min(i+1,4)]:TABS[Math.max(i-1,0)]; });
        return;
      }

      if (!focused) {
        if (e.key==="ArrowDown"&&visibleIds.length) { e.preventDefault(); setFocused(visibleIds[0]); }
        return;
      }

      const idx = visibleIds.indexOf(focused);

      if (e.key==="ArrowDown") {
        e.preventDefault();
        const next = visibleIds[Math.min(idx+1,visibleIds.length-1)];
        setFocused(next);
        if (e.shiftKey) setSelected(s=>{const n=new Set(s);n.add(next);return n;});
        setTimeout(()=>{document.getElementById(`story-${next}`)?.scrollIntoView({block:"center",behavior:"smooth"});},50);
      }
      if (e.key==="ArrowUp") {
        e.preventDefault();
        const prev = visibleIds[Math.max(idx-1,0)];
        setFocused(prev);
        if (e.shiftKey) setSelected(s=>{const n=new Set(s);n.add(prev);return n;});
        setTimeout(()=>{document.getElementById(`story-${prev}`)?.scrollIntoView({block:"center",behavior:"smooth"});},50);
      }
      if (e.key==="ArrowRight") { e.preventDefault(); setExpanded(s=>{const n=new Set(s);n.add(focused);return n;}); }
      if (e.key==="ArrowLeft")  { e.preventDefault(); setExpanded(s=>{const n=new Set(s);n.delete(focused);return n;}); }
      if (e.key===" ")          { e.preventDefault(); setSelected(s=>{const n=new Set(s);n.has(focused)?n.delete(focused):n.add(focused);return n;}); }

      // Enter or D = open full detail
      if (e.key==="Enter"||(e.key==="d"&&!e.metaKey)) {
        e.preventDefault();
        const s = stories.find(s=>s.id===focused);
        if (s) onSelect(s);
      }

      if (e.metaKey&&e.key==="e") { e.preventDefault(); setSelected(new Set(visibleIds)); }
      if (e.metaKey&&e.key==="Enter")    { e.preventDefault(); if(selected.size>0){[...selected].forEach(id=>onStageChange(id,"approved"));setSelected(new Set());}else if(focused)onStageChange(focused,"approved"); }
      if (e.metaKey&&e.key==="Backspace"){ e.preventDefault(); if(selected.size>0){onBulkReject([...selected]);setSelected(new Set());}else if(focused)onBulkReject([focused]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focused, selected, visibleIds, onStageChange, onBulkReject, onSelect, stories, setActiveTab]);

  const allFilters = [
    {key:"all",label:"All"},
    ...stageOrder.map(k=>({key:k,label:STAGES[k].label})),
    {key:"rejected",label:"Rejected"},
  ];

  const sel = { padding:"6px 10px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none", cursor:"pointer" };
  const reAuditVisible = async () => {
    if (!onUpdate || auditing || !filtered.length) return;
    setAuditing(true);
    try {
      for (const story of filtered) {
        const gate = auditStoryQuality(story, stories, settings);
        await onUpdate(story.id, qualityGatePatch(gate));
      }
    } finally {
      setAuditing(false);
    }
  };

  return (
    <div ref={containerRef} className="animate-fade-in" tabIndex={-1} style={{outline:"none"}}>
      <PageHeader
        title="Pipeline"
      />

      {/* Controls */}
      <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto auto",gap:8,marginBottom:12,alignItems:"center"}}>
        <div style={{position:"relative"}}>
          <Search size={13} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"var(--t3)",pointerEvents:"none"}} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, subjects, objective, audience, campaign..."
            style={{width:"100%",padding:"8px 12px 8px 32px",borderRadius:8,background:"var(--fill2)",border:"1px solid var(--border-in)",color:"var(--t1)",fontSize:13,outline:"none"}} />
        </div>
        {detailedMode && <select value={sort} onChange={e=>setSort(e.target.value)} style={sel}>
          {SORT_OPTS.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
        </select>}
        {detailedMode && <button onClick={reAuditVisible} disabled={auditing || !filtered.length} style={buttonStyle("secondary", {
          height:34,padding:"0 12px", color:auditing || !filtered.length ? "var(--t4)" : "var(--t2)",
          cursor:auditing || !filtered.length ? "not-allowed" : "pointer",
        })}>
          <RefreshCw size={13} className={auditing ? "spin" : ""}/> {auditing ? "Auditing..." : "Re-audit visible"}
        </button>}
        <button onClick={()=>setShowFilters(f=>!f)} style={buttonStyle(showFilters||activeFilterCount>0 ? "primary" : "secondary", {
          height:34,padding:"0 14px",
        })}>
          <SlidersHorizontal size={13}/> Filters
          {activeFilterCount>0&&<span style={{width:16,height:16,borderRadius:"50%",background:"var(--bg)",color:"var(--t1)",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{activeFilterCount}</span>}
        </button>
        {activeFilterCount>0&&<button onClick={clearFilters} style={buttonStyle("ghost", { height:34,padding:"0 10px" })}><X size={12}/> Clear</button>}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="animate-fade-in" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8,padding:"14px 16px",borderRadius:10,background:"var(--bg2)",border:"1px solid var(--border)",marginBottom:16}}>
          {[
            {label:"Content type", val:contentType, set:setContentType, opts:CONTENT_TYPES.map(t=>({key:t.key,label:t.label}))},
            {label:"Channel",    val:channel,    set:setChannel,    opts:CHANNELS.map(c=>({key:c,label:c}))},
            {label:"Era",       val:era,       set:setEra,       opts:ERAS.map(e=>({key:e,label:e}))},
            {label:"Angle",     val:archetype, set:setArchetype, opts:ARCHETYPES.map(a=>({key:a,label:a}))},
            {label:"Format",    val:format,    set:setFormat,    opts:programmes.map(f=>({key:f.key,label:f.label}))},
            ...(detailedMode ? [
              {label:"Hook type", val:hookType,  set:setHookType,  opts:HOOK_TYPES.map(h=>({key:h.key,label:h.label}))},
              {label:"Emotional angle", val:emotAngle, set:setEmotAngle, opts:EMOTIONAL_ANGLES.map(a=>({key:a,label:a.charAt(0).toUpperCase()+a.slice(1)}))},
              ...(languageKeys.includes("pt") ? [{label:"PT status", val:ptStatus,  set:setPtStatus,  opts:[{key:"cleared",label:"Cleared"},{key:"pending",label:"Pending review"}]}] : []),
            ] : []),
            {label:"Quality",   val:quality,   set:setQuality,   opts:[{key:"passed",label:"Passed"},{key:"warnings",label:"Warnings"},{key:"blocked",label:"Blocked"},{key:"missing",label:"Not audited"}]},
          ].map(({label,val,set,opts})=>(
            <div key={label}>
              <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>{label}</div>
              <select value={val} onChange={e=>set(e.target.value)} style={{...sel,width:"100%"}}>
                <option value="">Any</option>
                {opts.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          ))}

          {/* Min community score */}
          {detailedMode && <div>
            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Min score{minScore>0?` · ${minScore*20}+`:""}</div>
            <div style={{display:"flex",gap:3}}>
              {[0,1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>setMinScore(n)} style={{flex:1,padding:"5px 0",borderRadius:5,fontSize:11,fontWeight:600,background:minScore===n?"var(--t1)":"var(--fill2)",color:minScore===n?"var(--bg)":"var(--t3)",border:"1px solid var(--border)",cursor:"pointer"}}>
                  {n===0?"—":n}
                </button>
              ))}
            </div>
          </div>}

          {/* Min reach score */}
          {detailedMode && <div>
            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Min reach{minReach>0?` · ${minReach*20}+`:""}</div>
            <div style={{display:"flex",gap:3}}>
              {[0,1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>setMinReach(n)} style={{flex:1,padding:"5px 0",borderRadius:5,fontSize:11,fontWeight:600,background:minReach===n?"var(--t1)":"var(--fill2)",color:minReach===n?"var(--bg)":"var(--t3)",border:"1px solid var(--border)",cursor:"pointer"}}>
                  {n===0?"—":n}
                </button>
              ))}
            </div>
          </div>}

          {/* Date range */}
          <div>
            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Added from</div>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{...sel,width:"100%"}} />
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Added to</div>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{...sel,width:"100%"}} />
          </div>
        </div>
      )}

      {/* Stage pills */}
      <div style={{display:"flex",gap:2,marginBottom:20,flexWrap:"wrap"}}>
        {allFilters.map(f=>{
          const ct = f.key==="all"?stories.filter(s=>!["rejected","archived"].includes(s.status)).length:stories.filter(s=>s.status===f.key).length;
          return (
            <button key={f.key} onClick={()=>setStageFilter(f.key)} style={{ background:"transparent", border:"none", padding:0, cursor:"pointer" }}>
              <Pill active={stageFilter===f.key} style={{ fontSize:12, fontWeight:stageFilter===f.key?600:500, padding:"6px 12px", borderRadius:7 }}>
                {f.label}{ct>0?` · ${ct}`:""}
              </Pill>
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selected.size>0&&(
        <div className="animate-fade-in" style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:10,background:"var(--t1)",color:"var(--bg)",marginBottom:12,gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <button onClick={()=>setSelected(new Set())} style={{width:22,height:22,borderRadius:5,background:"transparent",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.5)",flexShrink:0}}><X size={13}/></button>
            <span style={{fontSize:13,fontWeight:600}}>{selected.size} selected</span>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <select
              defaultValue=""
              onChange={e=>{
                const stage=e.target.value;
                if(!stage)return;
                [...selected].forEach(id=>onStageChange(id,stage));
                setSelected(new Set());
                e.target.value="";
              }}
              style={{height:30,borderRadius:7,border:"0.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.12)",color:"var(--bg)",fontSize:11,padding:"0 8px",cursor:"pointer",fontFamily:"inherit",outline:"none"}}
            >
              <option value="">Move to stage…</option>
              {stageOrder.map(st=><option key={st} value={st}>{STAGES[st].label}</option>)}
              <option value="archived">Archived</option>
            </select>
            {campaigns.length>0&&(
              <select defaultValue="" onChange={e=>{
                const cId=e.target.value;
                if(!cId)return;
                if(cId==="__remove__"){
                  [...selected].forEach(id=>onUpdate&&onUpdate(id,{campaign_id:null,campaign_name:null}));
                }else{
                  const camp=campaigns.find(c=>c.id===cId);
                  [...selected].forEach(id=>onUpdate&&onUpdate(id,{campaign_id:cId,campaign_name:camp?.name||null}));
                }
                setSelected(new Set());
                e.target.value="";
              }} style={{height:30,borderRadius:7,border:"0.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.12)",color:"var(--bg)",fontSize:11,padding:"0 8px",cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                <option value="">Assign to campaign…</option>
                {campaigns.filter(c=>c.status!=="archived").map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__remove__">Remove from campaign</option>
              </select>
            )}
            <button onClick={()=>{[...selected].forEach(id=>onStageChange(id,"approved"));setSelected(new Set());}} style={{padding:"5px 12px",borderRadius:7,fontSize:12,fontWeight:600,background:"var(--bg)",color:"var(--t1)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><Check size={11}/> Approve</button>
            <button onClick={()=>{onBulkReject([...selected]);setSelected(new Set());}} style={{padding:"5px 12px",borderRadius:7,fontSize:12,fontWeight:600,background:"rgba(255,255,255,0.12)",color:"var(--bg)",border:"0.5px solid rgba(255,255,255,0.2)",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><X size={11}/> Reject</button>
            <button onClick={()=>{const ids=[...selected];if(window.confirm(`Delete ${ids.length} item${ids.length===1?"":"s"}? Cannot be undone.`)){onBulkDelete(ids);setSelected(new Set());}}} style={{padding:"5px 12px",borderRadius:7,fontSize:12,fontWeight:600,background:"rgba(255,255,255,0.12)",color:"var(--bg)",border:"0.5px solid rgba(255,255,255,0.2)",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><Trash2 size={11}/> Delete</button>
          </div>
        </div>
      )}

      {/* Content groups */}
      {(stageFilter==="all"?stageOrder:[stageFilter]).map(stKey=>{
        const items = bySt[stKey]||[];
        if (!items.length&&stageFilter==="all") return null;
        const st = STAGES[stKey];
        return (
          <div key={stKey} style={{marginBottom:"var(--section-gap, 32px)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,paddingBottom:8,borderBottom:"1px solid var(--border)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {/* Select / deselect all in this group */}
                {items.length>0&&(
                  <div
                    onClick={()=>{
                      const groupIds=items.map(s=>s.id);
                      const allSel=groupIds.every(id=>selected.has(id));
                      setSelected(sel=>{
                        const n=new Set(sel);
                        if(allSel)groupIds.forEach(id=>n.delete(id));
                        else groupIds.forEach(id=>n.add(id));
                        return n;
                      });
                    }}
                    style={{width:15,height:15,borderRadius:3,border:`1.5px solid ${items.every(s=>selected.has(s.id))?"var(--t2)":items.some(s=>selected.has(s.id))?"var(--t2)":"var(--border)"}`,background:items.every(s=>selected.has(s.id))?"var(--t2)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}
                  >
                    {items.every(s=>selected.has(s.id))&&<Check size={9} color="var(--bg)"/>}
                    {items.some(s=>selected.has(s.id))&&!items.every(s=>selected.has(s.id))&&<div style={{width:7,height:1.5,background:"var(--t2)",borderRadius:1}}/>}
                  </div>
                )}
                <span style={{fontSize:12,fontWeight:600,color:"var(--t1)",letterSpacing:"0.04em",textTransform:"uppercase"}}>{st.label}</span>
                <span style={{fontSize:11,color:"var(--t3)",fontFamily:"var(--font-mono)"}}>{items.length}</span>
              </div>
              {stKey==="accepted"&&items.length>0&&(
                <button onClick={()=>onBulkAction("accepted","approved")} style={{padding:"4px 12px",borderRadius:6,fontSize:11,fontWeight:600,background:"var(--t1)",color:"var(--bg)",border:"none",cursor:"pointer"}}>
                  Approve all
                </button>
              )}
            </div>

            {!items.length&&filtered.length>0&&<div style={{padding:"24px 0",textAlign:"center",color:"var(--t4)",fontSize:12}}>No content items in this stage.</div>}

            <div style={{display:"flex",flexDirection:"column",gap:"var(--card-gap, 2px)"}}>
              {items.map(s=>{
                const isSelected = selected.has(s.id);
                const isExpanded = expanded.has(s.id);
                const isFocused  = focused===s.id;
                const subjects   = subjectText(s);
                const objective  = contentObjective(s);
                const audience   = contentAudience(s);
                const displayChannel = contentChannel(s);
                const dateStr    = s.created_at?new Date(s.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"";
                const hasScore   = s.score_total!=null;
                const adaptive   = getAdaptiveScore(s, settings);
                const camp       = s.campaign_id ? campaignMap[s.campaign_id] : null;
                const readiness  = getReadiness(s, settings);
                const rColor     = readiness.done===readiness.total?"var(--success)":readiness.done>=Math.ceil(readiness.total * 0.65)?"var(--warning)":"var(--t4)";
                const gateStatus = getGateStatus(s);
                const gateWarnings = Number(s.quality_gate_warnings) || 0;
                const gateBlockers = Number(s.quality_gate_blockers) || 0;
                const gateScore = s.quality_gate?.score;

                return (
                  <div key={s.id} id={`story-${s.id}`}
                    onClick={()=>setFocused(s.id)}
                    style={{
                      borderRadius:8, marginBottom:2,
                      borderTop:    isFocused?"0.5px solid var(--t2)":isSelected?"0.5px solid var(--t1)":"0.5px solid var(--border2)",
                      borderRight:  isFocused?"0.5px solid var(--t2)":isSelected?"0.5px solid var(--t1)":"0.5px solid var(--border2)",
                      borderBottom: isFocused?"0.5px solid var(--t2)":isSelected?"0.5px solid var(--t1)":"0.5px solid var(--border2)",
	                      borderLeft:   "2px solid var(--border2)",
                      background:   isSelected?"var(--fill2)":"var(--card)",
                      transition:   "background 0.1s",
                    }}>

                    {/* Main row */}
                    <div style={{display:"grid",gridTemplateColumns:"24px 1fr auto auto",alignItems:"center",gap:10,padding:"var(--card-padding-y, 10px) var(--card-padding-x, 12px)",cursor:"pointer"}}>
                      {/* Checkbox */}
                      <div onClick={e=>{e.stopPropagation();setSelected(sel=>{const n=new Set(sel);n.has(s.id)?n.delete(s.id):n.add(s.id);return n;})}}
                        style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${isSelected?"var(--t1)":"var(--t4)"}`,background:isSelected?"var(--t1)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
                        {isSelected&&<Check size={11} color="var(--bg)"/>}
                      </div>

                      {/* Content */}
                      <div onClick={()=>setExpanded(ex=>{const n=new Set(ex);n.has(s.id)?n.delete(s.id):n.add(s.id);return n;})} style={{minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:500,color:"var(--t1)",letterSpacing:0,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--t3)",flexWrap:"wrap"}}>
                          <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
	                            <span style={{width:5,height:5,borderRadius:"50%",background:"var(--t4)",display:"inline-block",flexShrink:0}}/>
	                            <span style={{color:"var(--t3)",fontWeight:500}}>{s.archetype || "No angle"}</span>
	                          </span>
	                          <span style={{color:"var(--t4)"}}>·</span><span>{getContentTypeLabel(s, settings)}</span>
	                          {displayChannel&&<><span style={{color:"var(--t4)"}}>·</span><span>{displayChannel}</span></>}
		                          {detailedMode&&s.era&&<><span style={{color:"var(--t4)"}}>·</span><span>{s.era}</span></>}
		                          <span style={{color:"var(--t4)"}}>·</span><span>Next: {nextActionForContent(s)}</span>
	                          {detailedMode&&subjects&&<><span style={{color:"var(--t4)"}}>·</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{subjects}</span></>}
	                          {detailedMode&&getStoryScript(s, "en")&&<><span style={{color:"var(--t4)"}}>·</span><FileText size={11} color="var(--t3)"/></>}
	                          {detailedMode&&s.metrics_views&&<><span style={{color:"var(--t4)"}}>·</span><Eye size={11}/><span>{parseInt(s.metrics_views)>1000?`${(parseInt(s.metrics_views)/1000).toFixed(1)}k`:s.metrics_views}</span></>}
                          {gateStatus!=="missing"&&<><span style={{color:"var(--t4)"}}>·</span><span style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:3,background:gateBlockers?"var(--error-bg)":gateWarnings?"var(--warning-bg)":"var(--success-bg)",color:gateBlockers?"var(--error)":gateWarnings?"var(--warning)":"var(--success)",border:`0.5px solid ${gateBlockers?"var(--error-border)":gateWarnings?"rgba(196,154,60,0.30)":"rgba(74,155,127,0.24)"}`}}>Gate {gateBlockers ? `${gateBlockers} blocker` : gateWarnings ? `${gateWarnings} warning${gateWarnings===1?"":"s"}` : gateScore != null ? gateScore : "passed"}</span></>}
	                          {detailedMode&&camp&&<><span style={{color:"var(--t4)"}}>·</span><span style={{fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:3,background:"var(--fill2)",color:"var(--t3)",border:"0.5px solid var(--border)",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"inline-block"}}>{camp.name}</span></>}
                        </div>
                        {/* Angle preview */}
	                        {detailedMode&&(objective || s.angle)&&!isExpanded&&(
                          <div style={{fontSize:12,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%",opacity:0.7,marginTop:1}}>
                            {objective || s.angle}
                          </div>
                        )}
                      </div>

                      {/* Score + readiness + date */}
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span title={adaptive.explanation || "Adaptive score"} style={{fontSize:11,fontWeight:700,fontFamily:"var(--font-mono)",color:"var(--t1)",padding:"1px 4px",borderRadius:3,background:"var(--fill2)",border:"0.5px solid var(--border)"}}>{adaptive.total}</span>
                          <span style={{fontSize:9,fontWeight:700,fontFamily:"var(--font-mono)",color:rColor,padding:"1px 4px",borderRadius:3,background:readiness.done===readiness.total?"rgba(74,155,127,0.1)":"transparent"}}>{readiness.done}/{readiness.total}</span>
	                          {detailedMode&&hasScore&&<span title="Legacy score" style={{fontSize:10,fontWeight:600,fontFamily:"var(--font-mono)",color:"var(--t3)"}}>legacy {s.score_total}</span>}
	                          {detailedMode&&!hasScore&&s.obscurity>0&&<ScoreDots score={s.obscurity}/>}
                        </div>
	                        {detailedMode&&s.reach_score!=null&&<span style={{fontSize:10,color:"var(--t4)",fontFamily:"var(--font-mono)"}}>reach {s.reach_score}</span>}
	                        {detailedMode&&dateStr&&<span style={{fontSize:10,color:"var(--t4)",fontFamily:"var(--font-mono)"}}>{dateStr}</span>}
                      </div>

                      {/* Advance */}
                      {st.next&&(
                        <button onClick={e=>{e.stopPropagation();onStageChange(s.id,st.next);}} style={{
                          padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:500,
                          background:"var(--fill2)",border:"1px solid var(--border)",
                          color:"var(--t2)",cursor:"pointer",display:"flex",alignItems:"center",gap:4,
                          whiteSpace:"nowrap",transition:"all 0.1s",flexShrink:0,
                        }}
                        onMouseEnter={e=>{e.currentTarget.style.background="var(--t1)";e.currentTarget.style.color="var(--bg)";e.currentTarget.style.borderColor="var(--t1)";}}
                        onMouseLeave={e=>{e.currentTarget.style.background="var(--fill2)";e.currentTarget.style.color="var(--t2)";e.currentTarget.style.borderColor="var(--border)";}}>
	                          {advanceLabel(st.next)} <ArrowRight size={11}/>
                        </button>
                      )}
                    </div>

                    {/* Expanded view — editable metadata + angle, hook, subjects, scores */}
                    {isExpanded&&(
                      <div className="animate-fade-in" style={{padding:"0 12px 14px 46px",borderTop:"1px solid var(--border2)"}}>

                        {/* Inline metadata editors */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10,marginBottom:10}}>
                          <div>
                            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Content type</div>
                            <select value={s.content_type||s.metadata?.content_type||"narrative"} onChange={e=>onUpdate&&onUpdate(s.id,{content_type:e.target.value})}
                              style={{width:"100%",fontSize:12,borderRadius:5,border:"0.5px solid var(--border)",background:"var(--fill2)",color:"var(--t1)",padding:"4px 7px",outline:"none",fontFamily:"inherit",cursor:"pointer"}}>
                              {CONTENT_TYPES.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Channel</div>
                            <select value={displayChannel||""} onChange={e=>onUpdate&&onUpdate(s.id,{channel:e.target.value||null})}
                              style={{width:"100%",fontSize:12,borderRadius:5,border:"0.5px solid var(--border)",background:"var(--fill2)",color:"var(--t1)",padding:"4px 7px",outline:"none",fontFamily:"inherit",cursor:"pointer"}}>
                              <option value="">—</option>
                              {CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                          <div>
                            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>Objective</div>
                            <InlineTextInput key={`obj-${s.id}`} value={objective||""} placeholder="Add objective…" onSave={val=>onUpdate&&onUpdate(s.id,{objective:val})}/>
                          </div>
                          <div>
                            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>Audience</div>
                            <InlineTextInput key={`aud-${s.id}`} value={audience||""} placeholder="Add audience…" onSave={val=>onUpdate&&onUpdate(s.id,{audience:val})}/>
                          </div>
                        </div>

                        {campaigns.length>0&&(
                          <div style={{marginBottom:10}}>
                            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Campaign</div>
                            <select
                              value={s.campaign_id||""}
                              onChange={e=>{
                                const cId=e.target.value||null;
                                const camp=campaigns.find(c=>c.id===cId);
                                onUpdate&&onUpdate(s.id,{campaign_id:cId,campaign_name:camp?.name||null});
                              }}
                              style={{width:"100%",fontSize:12,borderRadius:5,border:"0.5px solid var(--border)",background:"var(--fill2)",color:"var(--t1)",padding:"4px 7px",outline:"none",fontFamily:"inherit",cursor:"pointer"}}
                            >
                              <option value="">— No campaign</option>
                              {campaigns.filter(c=>c.status!=="archived").map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        )}
                        {s.angle&&<div style={{fontSize:13,color:"var(--t2)",lineHeight:1.7,marginBottom:8}}>{s.angle}</div>}
	                        {detailedMode&&s.hook&&<div style={{fontSize:13,color:"var(--t3)",fontStyle:"italic",paddingLeft:12,borderLeft:"2px solid var(--border)",lineHeight:1.5,marginBottom:10}}>"{s.hook}"</div>}
	                        {detailedMode&&subjects&&<div style={{fontSize:12,color:"var(--t3)",marginBottom:10,lineHeight:1.6,whiteSpace:"normal"}}>{subjects}</div>}

	                        {detailedMode&&hasScore&&(
                          <div style={{padding:"10px 12px",borderRadius:7,background:"var(--bg2)",border:"1px solid var(--border2)",marginBottom:10}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                              <span style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Adaptive score</span>
                              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                                {s.reach_score!=null&&<span style={{fontSize:11,color:"var(--t3)"}}>↗ reach <span style={{fontFamily:"var(--font-mono)",color:"var(--t2)",fontWeight:600}}>{s.reach_score}</span></span>}
                                {s.predicted_score!=null&&<span style={{fontSize:11,color:"var(--t3)"}} title={`Directional readiness signal from gate risk and workspace history. Confidence: ${Math.round(((s.metadata?.prediction?.confidence)||0)*100)}%`}>signal <span style={{fontFamily:"var(--font-mono)",color:s.predicted_score>=s.score_total?"var(--success)":s.predicted_score<s.score_total-10?"var(--error)":"var(--t2)",fontWeight:600}}>{s.predicted_score}</span></span>}
                                <span title={adaptive.explanation} style={{fontSize:13,fontWeight:700,fontFamily:"var(--font-mono)",color:"var(--t1)"}}>{adaptive.total}<span style={{fontSize:10,color:"var(--t3)",fontWeight:400}}>/100</span></span>
                              </div>
                            </div>
                            <div style={{fontSize:11,color:"var(--t3)",lineHeight:1.5,marginBottom:8}}>{adaptive.explanation}</div>
                            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
                              <ScoreBar score={adaptive.components?.brand_fit} label="Brand fit" max={100}/>
                              <ScoreBar score={adaptive.components?.market_fit} label="Market fit" max={100}/>
                              <ScoreBar score={adaptive.components?.production_readiness} label="Production" max={100}/>
                              <ScoreBar score={adaptive.components?.compliance_readiness} label="Compliance" max={100}/>
                            </div>
                            {s.score_emotional!=null&&(
                              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                                <ScoreBar score={s.score_emotional} label="Emotional depth"/>
                                <ScoreBar score={s.score_obscurity} label="Obscurity"/>
                                <ScoreBar score={s.score_visual}    label="Visual potential"/>
                                <ScoreBar score={s.score_hook}      label="Hook strength"/>
                              </div>
                            )}
                          </div>
                        )}
                        {s.quality_gate?.issues?.length>0&&(
                          <div style={{padding:"10px 12px",borderRadius:7,background:"var(--bg2)",border:"1px solid var(--border2)",marginBottom:10}}>
                            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Quality Gate</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                              {s.quality_gate.issues.slice(0,5).map(issue=>(
                                <span key={issue.code} style={{fontSize:10,color:issue.severity==="blocker"?"var(--error)":"var(--t3)",padding:"2px 7px",borderRadius:99,background:"var(--fill2)",border:"0.5px solid var(--border)"}}>{issue.message}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <button onClick={()=>onSelect(s)} style={{fontSize:12,color:"var(--t2)",background:"transparent",border:"none",cursor:"pointer",padding:0,textDecoration:"underline"}}>
                            Open full detail →
                          </button>
                          <span style={{fontSize:11,color:"var(--t4)"}}>or press Enter</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length===0&&(
        <EmptyState
          title={stories.length ? "No content matches this view" : "Generate ideas or add your first content item."}
          description={stories.length ? "Adjust filters to return to the full operational list." : "Start from Ideas or onboarding, then move approved items into Pipeline."}
          action={stories.length ? clearFilters : () => setActiveTab?.("research")}
          actionLabel={stories.length ? "Clear filters" : "Open Ideas"}
        />
      )}

      {/* Shortcut hint */}
      <div style={{marginTop:24,padding:"10px 14px",borderRadius:8,background:"var(--fill2)",border:"1px solid var(--border2)",fontSize:11,color:"var(--t4)",display:"flex",gap:16,flexWrap:"wrap"}}>
        {[["↑↓","Navigate"],["→←","Expand"],["Enter/D","Full detail"],["Space","Select"],["⌘E","Select all"],["⌘↵","Approve"],["⌘⌫","Reject"],["⌥→←","Switch tab"]].map(([k,v])=>(
          <span key={k}><kbd style={{fontFamily:"var(--font-mono)",fontSize:9,padding:"1px 5px",borderRadius:3,background:"var(--bg3)",border:"1px solid var(--border)"}}>{k}</kbd> {v}</span>
        ))}
      </div>
    </div>
  );
}
