"use client";
import { useState, useMemo } from "react";
import { Search, ArrowRight, FileText, Eye, ChevronRight, SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { STAGES, ERAS, ARCHETYPES } from "@/lib/constants";

const SORT_OPTS = [
  { key: "date_desc",    label: "Newest first" },
  { key: "date_asc",     label: "Oldest first" },
  { key: "score_desc",   label: "Score: high → low" },
  { key: "score_asc",    label: "Score: low → high" },
  { key: "title_asc",    label: "Title A → Z" },
];

function ScoreDots({ score }) {
  if (!score) return null;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius:"50%",
          background: i <= score ? "var(--t1)" : "var(--t4)",
          display:"inline-block",
        }} />
      ))}
    </span>
  );
}

export default function PipelineView({ stories, onSelect, onStageChange, onBulkAction }) {
  const [stageFilter, setStageFilter] = useState("all");
  const [search,      setSearch]      = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [era,         setEra]         = useState("");
  const [archetype,   setArchetype]   = useState("");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [minScore,    setMinScore]    = useState(0);
  const [sort,        setSort]        = useState("date_desc");

  const activeFilterCount = [era, archetype, dateFrom, dateTo, minScore > 0].filter(Boolean).length;

  const clearFilters = () => { setEra(""); setArchetype(""); setDateFrom(""); setDateTo(""); setMinScore(0); setSort("date_desc"); };

  const filtered = useMemo(() => {
    let list = stories.filter(s => {
      if (stageFilter !== "all" && s.status !== stageFilter) return false;
      if (s.status === "rejected"  && stageFilter !== "rejected")  return false;
      if (s.status === "archived"  && stageFilter !== "archived")  return false;
      if (search) {
        const q = search.toLowerCase();
        const players = Array.isArray(s.players) ? s.players.join(" ") : (s.players||"");
        if (![(s.title||""),(players),(s.archetype||"")].some(f=>f.toLowerCase().includes(q))) return false;
      }
      if (era       && s.era       !== era)       return false;
      if (archetype && s.archetype !== archetype) return false;
      if (minScore  && (s.obscurity||0) < minScore) return false;
      if (dateFrom) { const d = s.created_at?.split("T")[0]; if (!d || d < dateFrom) return false; }
      if (dateTo)   { const d = s.created_at?.split("T")[0]; if (!d || d > dateTo)   return false; }
      return true;
    });

    list.sort((a, b) => {
      if (sort === "date_desc")  return new Date(b.created_at||0) - new Date(a.created_at||0);
      if (sort === "date_asc")   return new Date(a.created_at||0) - new Date(b.created_at||0);
      if (sort === "score_desc") return (b.obscurity||0) - (a.obscurity||0);
      if (sort === "score_asc")  return (a.obscurity||0) - (b.obscurity||0);
      if (sort === "title_asc")  return (a.title||"").localeCompare(b.title||"");
      return 0;
    });

    return list;
  }, [stories, stageFilter, search, era, archetype, dateFrom, dateTo, minScore, sort]);

  const bySt = {};
  for (const s of filtered) { bySt[s.status] = bySt[s.status] || []; bySt[s.status].push(s); }

  const stageOrder  = ["accepted","approved","scripted","produced","published"];
  const allFilters  = [
    { key:"all", label:"All" },
    ...stageOrder.map(k => ({ key:k, label:STAGES[k].label })),
    { key:"rejected", label:"Rejected" },
  ];

  const selectStyle = {
    padding:"6px 10px", borderRadius:7, fontSize:12,
    background:"var(--fill2)", border:"1px solid var(--border)",
    color:"var(--t1)", outline:"none", cursor:"pointer",
  };

  return (
    <div className="animate-fade-in">

      {/* ── Top controls ── */}
      <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center" }}>
        {/* Search */}
        <div style={{ position:"relative", flex:1, maxWidth:280 }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--t3)", pointerEvents:"none" }} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
            style={{ width:"100%", padding:"8px 12px 8px 32px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border-in)", color:"var(--t1)", fontSize:13, outline:"none" }} />
        </div>

        {/* Sort */}
        <div style={{ position:"relative" }}>
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{ ...selectStyle, paddingRight:28, appearance:"none" }}>
            {SORT_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <ChevronDown size={11} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:"var(--t3)", pointerEvents:"none" }} />
        </div>

        {/* Filter toggle */}
        <button onClick={() => setShowFilters(f=>!f)} style={{
          height:34, padding:"0 12px", borderRadius:8, fontSize:12, fontWeight:500,
          background: showFilters || activeFilterCount > 0 ? "var(--t1)" : "var(--fill2)",
          color:      showFilters || activeFilterCount > 0 ? "var(--bg)"  : "var(--t2)",
          border:"1px solid var(--border)", cursor:"pointer",
          display:"flex", alignItems:"center", gap:6,
        }}>
          <SlidersHorizontal size={13} />
          Filters
          {activeFilterCount > 0 && (
            <span style={{ width:16, height:16, borderRadius:"50%", background:"var(--bg)", color:"var(--t1)", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button onClick={clearFilters} style={{ height:34, padding:"0 10px", borderRadius:8, fontSize:12, color:"var(--t3)", background:"transparent", border:"1px solid var(--border)", cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <div className="animate-fade-in" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:8, padding:"14px 16px", borderRadius:10, background:"var(--bg2)", border:"1px solid var(--border)", marginBottom:16 }}>

          {/* Era */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Era</div>
            <div style={{ position:"relative" }}>
              <select value={era} onChange={e=>setEra(e.target.value)} style={{ ...selectStyle, width:"100%", appearance:"none", paddingRight:24 }}>
                <option value="">Any</option>
                {ERAS.map(e=><option key={e} value={e}>{e}</option>)}
              </select>
              <ChevronDown size={10} style={{ position:"absolute", right:7, top:"50%", transform:"translateY(-50%)", color:"var(--t3)", pointerEvents:"none" }} />
            </div>
          </div>

          {/* Archetype */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Archetype</div>
            <div style={{ position:"relative" }}>
              <select value={archetype} onChange={e=>setArchetype(e.target.value)} style={{ ...selectStyle, width:"100%", appearance:"none", paddingRight:24 }}>
                <option value="">Any</option>
                {ARCHETYPES.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={10} style={{ position:"absolute", right:7, top:"50%", transform:"translateY(-50%)", color:"var(--t3)", pointerEvents:"none" }} />
            </div>
          </div>

          {/* Min score */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>
              Min score {minScore > 0 ? `· ${minScore}+` : ""}
            </div>
            <div style={{ display:"flex", gap:4 }}>
              {[0,1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setMinScore(n)} style={{
                  flex:1, padding:"5px 0", borderRadius:5, fontSize:11, fontWeight:600,
                  background: minScore === n ? "var(--t1)" : "var(--fill2)",
                  color:      minScore === n ? "var(--bg)"  : "var(--t3)",
                  border:"1px solid var(--border)", cursor:"pointer",
                }}>
                  {n === 0 ? "—" : n}
                </button>
              ))}
            </div>
          </div>

          {/* Date from */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Added from</div>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{ ...selectStyle, width:"100%", colorScheme:"dark" }} />
          </div>

          {/* Date to */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Added to</div>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{ ...selectStyle, width:"100%", colorScheme:"dark" }} />
          </div>
        </div>
      )}

      {/* ── Stage filter pills ── */}
      <div style={{ display:"flex", gap:2, marginBottom:20, flexWrap:"wrap" }}>
        {allFilters.map(f => {
          const ct = f.key === "all"
            ? stories.filter(s=>!["rejected","archived"].includes(s.status)).length
            : stories.filter(s=>s.status===f.key).length;
          return (
            <button key={f.key} onClick={() => setStageFilter(f.key)} style={{
              padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight: stageFilter===f.key ? 600 : 400,
              background: stageFilter===f.key ? "var(--t1)" : "transparent",
              color:      stageFilter===f.key ? "var(--bg)"  : "var(--t3)",
              border: stageFilter===f.key ? "1px solid var(--t1)" : "1px solid transparent",
              cursor:"pointer", transition:"all 0.12s",
            }}>
              {f.label}{ct > 0 ? ` · ${ct}` : ""}
            </button>
          );
        })}
      </div>

      {/* ── Story groups ── */}
      {(stageFilter === "all" ? stageOrder : [stageFilter]).map(stKey => {
        const items = bySt[stKey] || [];
        if (!items.length && stageFilter === "all") return null;
        const st = STAGES[stKey];

        return (
          <div key={stKey} style={{ marginBottom:32 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, paddingBottom:8, borderBottom:"1px solid var(--border)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:12, fontWeight:600, color:"var(--t1)", letterSpacing:"0.04em", textTransform:"uppercase" }}>{st.label}</span>
                <span style={{ fontSize:11, color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{items.length}</span>
              </div>
              {stKey === "accepted" && items.length > 0 && (
                <button onClick={() => onBulkAction("accepted","approved")} style={{
                  padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:600,
                  background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer",
                }}>
                  Approve all
                </button>
              )}
            </div>

            {!items.length && (
              <div style={{ padding:"24px 0", textAlign:"center", color:"var(--t4)", fontSize:12 }}>No stories</div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
              {items.map(s => {
                const players = Array.isArray(s.players) ? s.players.join(", ") : (s.players||"");
                const dateStr = s.created_at ? new Date(s.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "";
                return (
                  <button key={s.id} onClick={() => onSelect(s)} style={{
                    width:"100%", display:"grid", alignItems:"center",
                    gridTemplateColumns:"1fr auto auto",
                    gap:12, padding:"11px 14px",
                    borderRadius:8, background:"transparent",
                    border:"1px solid transparent",
                    cursor:"pointer", textAlign:"left", transition:"all 0.1s",
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.background="var(--fill2)";e.currentTarget.style.borderColor="var(--border)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:500, color:"var(--t1)", letterSpacing:"-0.01em", marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {s.title}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--t3)", flexWrap:"wrap" }}>
                        {s.archetype && <span>{s.archetype}</span>}
                        {s.era       && <><span style={{color:"var(--t4)"}}>·</span><span>{s.era}</span></>}
                        {players     && <><span style={{color:"var(--t4)"}}>·</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>{players}</span></>}
                        {s.script    && <><span style={{color:"var(--t4)"}}>·</span><FileText size={11} color="var(--t3)" /></>}
                        {s.metrics_views && <><span style={{color:"var(--t4)"}}>·</span><Eye size={11} color="var(--t3)" /><span>{parseInt(s.metrics_views)>1000?`${(parseInt(s.metrics_views)/1000).toFixed(1)}k`:s.metrics_views}</span></>}
                      </div>
                    </div>

                    {/* Score + date */}
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                      {s.obscurity > 0 && <ScoreDots score={s.obscurity} />}
                      {dateStr && <span style={{ fontSize:10, color:"var(--t4)", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>{dateStr}</span>}
                    </div>

                    {/* Advance */}
                    {st.next && (
                      <button onClick={e=>{e.stopPropagation();onStageChange(s.id,st.next);}} style={{
                        padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:500,
                        background:"var(--fill2)", border:"1px solid var(--border)",
                        color:"var(--t2)", cursor:"pointer", display:"flex", alignItems:"center", gap:4,
                        whiteSpace:"nowrap", transition:"all 0.1s", flexShrink:0,
                      }}
                      onMouseEnter={e=>{e.currentTarget.style.background="var(--t1)";e.currentTarget.style.color="var(--bg)";e.currentTarget.style.borderColor="var(--t1)";}}
                      onMouseLeave={e=>{e.currentTarget.style.background="var(--fill2)";e.currentTarget.style.color="var(--t2)";e.currentTarget.style.borderColor="var(--border)";}}>
                        {STAGES[st.next].label} <ArrowRight size={11} />
                      </button>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div style={{ textAlign:"center", padding:"80px 0", color:"var(--t4)" }}>
          <Search size={32} style={{ margin:"0 auto 12px", display:"block", opacity:0.25 }} />
          <div style={{ fontSize:13 }}>No stories match your filters</div>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} style={{ marginTop:10, fontSize:12, color:"var(--t2)", background:"transparent", border:"none", cursor:"pointer", textDecoration:"underline" }}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
