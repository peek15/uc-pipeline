"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import { Search, ArrowRight, FileText, Eye, ChevronRight, ChevronDown, SlidersHorizontal, X, Check, Trash2 } from "lucide-react";
import { STAGES, ERAS, ARCHETYPES, ACCENT, FORMATS, FORMAT_MAP, HOOK_TYPES, EMOTIONAL_ANGLES } from "@/lib/constants";

const SORT_OPTS = [
  { key: "date_desc",      label: "Newest first" },
  { key: "date_asc",       label: "Oldest first" },
  { key: "score_desc",     label: "Score: high → low" },
  { key: "score_asc",      label: "Score: low → high" },
  { key: "reach_desc",     label: "Reach: high → low" },
  { key: "readiness_desc", label: "Readiness: high → low" },
  { key: "title_asc",      label: "Title A → Z" },
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

function getReadiness(s) {
  return [!!s.script, !!s.script_fr, !!s.script_es, !!s.script_pt, !!s.hook, s.score_total!=null, !!s.scheduled_date, ["produced","published"].includes(s.status)].filter(Boolean).length;
}

function ScoreBar({ score, label, max=25 }) {
  if (score==null) return null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ fontSize:10, color:"var(--t3)", width:90, flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:3, borderRadius:2, background:"var(--bg3)", overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${(score/max)*100}%`, background:"var(--t1)", borderRadius:2 }} />
      </div>
      <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace", color:"var(--t2)", width:20, textAlign:"right" }}>{score}</span>
    </div>
  );
}

export default function PipelineView({ stories, onSelect, onStageChange, onBulkAction, onBulkReject, onBulkDelete, setActiveTab }) {
  // Filter state
  const [stageFilter, setStageFilter] = usePersistentState("pipeline_stage",     "all");
  const [search,      setSearch]      = usePersistentState("pipeline_search",    "");
  const [showFilters, setShowFilters] = usePersistentState("pipeline_showfilt",  false);
  const [era,         setEra]         = usePersistentState("pipeline_era",       "");
  const [archetype,   setArchetype]   = usePersistentState("pipeline_archetype", "");
  const [format,      setFormat]      = usePersistentState("pipeline_format",    "");
  const [hookType,    setHookType]    = usePersistentState("pipeline_hooktype",  "");
  const [emotAngle,   setEmotAngle]   = usePersistentState("pipeline_emotion",   "");
  const [ptStatus,    setPtStatus]    = usePersistentState("pipeline_pt",        "");
  const [minScore,    setMinScore]    = usePersistentState("pipeline_minscore",  0);
  const [minReach,    setMinReach]    = usePersistentState("pipeline_minreach",  0);
  const [dateFrom,    setDateFrom]    = usePersistentState("pipeline_datefrom",  "");
  const [dateTo,      setDateTo]      = usePersistentState("pipeline_dateto",    "");
  const [sort,        setSort]        = usePersistentState("pipeline_sort",      "date_desc");

  // Selection / navigation state
  const [selected,    setSelected]    = useState(new Set());
  const [expanded,    setExpanded]    = usePersistentState("pipeline_expanded", new Set());
  const [focused,     setFocused]     = useState(null);
  const containerRef = useRef(null);

  const activeFilterCount = [era, archetype, format, hookType, emotAngle, ptStatus, dateFrom, dateTo, minScore>0, minReach>0].filter(Boolean).length;
  const clearFilters = () => { setEra(""); setArchetype(""); setFormat(""); setHookType(""); setEmotAngle(""); setPtStatus(""); setDateFrom(""); setDateTo(""); setMinScore(0); setMinReach(0); setSort("date_desc"); };

  const filtered = useMemo(() => {
    let list = stories.filter(s => {
      if (stageFilter !== "all" && s.status !== stageFilter) return false;
      if (s.status === "rejected" && stageFilter !== "rejected") return false;
      if (s.status === "archived" && stageFilter !== "archived") return false;
      if (search) {
        const q = search.toLowerCase();
        const players = Array.isArray(s.players) ? s.players.join(" ") : (s.players||"");
        const searchFields = [
          s.title, players, s.archetype, s.era, s.angle, s.hook,
          s.format, s.hook_type, s.emotional_angle,
          ...(s.subject_tags||[])
        ].map(f=>(f||"").toLowerCase());
        if (!searchFields.some(f => f.includes(q))) return false;
      }
      if (era        && s.era            !== era)        return false;
      if (archetype  && s.archetype      !== archetype)  return false;
      if (format     && s.format         !== format)     return false;
      if (hookType   && s.hook_type      !== hookType)   return false;
      if (emotAngle  && s.emotional_angle!== emotAngle)  return false;
      if (minScore   && (s.score_total||0)  < minScore*20) return false;
      if (minReach   && (s.reach_score||0)  < minReach*20) return false;
      if (ptStatus === "cleared" && !s.pt_review_cleared) return false;
      if (ptStatus === "pending" && s.pt_review_cleared)  return false;
      if (dateFrom) { const d = s.created_at?.split("T")[0]; if (!d||d<dateFrom) return false; }
      if (dateTo)   { const d = s.created_at?.split("T")[0]; if (!d||d>dateTo)   return false; }
      return true;
    });
    list.sort((a,b) => {
      if (sort==="date_desc")      return new Date(b.created_at||0) - new Date(a.created_at||0);
      if (sort==="date_asc")       return new Date(a.created_at||0) - new Date(b.created_at||0);
      if (sort==="score_desc")     return (b.score_total||0)-(a.score_total||0);
      if (sort==="score_asc")      return (a.score_total||0)-(b.score_total||0);
      if (sort==="reach_desc")     return (b.reach_score||0)-(a.reach_score||0);
      if (sort==="readiness_desc") return getReadiness(b)-getReadiness(a);
      if (sort==="title_asc")      return (a.title||"").localeCompare(b.title||"");
      return 0;
    });
    return list;
  }, [stories, stageFilter, search, era, archetype, format, hookType, emotAngle, ptStatus, minScore, minReach, dateFrom, dateTo, sort]);

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
        const TABS = ["pipeline","research","script","calendar","analyze"];
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

  return (
    <div ref={containerRef} className="animate-fade-in" tabIndex={-1} style={{outline:"none"}}>

      {/* Controls */}
      <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto",gap:8,marginBottom:12,alignItems:"center"}}>
        <div style={{position:"relative"}}>
          <Search size={13} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"var(--t3)",pointerEvents:"none"}} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, players, angle, hook, era, format..."
            style={{width:"100%",padding:"8px 12px 8px 32px",borderRadius:8,background:"var(--fill2)",border:"1px solid var(--border-in)",color:"var(--t1)",fontSize:13,outline:"none"}} />
        </div>
        <select value={sort} onChange={e=>setSort(e.target.value)} style={sel}>
          {SORT_OPTS.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button onClick={()=>setShowFilters(f=>!f)} style={{
          height:34,padding:"0 14px",borderRadius:8,fontSize:12,fontWeight:500,
          background:showFilters||activeFilterCount>0?"var(--t1)":"var(--fill2)",
          color:showFilters||activeFilterCount>0?"var(--bg)":"var(--t2)",
          border:"1px solid var(--border)",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
        }}>
          <SlidersHorizontal size={13}/> Filters
          {activeFilterCount>0&&<span style={{width:16,height:16,borderRadius:"50%",background:"var(--bg)",color:"var(--t1)",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{activeFilterCount}</span>}
        </button>
        {activeFilterCount>0&&<button onClick={clearFilters} style={{height:34,padding:"0 10px",borderRadius:8,fontSize:12,color:"var(--t3)",background:"transparent",border:"1px solid var(--border)",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><X size={12}/> Clear</button>}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="animate-fade-in" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8,padding:"14px 16px",borderRadius:10,background:"var(--bg2)",border:"1px solid var(--border)",marginBottom:16}}>
          {[
            {label:"Era",       val:era,       set:setEra,       opts:ERAS.map(e=>({key:e,label:e}))},
            {label:"Archetype", val:archetype, set:setArchetype, opts:ARCHETYPES.map(a=>({key:a,label:a}))},
            {label:"Format",    val:format,    set:setFormat,    opts:FORMATS.map(f=>({key:f.key,label:f.label}))},
            {label:"Hook type", val:hookType,  set:setHookType,  opts:HOOK_TYPES.map(h=>({key:h.key,label:h.label}))},
            {label:"Angle",     val:emotAngle, set:setEmotAngle, opts:EMOTIONAL_ANGLES.map(a=>({key:a,label:a.charAt(0).toUpperCase()+a.slice(1)}))},
            {label:"PT status", val:ptStatus,  set:setPtStatus,  opts:[{key:"cleared",label:"Cleared"},{key:"pending",label:"Pending review"}]},
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
          <div>
            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Min score{minScore>0?` · ${minScore*20}+`:""}</div>
            <div style={{display:"flex",gap:3}}>
              {[0,1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>setMinScore(n)} style={{flex:1,padding:"5px 0",borderRadius:5,fontSize:11,fontWeight:600,background:minScore===n?"var(--t1)":"var(--fill2)",color:minScore===n?"var(--bg)":"var(--t3)",border:"1px solid var(--border)",cursor:"pointer"}}>
                  {n===0?"—":n}
                </button>
              ))}
            </div>
          </div>

          {/* Min reach score */}
          <div>
            <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Min reach{minReach>0?` · ${minReach*20}+`:""}</div>
            <div style={{display:"flex",gap:3}}>
              {[0,1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>setMinReach(n)} style={{flex:1,padding:"5px 0",borderRadius:5,fontSize:11,fontWeight:600,background:minReach===n?"var(--t1)":"var(--fill2)",color:minReach===n?"var(--bg)":"var(--t3)",border:"1px solid var(--border)",cursor:"pointer"}}>
                  {n===0?"—":n}
                </button>
              ))}
            </div>
          </div>

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
            <button key={f.key} onClick={()=>setStageFilter(f.key)} style={{
              padding:"6px 12px",borderRadius:7,fontSize:12,fontWeight:stageFilter===f.key?600:400,
              background:stageFilter===f.key?"var(--t1)":"transparent",
              color:stageFilter===f.key?"var(--bg)":"var(--t3)",
              border:stageFilter===f.key?"1px solid var(--t1)":"1px solid transparent",
              cursor:"pointer",transition:"all 0.12s",
            }}>
              {f.label}{ct>0?` · ${ct}`:""}
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selected.size>0&&(
        <div className="animate-fade-in" style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderRadius:10,background:"var(--t1)",color:"var(--bg)",marginBottom:12}}>
          <span style={{fontSize:13,fontWeight:500}}>{selected.size} selected</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{[...selected].forEach(id=>onStageChange(id,"approved"));setSelected(new Set());}} style={{padding:"6px 14px",borderRadius:7,fontSize:12,fontWeight:600,background:"var(--bg)",color:"var(--t1)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}><Check size={12}/> Approve</button>
            <button onClick={()=>{onBulkReject([...selected]);setSelected(new Set());}} style={{padding:"6px 14px",borderRadius:7,fontSize:12,fontWeight:600,background:"rgba(255,255,255,0.1)",color:"var(--bg)",border:"1px solid rgba(255,255,255,0.2)",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}><X size={12}/> Reject</button>
            <button onClick={()=>{ const ids=[...selected]; if (window.confirm(`Delete ${ids.length} ${ids.length===1?"story":"stories"}? This cannot be undone.`)) { onBulkDelete(ids); setSelected(new Set()); } }} style={{padding:"6px 14px",borderRadius:7,fontSize:12,fontWeight:600,background:"rgba(255,255,255,0.1)",color:"var(--bg)",border:"0.5px solid rgba(255,255,255,0.2)",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}><Trash2 size={12}/> Delete</button>
            <button onClick={()=>setSelected(new Set())} style={{padding:"6px 10px",borderRadius:7,fontSize:12,background:"transparent",color:"rgba(255,255,255,0.5)",border:"none",cursor:"pointer"}}><X size={14}/></button>
          </div>
        </div>
      )}

      {/* Story groups */}
      {(stageFilter==="all"?stageOrder:[stageFilter]).map(stKey=>{
        const items = bySt[stKey]||[];
        if (!items.length&&stageFilter==="all") return null;
        const st = STAGES[stKey];
        return (
          <div key={stKey} style={{marginBottom:"var(--section-gap, 32px)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,paddingBottom:8,borderBottom:"1px solid var(--border)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:600,color:"var(--t1)",letterSpacing:"0.04em",textTransform:"uppercase"}}>{st.label}</span>
                <span style={{fontSize:11,color:"var(--t3)",fontFamily:"'DM Mono',monospace"}}>{items.length}</span>
              </div>
              {stKey==="accepted"&&items.length>0&&(
                <button onClick={()=>onBulkAction("accepted","approved")} style={{padding:"4px 12px",borderRadius:6,fontSize:11,fontWeight:600,background:"var(--t1)",color:"var(--bg)",border:"none",cursor:"pointer"}}>
                  Approve all
                </button>
              )}
            </div>

            {!items.length&&<div style={{padding:"24px 0",textAlign:"center",color:"var(--t4)",fontSize:12}}>No stories</div>}

            <div style={{display:"flex",flexDirection:"column",gap:"var(--card-gap, 2px)"}}>
              {items.map(s=>{
                const isSelected = selected.has(s.id);
                const isExpanded = expanded.has(s.id);
                const isFocused  = focused===s.id;
                const players    = Array.isArray(s.players)?s.players.join(", "):(s.players||"");
                const dateStr    = s.created_at?new Date(s.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"";
                const hasScore   = s.score_total!=null;
                const ac         = ACCENT[s.archetype]||"var(--border)";
                const fmt        = FORMAT_MAP[s.format];
                const readiness  = getReadiness(s);
                const rColor     = readiness===8?"var(--success)":readiness>=5?"var(--warning)":"var(--t4)";

                return (
                  <div key={s.id} id={`story-${s.id}`}
                    onClick={()=>setFocused(s.id)}
                    style={{
                      borderRadius:8, marginBottom:2,
                      borderTop:    isFocused?"0.5px solid var(--t2)":isSelected?"0.5px solid var(--t1)":"0.5px solid var(--border2)",
                      borderRight:  isFocused?"0.5px solid var(--t2)":isSelected?"0.5px solid var(--t1)":"0.5px solid var(--border2)",
                      borderBottom: isFocused?"0.5px solid var(--t2)":isSelected?"0.5px solid var(--t1)":"0.5px solid var(--border2)",
                      borderLeft:   fmt?`2px solid ${fmt.color}`:"2px solid var(--border2)",
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
                        <div style={{fontSize:14,fontWeight:500,color:"var(--t1)",letterSpacing:"-0.01em",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--t3)",flexWrap:"wrap"}}>
                          <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
                            <span style={{width:6,height:6,borderRadius:"50%",background:ac,display:"inline-block",flexShrink:0}}/>
                            <span style={{color:ac,fontWeight:500}}>{s.archetype}</span>
                          </span>
                          {s.era&&<><span style={{color:"var(--t4)"}}>·</span><span>{s.era}</span></>}
                          {players&&<><span style={{color:"var(--t4)"}}>·</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{players}</span></>}
                          {s.script&&<><span style={{color:"var(--t4)"}}>·</span><FileText size={11} color="var(--t3)"/></>}
                          {s.metrics_views&&<><span style={{color:"var(--t4)"}}>·</span><Eye size={11}/><span>{parseInt(s.metrics_views)>1000?`${(parseInt(s.metrics_views)/1000).toFixed(1)}k`:s.metrics_views}</span></>}
                        </div>
                        {/* Angle preview */}
                        {s.angle&&!isExpanded&&(
                          <div style={{fontSize:12,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%",opacity:0.7,marginTop:1}}>
                            {s.angle}
                          </div>
                        )}
                      </div>

                      {/* Score + readiness + date */}
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:9,fontWeight:700,fontFamily:"'DM Mono',monospace",color:rColor,padding:"1px 4px",borderRadius:3,background:readiness===8?"rgba(74,155,127,0.1)":"transparent"}}>{readiness}/8</span>
                          {hasScore&&<span style={{fontSize:11,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"var(--t1)"}}>{s.score_total}</span>}
                          {!hasScore&&s.obscurity>0&&<ScoreDots score={s.obscurity}/>}
                        </div>
                        {s.reach_score!=null&&<span style={{fontSize:10,color:"var(--t4)",fontFamily:"'DM Mono',monospace"}}>↗{s.reach_score}</span>}
                        {dateStr&&<span style={{fontSize:10,color:"var(--t4)",fontFamily:"'DM Mono',monospace"}}>{dateStr}</span>}
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
                          {STAGES[st.next].label} <ArrowRight size={11}/>
                        </button>
                      )}
                    </div>

                    {/* Expanded view — angle, hook, players, scores only. No script. */}
                    {isExpanded&&(
                      <div className="animate-fade-in" style={{padding:"0 12px 14px 46px",borderTop:"1px solid var(--border2)"}}>
                        {s.angle&&<div style={{fontSize:13,color:"var(--t2)",lineHeight:1.7,marginTop:10,marginBottom:8}}>{s.angle}</div>}
                        {s.hook&&<div style={{fontSize:13,color:"var(--t3)",fontStyle:"italic",paddingLeft:12,borderLeft:"2px solid var(--border)",lineHeight:1.5,marginBottom:10}}>"{s.hook}"</div>}
                        {players&&<div style={{fontSize:12,color:"var(--t3)",marginBottom:10,lineHeight:1.6,whiteSpace:"normal"}}>{players}</div>}

                        {hasScore&&(
                          <div style={{padding:"10px 12px",borderRadius:7,background:"var(--bg2)",border:"1px solid var(--border2)",marginBottom:10}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                              <span style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em"}}>AI Score</span>
                              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                                {s.reach_score!=null&&<span style={{fontSize:11,color:"var(--t3)"}}>↗ reach <span style={{fontFamily:"'DM Mono',monospace",color:"var(--t2)",fontWeight:600}}>{s.reach_score}</span></span>}
                                <span style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"var(--t1)"}}>{s.score_total}<span style={{fontSize:10,color:"var(--t3)",fontWeight:400}}>/100</span></span>
                              </div>
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
        <div style={{textAlign:"center",padding:"80px 0",color:"var(--t4)"}}>
          <Search size={32} style={{margin:"0 auto 12px",display:"block",opacity:0.25}}/>
          <div style={{fontSize:13}}>No stories match your filters</div>
          {activeFilterCount>0&&<button onClick={clearFilters} style={{marginTop:10,fontSize:12,color:"var(--t2)",background:"transparent",border:"none",cursor:"pointer",textDecoration:"underline"}}>Clear filters</button>}
        </div>
      )}

      {/* Shortcut hint */}
      <div style={{marginTop:24,padding:"10px 14px",borderRadius:8,background:"var(--fill2)",border:"1px solid var(--border2)",fontSize:11,color:"var(--t4)",display:"flex",gap:16,flexWrap:"wrap"}}>
        {[["↑↓","Navigate"],["→←","Expand"],["Enter/D","Full detail"],["Space","Select"],["⌘E","Select all"],["⌘↵","Approve"],["⌘⌫","Reject"],["⌥→←","Switch tab"]].map(([k,v])=>(
          <span key={k}><kbd style={{fontFamily:"'DM Mono',monospace",fontSize:9,padding:"1px 5px",borderRadius:3,background:"var(--bg3)",border:"1px solid var(--border)"}}>{k}</kbd> {v}</span>
        ))}
      </div>
    </div>
  );
}
