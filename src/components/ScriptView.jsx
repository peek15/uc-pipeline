"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import { FileText, ChevronRight, ChevronDown, RefreshCw, Copy, Check, Layers, Zap, X, ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { LANGS, ACCENT } from "@/lib/constants";
import { matches, shouldIgnoreFromInput, SHORTCUTS } from "@/lib/shortcuts";
import { runPrompt, runPromptStream } from "@/lib/ai/runner";

function wc(t) { return (t||"").trim().split(/\s+/).filter(w=>w.length>0).length; }

function ProgressSteps({ steps, current }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:5 }}>
          <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11,
            fontWeight: i === current ? 600 : 400,
            color: i < current ? "var(--t3)" : i === current ? "var(--t1)" : "var(--t4)",
          }}>
            {i < current && <Check size={9} />}
            {i === current && <div className="anim-spin" style={{ width:9, height:9, borderRadius:"50%", border:"1.5px solid var(--t4)", borderTopColor:"var(--t1)" }} />}
            {s}
          </div>
          {i < steps.length - 1 && <span style={{ color:"var(--t4)", fontSize:10 }}>→</span>}
        </div>
      ))}
    </div>
  );
}

export default function ScriptView({ stories, onUpdate }) {
  // ── All state first — before any useMemo ──
  const [focusedIdx,   setFocusedIdx]   = useState(0);
  const [expandedIds,  setExpandedIds]  = usePersistentState("script_expanded", new Set());
  const [viewLangMap,  setViewLangMap]  = useState({});
  const getViewLang = (id) => viewLangMap[id] || "en";
  const setViewLang = (id, lang) => setViewLangMap(m => ({ ...m, [id]: lang }));
  const [loading,      setLoading]      = useState(null);
  const [streaming,    setStreaming]     = useState({});
  const [localLangs,   setLocalLangs]   = useState({});
  const [error,        setError]        = useState(null);
  const [copied,       setCopied]       = useState(false);
  const [batchMode,    setBatchMode]    = useState(false);
  const [batchDone,    setBatchDone]    = useState(0);
  const [batchStep,    setBatchStep]    = useState("");
  const [autoTranslate,setAutoTranslate] = usePersistentState("script_autotrans",  true);
  const [search,      setSearch]      = usePersistentState("script_search",     "");
  const [filterStatus,setFilterStatus]= usePersistentState("script_status",     "all");
  const [filterLang,  setFilterLang]  = usePersistentState("script_lang",       "");
  const [filterArch,  setFilterArch]  = usePersistentState("script_archetype",  "");
  const [filterEra,   setFilterEra]   = usePersistentState("script_era",        "");
  const [sortBy,      setSortBy]      = usePersistentState("script_sort",       "date_desc");
  const [showFilters, setShowFilters] = usePersistentState("script_showfilt",   false);

  // ── Derived state ──
  const allReady = stories.filter(s => ["approved","scripted"].includes(s.status));

  const ready = useMemo(() => {
    let list = allReady.filter(s => {
      if (filterStatus === "unscripted" && s.script) return false;
      if (filterStatus === "scripted"   && !s.script) return false;
      if (filterArch && s.archetype !== filterArch) return false;
      if (filterEra  && s.era       !== filterEra)  return false;
      if (filterLang) {
        const hasFr = !!(localLangs[s.id]?.fr ?? s.script_fr);
        const hasEs = !!(localLangs[s.id]?.es ?? s.script_es);
        const hasPt = !!(localLangs[s.id]?.pt ?? s.script_pt);
        if (filterLang === "fr" && hasFr) return false;
        if (filterLang === "es" && hasEs) return false;
        if (filterLang === "pt" && hasPt) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const players = Array.isArray(s.players) ? s.players.join(" ") : (s.players||"");
        if (![(s.title||""), players].some(f => f.toLowerCase().includes(q))) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sortBy === "date_desc")  return new Date(b.created_at||0) - new Date(a.created_at||0);
      if (sortBy === "date_asc")   return new Date(a.created_at||0) - new Date(b.created_at||0);
      if (sortBy === "score_desc") return (b.score_total||0) - (a.score_total||0);
      if (sortBy === "title_asc")  return (a.title||"").localeCompare(b.title||"");
      return 0;
    });
    return list;
  }, [allReady, filterStatus, filterLang, filterArch, filterEra, search, sortBy, localLangs]);

  const activeFilterCount = [filterStatus!=="all", filterLang, filterArch, filterEra].filter(Boolean).length;
  const clearFilters = () => { setFilterStatus("all"); setFilterLang(""); setFilterArch(""); setFilterEra(""); setSearch(""); setSortBy("date_desc"); };

  const focusedStory = ready[focusedIdx] || null;

  // Get script text — check local cache first, then story props
  const getScript = (story, lang) => {
    if (!story) return null;
    if (lang === "en") return streaming[story.id] !== undefined ? streaming[story.id] : story.script;
    return localLangs[story.id]?.[lang] ?? story[`script_${lang}`] ?? null;
  };

  // Get all available langs for a story
  const getAvailableLangs = (story) => {
    return LANGS.filter(l => !!getScript(story, l.key));
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (shouldIgnoreFromInput()) return;
      if (!focusedStory) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = e.key === "ArrowDown"
          ? Math.min(focusedIdx + 1, ready.length - 1)
          : Math.max(focusedIdx - 1, 0);
        setFocusedIdx(next);
        setTimeout(() => {
          document.getElementById(`script-${ready[next]?.id}`)?.scrollIntoView({ block:"center", behavior:"smooth" });
        }, 50);
      }
      if (e.key === "ArrowRight") { e.preventDefault(); setExpandedIds(s => { const n = new Set(s); n.add(focusedStory.id); return n; }); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); setExpandedIds(s => { const n = new Set(s); n.delete(focusedStory.id); return n; }); }
      if (e.key === " ") { e.preventDefault(); setExpandedIds(s => { const n = new Set(s); n.has(focusedStory.id) ? n.delete(focusedStory.id) : n.add(focusedStory.id); return n; }); }
      // Alt+G = generate/rewrite focused story
      if (matches(e, SHORTCUTS.scriptGenerate.combo)) { e.preventDefault(); if (!loading) generate(focusedStory); }
      // Alt+T = translate all for focused story
      if (matches(e, SHORTCUTS.scriptTranslate.combo)) { e.preventDefault(); if (!loading && focusedStory.script) translateAll(focusedStory); }
      // Cmd+C when expanded = copy current lang
      if (matches(e, SHORTCUTS.scriptCopy.combo) && expandedIds.has(focusedStory.id)) {
        const vl2 = getViewLang(focusedStory.id);
        const sc = getScript(focusedStory, vl2);
        if (sc) { navigator.clipboard.writeText(sc); setCopied(`${focusedStory.id}-${vl2}`); setTimeout(()=>setCopied(false),2000); }
      }
      // 1-4 keys = switch lang when expanded
      if (expandedIds.has(focusedStory.id)) {
        const langMap = { "1":"en","2":"fr","3":"es","4":"pt" };
        if (langMap[e.key]) { const l = langMap[e.key]; if (getScript(focusedStory, l)) setViewLang(focusedStory.id, l); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedIdx, focusedStory, ready, loading, expandedIds, viewLangMap, localLangs, streaming]);

  const translateLang = async (story, lang, scriptText) => {
    const { text } = await runPrompt({
      type:    "translate-script",
      params:  { script: scriptText, lang_key: lang },
      context: { story_id: story.id },
      parse:   false,
    });
    return text;
  };

  const generate = async (story, withTranslate = autoTranslate) => {
    setLoading(`en-${story.id}`); setError(null);
    setStreaming(s => ({ ...s, [story.id]: "" }));
    try {
      const { text: enText } = await runPromptStream({
        type:    "generate-script",
        params:  { story },
        context: { story_id: story.id },
        onChunk: (live) => setStreaming(s => ({ ...s, [story.id]: live })),
      });
      setStreaming(s => { const n = {...s}; delete n[story.id]; return n; });
      await onUpdate(story.id, { script: enText, script_version: (story.script_version||0)+1, status: "scripted" });

      // Auto-suggest reach score if not already set — non-blocking
      if (!story.reach_score) {
        try {
          const { parsed } = await runPrompt({
            type:    "reach-score",
            params:  { story },
            context: { story_id: story.id },
          });
          if (parsed?.reach_score != null) {
            await onUpdate(story.id, { reach_score: parsed.reach_score });
          }
        } catch {} // reach score is non-blocking
      }

      if (withTranslate) {
        const newLangs = {};
        for (const lang of ["fr","es","pt"]) {
          setLoading(`${lang}-${story.id}`);
          const translated = await translateLang(story, lang, enText);
          newLangs[lang] = translated;
          setLocalLangs(prev => ({ ...prev, [story.id]: { ...(prev[story.id]||{}), [lang]: translated } }));
          await onUpdate(story.id, { [`script_${lang}`]: translated });
          await new Promise(r => setTimeout(r, 300));
        }
      }
    } catch (err) { setError(err.message); } finally { setLoading(null); }
  };

  const generateAll = async () => {
    const queue = ready.filter(s => !s.script);
    setBatchMode(true); setBatchDone(0); setError(null);
    for (let i = 0; i < queue.length; i++) {
      const s = queue[i];
      setBatchStep(s.title.length > 35 ? s.title.slice(0,35)+"..." : s.title);
      await generate(s, autoTranslate);
      setBatchDone(i + 1);
      if (i < queue.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    setBatchMode(false); setBatchStep("");
  };

  const translateAll = async (story) => {
    setError(null);
    try {
      const scriptText = story.script;
      for (const lang of ["fr","es","pt"]) {
        if (getScript(story, lang)) continue;
        setLoading(`${lang}-${story.id}`);
        const translated = await translateLang(story, lang, scriptText);
        setLocalLangs(prev => ({ ...prev, [story.id]: { ...(prev[story.id]||{}), [lang]: translated } }));
        await onUpdate(story.id, { [`script_${lang}`]: translated });
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) { setError(err.message); } finally { setLoading(null); }
  };

  const exportVoicePack = async (story) => {
    const slug = story.title.slice(0,30).replace(/[^a-zA-Z0-9]/g,"-").toLowerCase();
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    LANGS.forEach(l => {
      const sc = getScript(story, l.key);
      if (sc) zip.file(`UC-${slug}_${l.key}.txt`, sc);
    });
    const blob = await zip.generateAsync({ type:"blob" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `UC-${slug}-voice-pack.zip`; a.click();
  };

  const unscripted = ready.filter(s => !s.script);
  const STEPS = autoTranslate ? ["EN","FR","ES","PT"] : ["EN"];

  if (!ready.length) return (
    <div style={{ textAlign:"center", padding:"80px 0", color:"var(--t4)" }} className="animate-fade-in">
      <FileText size={32} style={{ margin:"0 auto 12px", display:"block", opacity:0.25 }} />
      <div style={{ fontSize:13 }}>Approve stories to start scripting</div>
    </div>
  );

  return (
    <div className="animate-fade-in">

      {/* Options + batch bar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:10, background:"var(--bg2)", border:"1px solid var(--border)", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:12, color:"var(--t2)" }}>Auto-translate</span>
          <button onClick={() => setAutoTranslate(a=>!a)} style={{ width:36, height:20, borderRadius:10, border:"none", cursor:"pointer", background: autoTranslate ? "var(--t1)" : "var(--t4)", position:"relative", transition:"background 0.2s" }}>
            <div style={{ position:"absolute", top:2, left: autoTranslate ? 18 : 2, width:16, height:16, borderRadius:"50%", background:"var(--bg)", transition:"left 0.2s" }} />
          </button>
          {batchMode && batchStep && (
            <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:8 }}>
              <ProgressSteps steps={STEPS} current={
                loading?.startsWith("fr") ? 1 : loading?.startsWith("es") ? 2 : loading?.startsWith("pt") ? 3 : 0
              } />
              <span style={{ fontSize:11, color:"var(--t3)" }}>{batchStep}</span>
              <span style={{ fontSize:11, color:"var(--t4)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}>{batchDone}/{unscripted.length + batchDone}</span>
            </div>
          )}
        </div>
        {unscripted.length > 0 && !batchMode && (
          <button onClick={generateAll} disabled={!!loading} style={{
            padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:600,
            background:"var(--t1)", color:"var(--bg)", border:"none", cursor:loading?"not-allowed":"pointer",
            display:"flex", alignItems:"center", gap:5,
          }}>
            <Layers size={12} /> Generate all ({unscripted.length})
          </button>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:8, marginBottom:12, alignItems:"center" }}>
        <div style={{ position:"relative" }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--t3)", pointerEvents:"none" }} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title or player..."
            style={{ width:"100%", padding:"8px 12px 8px 32px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border-in)", color:"var(--t1)", fontSize:13, outline:"none" }} />
        </div>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ padding:"8px 10px", borderRadius:8, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="score_desc">Score: high → low</option>
          <option value="title_asc">Title A → Z</option>
        </select>
        <button onClick={() => setShowFilters(f=>!f)} style={{
          height:36, padding:"0 12px", borderRadius:8, fontSize:12, fontWeight:500,
          background: showFilters || activeFilterCount > 0 ? "var(--t1)" : "var(--fill2)",
          color:      showFilters || activeFilterCount > 0 ? "var(--bg)"  : "var(--t2)",
          border:"1px solid var(--border)", cursor:"pointer", display:"flex", alignItems:"center", gap:6,
        }}>
          <SlidersHorizontal size={13} /> Filters
          {activeFilterCount > 0 && <span style={{ width:16, height:16, borderRadius:"50%", background:"var(--bg)", color:"var(--t1)", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{activeFilterCount}</span>}
        </button>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} style={{ height:36, padding:"0 10px", borderRadius:8, fontSize:12, color:"var(--t3)", background:"transparent", border:"1px solid var(--border)", cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {showFilters && (
        <div className="animate-fade-in" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:8, padding:"12px 14px", borderRadius:10, background:"var(--bg2)", border:"1px solid var(--border)", marginBottom:12 }}>
          {/* Status */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Status</div>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ width:"100%", padding:"6px 8px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
              <option value="all">All</option>
              <option value="unscripted">No script yet</option>
              <option value="scripted">Has script</option>
            </select>
          </div>
          {/* Missing lang */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Missing lang</div>
            <select value={filterLang} onChange={e=>setFilterLang(e.target.value)} style={{ width:"100%", padding:"6px 8px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
              <option value="">Any</option>
              <option value="fr">Missing FR</option>
              <option value="es">Missing ES</option>
              <option value="pt">Missing PT</option>
            </select>
          </div>
          {/* Archetype */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Archetype</div>
            <select value={filterArch} onChange={e=>setFilterArch(e.target.value)} style={{ width:"100%", padding:"6px 8px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
              <option value="">Any</option>
              {[...new Set(allReady.map(s=>s.archetype).filter(Boolean))].sort().map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {/* Era */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Era</div>
            <select value={filterEra} onChange={e=>setFilterEra(e.target.value)} style={{ width:"100%", padding:"6px 8px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
              <option value="">Any</option>
              {[...new Set(allReady.map(s=>s.era).filter(Boolean))].sort().map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Result count */}
      {(search || activeFilterCount > 0) && (
        <div style={{ fontSize:12, color:"var(--t3)", marginBottom:10 }}>
          {ready.length} {ready.length === 1 ? "story" : "stories"} found
        </div>
      )}

      {/* Story list */}
      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
        {ready.map((s, idx) => {
          const isFocused   = idx === focusedIdx;
          const isExpanded  = expandedIds.has(s.id);
          const isStreaming = s.id in streaming;
          const availLangs  = getAvailableLangs(s);
          const ac          = ACCENT[s.archetype] || "var(--border)";
          const isLoadingEn  = loading === `en-${s.id}`;
          const isLoadingFr  = loading === `fr-${s.id}`;
          const isLoadingEs  = loading === `es-${s.id}`;
          const isLoadingPt  = loading === `pt-${s.id}`;
          const isLoadingThis = isLoadingEn || isLoadingFr || isLoadingEs || isLoadingPt;
          const currentStep  = isLoadingEn ? 0 : isLoadingFr ? 1 : isLoadingEs ? 2 : isLoadingPt ? 3 : -1;

          return (
            <div key={s.id} id={`script-${s.id}`}
              onClick={() => setFocusedIdx(idx)}
              style={{
                borderRadius:8, marginBottom:2, cursor:"pointer",
                borderTop:    isFocused ? "1px solid var(--t2)" : "1px solid var(--border2)",
                borderRight:  isFocused ? "1px solid var(--t2)" : "1px solid var(--border2)",
                borderBottom: isFocused ? "1px solid var(--t2)" : "1px solid var(--border2)",
                borderLeft:   `3px solid ${ac}`,
                background:   isFocused ? "var(--fill2)" : "var(--card)",
                transition:   "background 0.1s",
              }}>

              {/* Header row */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px" }}
                onClick={e => { e.stopPropagation(); setFocusedIdx(idx); setExpandedIds(ex => { const n = new Set(ex); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; }); }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:500, color:"var(--t1)", letterSpacing:0, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--t3)", flexWrap:"wrap" }}>
                    <span style={{ color:ac, fontWeight:500 }}>{s.archetype}</span>
                    {s.era && <><span style={{color:"var(--t4)"}}>·</span><span>{s.era}</span></>}
                    {s.script && <><span style={{color:"var(--t4)"}}>·</span><span style={{fontFamily:"ui-monospace,'SF Mono',Menlo,monospace",fontSize:11}}>v{s.script_version||1} · {wc(s.script)}w</span></>}
                    {isLoadingThis
                      ? <ProgressSteps steps={STEPS} current={currentStep} />
                      : availLangs.map(l => (
                          <span key={l.key} style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{l.label}</span>
                        ))
                    }
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, marginLeft:12 }}>
                  {/* Quick generate button */}
                  {!isLoadingThis && (
                    <button onClick={e=>{e.stopPropagation();generate(s);}} disabled={!!loading} style={{
                      padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:500,
                      background:"var(--fill2)", border:"1px solid var(--border)",
                      color:"var(--t2)", cursor:loading?"not-allowed":"pointer",
                      display:"flex", alignItems:"center", gap:4,
                    }}
                    onMouseEnter={e=>{e.currentTarget.style.background="var(--t1)";e.currentTarget.style.color="var(--bg)";}}
                    onMouseLeave={e=>{e.currentTarget.style.background="var(--fill2)";e.currentTarget.style.color="var(--t2)";}}>
                      <RefreshCw size={11} /> {s.script ? "Rewrite" : "Generate"}
                    </button>
                  )}
                  {isExpanded ? <ChevronDown size={15} color="var(--t4)" /> : <ChevronRight size={15} color="var(--t4)" />}
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="animate-fade-in" style={{ padding:"0 14px 14px", borderTop:"1px solid var(--border2)" }}>
                  {s.angle && <div style={{ fontSize:13, color:"var(--t3)", lineHeight:1.6, margin:"10px 0 8px" }}>{s.angle}</div>}

                  {/* Lang tabs */}
                  {s.script && (
                    <div style={{ display:"flex", gap:4, marginBottom:10 }}>
                      {LANGS.map((l, li) => {
                        const has       = !!getScript(s, l.key);
                        const isLoading = loading === `${l.key}-${s.id}`;
                        const vl        = getViewLang(s.id);
                        return (
                          <button key={l.key} onClick={()=>has&&setViewLang(s.id,l.key)} style={{
                            padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:600,
                            background: vl===l.key&&has ? "var(--t1)" : "var(--fill2)",
                            color: vl===l.key&&has ? "var(--bg)" : has ? "var(--t2)" : "var(--t4)",
                            border:"1px solid var(--border)", cursor:has?"pointer":"default",
                            display:"flex", alignItems:"center", gap:4,
                          }}>
                            {isLoading
                              ? <div className="anim-spin" style={{ width:8, height:8, borderRadius:"50%", border:"1px solid var(--t4)", borderTopColor:"var(--t1)" }} />
                              : has ? <Check size={9} /> : null
                            }
                            {l.label}
                            <span style={{fontSize:9,color:"var(--t4)"}}>{li+1}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Script text */}
                  {getScript(s, getViewLang(s.id)) && (
                    <div style={{ padding:"14px 16px", borderRadius:8, background:"var(--bg2)", marginBottom:10, maxHeight:260, overflowY:"auto", position:"relative" }}>
                      {isStreaming && <div style={{ position:"absolute", top:10, right:12, width:6, height:6, borderRadius:"50%", background:"var(--t1)", animation:"pulse 1s ease-in-out infinite" }} />}
                      <div className="type-script" style={{ fontSize:14, color:"var(--t2)", lineHeight:1.85, whiteSpace:"pre-wrap" }}>
                        {getScript(s, getViewLang(s.id))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <button onClick={()=>generate(s)} disabled={!!loading} style={{
                      flex:1, minWidth:110, padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                      background: isLoadingEn ? "var(--fill2)" : "var(--t1)",
                      color: isLoadingEn ? "var(--t3)" : "var(--bg)",
                      border:"none", cursor:loading?"not-allowed":"pointer",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                    }}>
                      <RefreshCw size={12} />
                      {isLoadingEn ? "Writing..." : s.script ? "Rewrite EN" : "Generate"}
                      {autoTranslate && !isLoadingThis && <span style={{fontSize:10,opacity:0.6}}>+ all langs</span>}
                    </button>

                    {s.script && availLangs.length < 4 && (
                      <button onClick={()=>translateAll(s)} disabled={!!loading} style={{
                        padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                        background:"var(--fill2)", color:"var(--t1)",
                        border:"0.5px solid var(--border)", cursor:loading?"not-allowed":"pointer",
                        display:"flex", alignItems:"center", gap:5,
                      }}>
                        <Layers size={12} />
                        {isLoadingFr||isLoadingEs||isLoadingPt ? "Translating..." : "Translate missing"}
                      </button>
                    )}

                    {getScript(s, getViewLang(s.id)) && !isStreaming && (
                      <button onClick={()=>{ const vl=getViewLang(s.id); navigator.clipboard.writeText(getScript(s,vl)); setCopied(`${s.id}-${vl}`); setTimeout(()=>setCopied(false),2000); }} style={{
                        padding:"8px 12px", borderRadius:7, fontSize:12, fontWeight:600,
                        background:"var(--fill2)", color: copied===`${s.id}-${getViewLang(s.id)}` ? "var(--t1)" : "var(--t2)",
                        border:"0.5px solid var(--border)", cursor:"pointer",
                        display:"flex", alignItems:"center", gap:5,
                      }}>
                        <Copy size={12} />{copied===`${s.id}-${getViewLang(s.id)}` ? "Copied!" : `Copy ${getViewLang(s.id).toUpperCase()}`}
                      </button>
                    )}

                    {availLangs.length >= 1 && (
                      <button onClick={()=>exportVoicePack(s)} style={{
                        padding:"8px 12px", borderRadius:7, fontSize:12, fontWeight:600,
                        background:"var(--fill2)", color:"var(--t2)",
                        border:"0.5px solid var(--border)", cursor:"pointer",
                        display:"flex", alignItems:"center", gap:5,
                      }} title="Download zip for ElevenLabs">
                        <Zap size={12} /> Voice pack
                      </button>
                    )}
                  </div>

                  {error && <div style={{ marginTop:8, fontSize:11, color:"var(--error)", background:"var(--error-bg)", border:"0.5px solid var(--error-border)", padding:"6px 10px", borderRadius:6 }}>{error}</div>}

                  {/* Shortcut hint */}
                  <div style={{ marginTop:10, fontSize:10, color:"var(--t4)", display:"flex", gap:10, flexWrap:"wrap" }}>
                    {[["⌥G","Generate/rewrite"],["⌥T","Translate all"],["1-4","Switch lang"],["→←","Expand/collapse"]].map(([k,v])=>(
                      <span key={k}><kbd style={{fontFamily:"ui-monospace,'SF Mono',Menlo,monospace",fontSize:9,padding:"1px 4px",borderRadius:3,background:"var(--bg3)",border:"1px solid var(--border)"}}>{k}</kbd> {v}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
