"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { FileText, ChevronRight, ChevronDown, RefreshCw, Copy, Check, Layers, Zap, X, Search, SlidersHorizontal, Mic, CheckCircle } from "lucide-react";
import { LANGS, SCRIPT_SYSTEM, ACCENT, FORMAT_MAP } from "@/lib/constants";
import { callClaude, callClaudeStream } from "@/lib/db";
import { executeProvider } from "@/lib/providers/index/providers-index";
import { downloadVoiceBlob, getVoiceStatus, getVoiceProvider, VOICE_PROVIDER_CONFIG } from "@/lib/providers/voice/providers-voice";

function wc(t) { return (t||"").trim().split(/\s+/).filter(w=>w.length>0).length; }

function ScoreBar({ score, label, max=25 }) {
  if (score == null) return null;
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

export default function ScriptView({ stories, onUpdate, settings }) {
  // ── All state above any early return ──
  const [focusedIdx,    setFocusedIdx]    = useState(0);
  const [expandedIds,   setExpandedIds]   = useState(new Set());
  const [selected,      setSelected]      = useState(new Set());
  const [viewLangMap,   setViewLangMap]   = useState({});
  const [loading,       setLoading]       = useState(null);
  const [streaming,     setStreaming]     = useState({});
  const [localLangs,    setLocalLangs]    = useState({});
  const [error,         setError]         = useState(null);
  const [copied,        setCopied]        = useState(false);
  const [batchMode,     setBatchMode]     = useState(false);
  const [batchDone,     setBatchDone]     = useState(0);
  const [batchStep,     setBatchStep]     = useState("");
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [search,        setSearch]        = useState("");
  const [filterLang,    setFilterLang]    = useState("");
  const [filterArch,    setFilterArch]    = useState("");
  const [filterEra,     setFilterEra]     = useState("");
  const [sortBy,        setSortBy]        = useState("date_desc");
  const [showFilters,   setShowFilters]   = useState(false);
  const [voiceLoading,  setVoiceLoading]  = useState({});
  const [voiceError,    setVoiceError]    = useState({});
  const [voiceDone,     setVoiceDone]     = useState({});
  const [editingId,     setEditingId]     = useState(null); // story id being edited inline
  const [editText,      setEditText]      = useState("");   // draft text

  const getViewLang = (id) => viewLangMap[id] || "en";
  const setViewLang = (id, lang) => setViewLangMap(m => ({ ...m, [id]: lang }));

  // ── Derived ──
  const allEligible = stories.filter(s => ["approved","scripted"].includes(s.status) && s.status !== "produced");

  const ready = useMemo(() => {
    let list = allEligible.filter(s => {
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
    // Always put scripted stories at the end
    list.sort((a, b) => {
      const aScripted = a.status === "scripted" && !!a.script ? 1 : 0;
      const bScripted = b.status === "scripted" && !!b.script ? 1 : 0;
      return aScripted - bScripted;
    });
    return list;
  }, [allEligible, filterLang, filterArch, filterEra, search, sortBy, localLangs]);

  const activeFilterCount = [filterLang, filterArch, filterEra].filter(Boolean).length;
  const clearFilters = () => { setFilterLang(""); setFilterArch(""); setFilterEra(""); setSearch(""); setSortBy("date_desc"); };

  const focusedStory  = ready[focusedIdx] || null;
  const unscripted    = ready.filter(s => !s.script);
  const STEPS         = autoTranslate ? ["EN","FR","ES","PT"] : ["EN"];

  const getScript = (story, lang) => {
    if (!story) return null;
    if (lang === "en") return streaming[story.id] !== undefined ? streaming[story.id] : story.script;
    return localLangs[story.id]?.[lang] ?? story[`script_${lang}`] ?? null;
  };

  const getAvailableLangs = (story) => LANGS.filter(l => !!getScript(story, l.key));

  // ── Scroll focused into view ──
  useEffect(() => {
    if (focusedStory) {
      setTimeout(() => {
        document.getElementById(`script-${focusedStory.id}`)?.scrollIntoView({ block:"center", behavior:"smooth" });
      }, 50);
    }
  }, [focusedIdx]);

  // ── Keyboard navigation ──
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (["INPUT","TEXTAREA","SELECT"].includes(tag)) return;
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
      // Space = select/deselect (not expand)
      if (e.key === " ")          { e.preventDefault(); setSelected(sel => { const n = new Set(sel); n.has(focusedStory.id) ? n.delete(focusedStory.id) : n.add(focusedStory.id); return n; }); }
      if (e.key === "Enter" && !e.metaKey) { e.preventDefault(); if (!loading && !focusedStory.script) generate(focusedStory); }
      if (e.metaKey && e.key === "g") { e.preventDefault(); if (!loading) generate(focusedStory); }
      if (e.metaKey && e.key === "t") { e.preventDefault(); if (!loading && focusedStory.script) translateAll(focusedStory); }
      if (e.metaKey && e.key === "a") { e.preventDefault(); setSelected(new Set(ready.map(s => s.id))); }
      // Cmd+E = edit script inline
      if (e.metaKey && e.key === "e") { e.preventDefault(); if (focusedStory?.script) { setEditingId(focusedStory.id); setEditText(getScript(focusedStory, getViewLang(focusedStory.id)) || ""); setExpandedIds(ex => { const n = new Set(ex); n.add(focusedStory.id); return n; }); } }
      if (e.key === "Escape") { setSelected(new Set()); }
      if (e.metaKey && e.key === "c" && expandedIds.has(focusedStory.id)) {
        const vl = getViewLang(focusedStory.id);
        const sc = getScript(focusedStory, vl);
        if (sc) { navigator.clipboard.writeText(sc); setCopied(`${focusedStory.id}-${vl}`); setTimeout(() => setCopied(false), 2000); }
      }
      if (expandedIds.has(focusedStory.id)) {
        const langMap = { "1":"en","2":"fr","3":"es","4":"pt" };
        if (langMap[e.key]) { const l = langMap[e.key]; if (getScript(focusedStory, l)) setViewLang(focusedStory.id, l); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedIdx, focusedStory, ready, loading, expandedIds, viewLangMap, localLangs, streaming]);

  // ── Script generation ──
  const translateLang = async (story, lang, scriptText) => {
    const langName = LANGS.find(l => l.key === lang)?.name || lang;
    const prompt = `Translate this Uncle Carter sports storytelling script to ${langName}. Keep the same tone: calm, warm, storytelling uncle. Translate "Forty seconds." and the closing line naturally. Same rhythm. 110-150 words.\n\nReturn ONLY the translated script.\n\nOriginal:\n${scriptText}`;
    return await callClaude(prompt, 600);
  };

  const generate = async (story, withTranslate = autoTranslate) => {
    setLoading(`en-${story.id}`); setError(null);
    setStreaming(s => ({ ...s, [story.id]: "" }));
    try {
      const prompt = `${SCRIPT_SYSTEM}\n\n---\n\nWrite an Uncle Carter episode script about:\nStory: ${story.angle||story.title}\nPlayer(s): ${story.players||"Unknown"}\nEra: ${story.era||"Unknown"}\nEmotional angle: ${story.archetype||"Pressure"}\n\n110-150 words. Pure script only.`;
      const enText = await callClaudeStream(prompt, 600, (live) => {
        setStreaming(s => ({ ...s, [story.id]: live }));
      });
      setStreaming(s => { const n = {...s}; delete n[story.id]; return n; });
      await onUpdate(story.id, { script: enText, script_version: (story.script_version||0)+1, status: "scripted" });

      if (!story.reach_score) {
        try {
          const reachPrompt = `You are scoring an Uncle Carter NBA story for reach potential.\n\nScore 0-100:\n- Name recognition (40%)\n- Recency (25%)\n- Search volume proxy (20%)\n- Trending relevance (15%)\n\nStory: "${story.title}"\nPlayers: ${story.players||"Unknown"}\nEra: ${story.era||"Unknown"}\nAngle: ${story.angle||""}\n\nReturn ONLY: { "reach_score": number, "reasoning": "1 sentence" }`;
          const reachText = await callClaude(reachPrompt, 200, "haiku");
          const clean = reachText.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
          let parsed = null;
          try { parsed = JSON.parse(clean); } catch {}
          if (!parsed) { const m = clean.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
          if (parsed?.reach_score) await onUpdate(story.id, { reach_score: Math.min(100, Math.max(0, Math.round(parsed.reach_score))) });
        } catch {}
      }

      if (withTranslate) {
        for (const lang of ["fr","es","pt"]) {
          setLoading(`${lang}-${story.id}`);
          const translated = await translateLang(story, lang, enText);
          setLocalLangs(prev => ({ ...prev, [story.id]: { ...(prev[story.id]||{}), [lang]: translated } }));
          await onUpdate(story.id, { [`script_${lang}`]: translated });
          await new Promise(r => setTimeout(r, 300));
        }
      }
    } catch (err) { setError(err.message); } finally { setLoading(null); }
  };

  const generateAll = async () => {
    const queue = unscripted;
    setBatchMode(true); setBatchDone(0); setError(null);
    for (let i = 0; i < queue.length; i++) {
      setBatchStep(queue[i].title.length > 35 ? queue[i].title.slice(0,35)+"..." : queue[i].title);
      await generate(queue[i], autoTranslate);
      setBatchDone(i + 1);
      if (i < queue.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    setBatchMode(false); setBatchStep("");
  };

  const generateSelected = async () => {
    const queue = ready.filter(s => selected.has(s.id) && !s.script);
    setBatchMode(true); setBatchDone(0); setError(null);
    for (let i = 0; i < queue.length; i++) {
      setBatchStep(queue[i].title.length > 35 ? queue[i].title.slice(0,35)+"..." : queue[i].title);
      await generate(queue[i], autoTranslate);
      setBatchDone(i + 1);
      if (i < queue.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    setBatchMode(false); setBatchStep(""); setSelected(new Set());
  };

  const translateAll = async (story) => {
    setError(null);
    try {
      for (const lang of ["fr","es","pt"]) {
        if (getScript(story, lang)) continue;
        setLoading(`${lang}-${story.id}`);
        const translated = await translateLang(story, lang, story.script);
        setLocalLangs(prev => ({ ...prev, [story.id]: { ...(prev[story.id]||{}), [lang]: translated } }));
        await onUpdate(story.id, { [`script_${lang}`]: translated });
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) { setError(err.message); } finally { setLoading(null); }
  };

  const saveEdit = async (story) => {
    const lang = getViewLang(story.id);
    const field = lang === "en" ? "script" : `script_${lang}`;
    setLocalLangs(prev => ({ ...prev, [story.id]: { ...(prev[story.id]||{}), [lang]: editText } }));
    await onUpdate(story.id, { [field]: editText });
    setEditingId(null);
    setEditText("");
  };

  const exportVoicePack = async (story) => {
    const slug = story.title.slice(0,30).replace(/[^a-zA-Z0-9]/g,"-").toLowerCase();
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    LANGS.forEach(l => { const sc = getScript(story, l.key); if (sc) zip.file(`UC-${slug}_${l.key}.txt`, sc); });
    const blob = await zip.generateAsync({ type:"blob" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `UC-${slug}-script-pack.zip`; a.click();
  };

  const generateVoiceForLang = async (story, lang, apiKey) => {
    const key = `${story.id}-${lang}`;
    setVoiceLoading(v => ({ ...v, [key]: true }));
    setVoiceError(v => { const n = {...v}; delete n[story.id]; return n; });
    try {
      const script = getScript(story, lang);
      if (!script) throw new Error(`No ${lang.toUpperCase()} script available.`);
      const slug = story.title.slice(0,30).replace(/[^a-zA-Z0-9]/g,"-").toLowerCase();
      const result = await executeProvider("voice", settings?.providers, { script, lang, storySlug: slug, apiKey });
      downloadVoiceBlob(result);
      setVoiceDone(v => ({ ...v, [key]: true }));
      const availKeys = LANGS.filter(l => !!getScript(story, l.key)).map(l => `${story.id}-${l.key}`);
      const allDone = availKeys.every(k => k === key || voiceDone[k]);
      if (allDone && story.status === "scripted") await onUpdate(story.id, { status: "produced" });
    } catch (err) {
      setVoiceError(v => ({ ...v, [story.id]: err.message }));
    } finally {
      setVoiceLoading(v => { const n = {...v}; delete n[key]; return n; });
    }
  };

  const generateAllVoices = async (story, apiKey) => {
    const langs = LANGS.filter(l => !!getScript(story, l.key)).map(l => l.key);
    for (const lang of langs) { await generateVoiceForLang(story, lang, apiKey); await new Promise(r => setTimeout(r, 500)); }
  };

  // ── Empty state ──
  if (!allEligible.length) return (
    <div style={{ textAlign:"center", padding:"80px 0", color:"var(--t4)" }} className="animate-fade-in">
      <FileText size={32} style={{ margin:"0 auto 12px", display:"block", opacity:0.25 }} />
      <div style={{ fontSize:13 }}>Approve stories in Pipeline to start scripting</div>
    </div>
  );

  return (
    <div className="animate-fade-in">

      {/* ── Options bar ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:10, background:"var(--bg2)", border:"1px solid var(--border)", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:12, color:"var(--t2)" }}>Auto-translate</span>
          <button onClick={() => setAutoTranslate(a => !a)} style={{ width:36, height:20, borderRadius:10, border:"none", cursor:"pointer", background: autoTranslate ? "var(--t1)" : "var(--t4)", position:"relative", transition:"background 0.2s" }}>
            <div style={{ position:"absolute", top:2, left: autoTranslate ? 18 : 2, width:16, height:16, borderRadius:"50%", background:"var(--bg)", transition:"left 0.2s" }} />
          </button>
          {batchMode && batchStep && (
            <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:8 }}>
              <ProgressSteps steps={STEPS} current={loading?.startsWith("fr") ? 1 : loading?.startsWith("es") ? 2 : loading?.startsWith("pt") ? 3 : 0} />
              <span style={{ fontSize:11, color:"var(--t3)" }}>{batchStep}</span>
              <span style={{ fontSize:11, color:"var(--t4)", fontFamily:"'DM Mono',monospace" }}>{batchDone}/{unscripted.length + batchDone}</span>
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

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div className="animate-fade-in" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderRadius:10, background:"var(--t1)", color:"var(--bg)", marginBottom:12 }}>
          <span style={{ fontSize:12, fontWeight:600 }}>{selected.size} selected</span>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={generateSelected} disabled={!!loading} style={{ padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:600, background:"var(--bg)", color:"var(--t1)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
              <Layers size={12} /> Generate scripts
            </button>
            <button onClick={() => ready.filter(s => selected.has(s.id) && s.script).forEach(s => translateAll(s))} disabled={!!loading} style={{ padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:600, background:"rgba(255,255,255,0.1)", color:"var(--bg)", border:"1px solid rgba(255,255,255,0.2)", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
              <Layers size={12} /> Translate missing
            </button>
            <button onClick={() => setSelected(new Set())} style={{ padding:"6px 10px", borderRadius:7, fontSize:12, background:"transparent", color:"rgba(255,255,255,0.5)", border:"none", cursor:"pointer" }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:8, marginBottom:12, alignItems:"center" }}>
        <div style={{ position:"relative" }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--t3)", pointerEvents:"none" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or player..."
            style={{ width:"100%", padding:"8px 12px 8px 32px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border-in)", color:"var(--t1)", fontSize:13, outline:"none" }} />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding:"8px 10px", borderRadius:8, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="score_desc">Score: high → low</option>
          <option value="title_asc">Title A → Z</option>
        </select>
        <button onClick={() => setShowFilters(f => !f)} style={{
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
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Missing lang</div>
            <select value={filterLang} onChange={e => setFilterLang(e.target.value)} style={{ width:"100%", padding:"6px 8px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
              <option value="">Any</option>
              <option value="fr">Missing FR</option>
              <option value="es">Missing ES</option>
              <option value="pt">Missing PT</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Archetype</div>
            <select value={filterArch} onChange={e => setFilterArch(e.target.value)} style={{ width:"100%", padding:"6px 8px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
              <option value="">Any</option>
              {[...new Set(allEligible.map(s => s.archetype).filter(Boolean))].sort().map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Era</div>
            <select value={filterEra} onChange={e => setFilterEra(e.target.value)} style={{ width:"100%", padding:"6px 8px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" }}>
              <option value="">Any</option>
              {[...new Set(allEligible.map(s => s.era).filter(Boolean))].sort().map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
      )}

      {(search || activeFilterCount > 0) && (
        <div style={{ fontSize:12, color:"var(--t3)", marginBottom:10 }}>
          {ready.length} {ready.length === 1 ? "story" : "stories"} found
        </div>
      )}

      {/* ── Story list ── */}
      <div style={{ display:"flex", flexDirection:"column", gap:"var(--card-gap, 2px)" }}>
        {ready.map((s, idx) => {
          // Show section divider when transitioning from approved → scripted
          const prevStatus = idx > 0 ? ready[idx-1].status : null;
          const showDivider = s.status === "scripted" && s.script && (idx === 0 || prevStatus === "approved");
          const isFocused     = idx === focusedIdx;
          const isExpanded    = expandedIds.has(s.id);
          const isSelected    = selected.has(s.id);
          const isStreaming   = s.id in streaming;
          const availLangs    = getAvailableLangs(s);
          const ac            = ACCENT[s.archetype] || "var(--border)";
          const fmt           = FORMAT_MAP[s.format];
          const players       = Array.isArray(s.players) ? s.players.join(", ") : (s.players||"");
          const hasScore      = s.score_total != null;
          const dateStr       = s.created_at ? new Date(s.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "";
          const isLoadingEn   = loading === `en-${s.id}`;
          const isLoadingFr   = loading === `fr-${s.id}`;
          const isLoadingEs   = loading === `es-${s.id}`;
          const isLoadingPt   = loading === `pt-${s.id}`;
          const isLoadingThis = isLoadingEn || isLoadingFr || isLoadingEs || isLoadingPt;
          const currentStep   = isLoadingEn ? 0 : isLoadingFr ? 1 : isLoadingEs ? 2 : isLoadingPt ? 3 : -1;

          return (
            <div key={s.id}>
            {showDivider && (
              <div style={{ display:"flex", alignItems:"center", gap:8, margin:"12px 0 8px", opacity:0.5 }}>
                <div style={{ flex:1, height:"0.5px", background:"var(--border)" }} />
                <span style={{ fontSize:10, color:"var(--t3)", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.06em" }}>Scripted — ready for production</span>
                <div style={{ flex:1, height:"0.5px", background:"var(--border)" }} />
              </div>
            )}
            <div id={`script-${s.id}`}
              onClick={() => setFocusedIdx(idx)}
              style={{
                borderRadius:8,
                borderTop:    isFocused ? "1px solid var(--t2)" : isSelected ? "1px solid var(--t1)" : "1px solid var(--border2)",
                borderRight:  isFocused ? "1px solid var(--t2)" : isSelected ? "1px solid var(--t1)" : "1px solid var(--border2)",
                borderBottom: isFocused ? "1px solid var(--t2)" : isSelected ? "1px solid var(--t1)" : "1px solid var(--border2)",
                borderLeft:   fmt ? `3px solid ${fmt.color}` : "3px solid var(--border2)",
                background:   isSelected ? "var(--fill2)" : "var(--card)",
                transition:   "background 0.1s",
              }}>

              {/* ── Main row — Pipeline-identical grid ── */}
              <div style={{ display:"grid", gridTemplateColumns:"24px 1fr auto auto", alignItems:"center", gap:10, padding:"var(--card-padding-y, 10px) var(--card-padding-x, 12px)", cursor:"pointer" }}
                onClick={e => { e.stopPropagation(); setFocusedIdx(idx); setExpandedIds(ex => { const n = new Set(ex); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; }); }}>

                {/* Checkbox */}
                <div onClick={e => { e.stopPropagation(); setSelected(sel => { const n = new Set(sel); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; }); }}
                  style={{ width:18, height:18, borderRadius:4, border:`1.5px solid ${isSelected ? "var(--t1)" : "var(--t4)"}`, background:isSelected ? "var(--t1)" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer" }}>
                  {isSelected && <Check size={11} color="var(--bg)" />}
                </div>

                {/* Content */}
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:500, color:"var(--t1)", letterSpacing:"-0.01em", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--t3)", flexWrap:"wrap" }}>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background:ac, display:"inline-block", flexShrink:0 }} />
                      <span style={{ color:ac, fontWeight:500 }}>{s.archetype}</span>
                    </span>
                    {s.era && <><span style={{color:"var(--t4)"}}>·</span><span>{s.era}</span></>}
                    {players && <><span style={{color:"var(--t4)"}}>·</span><span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:180 }}>{players}</span></>}
                    {s.script && <><span style={{color:"var(--t4)"}}>·</span><FileText size={11} color="var(--t3)" /><span style={{fontFamily:"'DM Mono',monospace",fontSize:10}}>{wc(s.script)}w</span></>}
                    {isLoadingThis
                      ? <ProgressSteps steps={STEPS} current={currentStep} />
                      : availLangs.map(l => (
                          <span key={l.key} style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{l.label}</span>
                        ))
                    }
                  </div>
                </div>

                {/* Score + reach + date */}
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0 }}>
                  {hasScore && <span style={{ fontSize:11, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"var(--t1)" }}>{s.score_total}</span>}
                  {s.reach_score != null && <span style={{ fontSize:10, color:"var(--t4)", fontFamily:"'DM Mono',monospace" }}>↗{s.reach_score}</span>}
                  {dateStr && <span style={{ fontSize:10, color:"var(--t4)", fontFamily:"'DM Mono',monospace" }}>{dateStr}</span>}
                </div>

                {/* Generate / Rewrite */}
                {!isLoadingThis && (
                  <button onClick={e => { e.stopPropagation(); generate(s); }} disabled={!!loading} style={{
                    padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:500,
                    background:"var(--fill2)", border:"1px solid var(--border)",
                    color:"var(--t2)", cursor:loading?"not-allowed":"pointer",
                    display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap", flexShrink:0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background="var(--t1)"; e.currentTarget.style.color="var(--bg)"; e.currentTarget.style.borderColor="var(--t1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="var(--fill2)"; e.currentTarget.style.color="var(--t2)"; e.currentTarget.style.borderColor="var(--border)"; }}>
                    <RefreshCw size={11} /> {s.script ? "Rewrite" : "Generate"}
                  </button>
                )}
              </div>

              {/* ── Expanded panel ── */}
              {isExpanded && (
                <div className="animate-fade-in" style={{ padding:"0 12px 14px 46px", borderTop:"1px solid var(--border2)" }}>
                  {s.angle && <div style={{ fontSize:13, color:"var(--t2)", lineHeight:1.7, marginTop:10, marginBottom:8 }}>{s.angle}</div>}
                  {s.hook  && <div style={{ fontSize:13, color:"var(--t3)", fontStyle:"italic", paddingLeft:12, borderLeft:"2px solid var(--border)", lineHeight:1.5, marginBottom:10 }}>"{s.hook}"</div>}
                  {players && <div style={{ fontSize:12, color:"var(--t3)", marginBottom:10, lineHeight:1.6 }}>{players}</div>}

                  {/* AI Score block */}
                  {hasScore && (
                    <div style={{ padding:"10px 12px", borderRadius:7, background:"var(--bg2)", border:"1px solid var(--border2)", marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <span style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>AI Score</span>
                        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                          {s.reach_score != null && <span style={{ fontSize:11, color:"var(--t3)" }}>↗ reach <span style={{ fontFamily:"'DM Mono',monospace", color:"var(--t2)", fontWeight:600 }}>{s.reach_score}</span></span>}
                          <span style={{ fontSize:13, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"var(--t1)" }}>{s.score_total}<span style={{ fontSize:10, color:"var(--t3)", fontWeight:400 }}>/100</span></span>
                        </div>
                      </div>
                      {s.score_emotional != null && (
                        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                          <ScoreBar score={s.score_emotional} label="Emotional depth" />
                          <ScoreBar score={s.score_obscurity} label="Obscurity" />
                          <ScoreBar score={s.score_visual}    label="Visual potential" />
                          <ScoreBar score={s.score_hook}      label="Hook strength" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Lang tabs */}
                  {s.script && (
                    <div style={{ display:"flex", gap:4, marginBottom:10 }}>
                      {LANGS.map((l, li) => {
                        const has       = !!getScript(s, l.key);
                        const isLoading = loading === `${l.key}-${s.id}`;
                        const vl        = getViewLang(s.id);
                        return (
                          <button key={l.key} onClick={() => has && setViewLang(s.id, l.key)} style={{
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
                            <span style={{ fontSize:9, color:"var(--t4)" }}>{li+1}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Script text — editable when Cmd+E triggered */}
                  {getScript(s, getViewLang(s.id)) && (
                    editingId === s.id ? (
                      <div style={{ marginBottom:10 }}>
                        <textarea
                          autoFocus
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          style={{
                            width:"100%", minHeight:200, padding:"14px 16px", borderRadius:8,
                            background:"var(--bg2)", border:"1px solid var(--t2)",
                            fontSize:14, color:"var(--t1)", lineHeight:1.85,
                            fontFamily:"Georgia, serif", resize:"vertical", outline:"none",
                            boxSizing:"border-box",
                          }}
                        />
                        <div style={{ display:"flex", gap:6, marginTop:6 }}>
                          <button onClick={() => saveEdit(s)} style={{
                            padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                            background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer",
                            display:"flex", alignItems:"center", gap:5,
                          }}>
                            <Check size={12} /> Save
                          </button>
                          <button onClick={() => { setEditingId(null); setEditText(""); }} style={{
                            padding:"6px 12px", borderRadius:7, fontSize:12,
                            background:"var(--fill2)", color:"var(--t3)", border:"1px solid var(--border)", cursor:"pointer",
                          }}>
                            Cancel
                          </button>
                          <span style={{ fontSize:10, color:"var(--t4)", alignSelf:"center", marginLeft:4 }}>
                            {editText.trim().split(/\s+/).filter(Boolean).length} words
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding:"14px 16px", borderRadius:8, background:"var(--bg2)", marginBottom:10, maxHeight:260, overflowY:"auto", position:"relative", cursor:"text" }}
                        onDoubleClick={() => { setEditingId(s.id); setEditText(getScript(s, getViewLang(s.id)) || ""); }}>
                        {isStreaming && <div style={{ position:"absolute", top:10, right:12, width:6, height:6, borderRadius:"50%", background:"var(--t1)", animation:"pulse 1s ease-in-out infinite" }} />}
                        <div style={{ fontSize:14, color:"var(--t2)", lineHeight:1.85, fontFamily:"Georgia, serif", whiteSpace:"pre-wrap" }}>
                          {getScript(s, getViewLang(s.id))}
                        </div>
                        <div style={{ position:"absolute", bottom:8, right:10, fontSize:9, color:"var(--t4)" }}>double-click or ⌘E to edit</div>
                      </div>
                    )
                  )}

                  {/* Action buttons */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <button onClick={() => generate(s)} disabled={!!loading} style={{
                      flex:1, minWidth:110, padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                      background: isLoadingEn ? "var(--fill2)" : "var(--t1)",
                      color: isLoadingEn ? "var(--t3)" : "var(--bg)",
                      border:"none", cursor:loading?"not-allowed":"pointer",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                    }}>
                      <RefreshCw size={12} />
                      {isLoadingEn ? "Writing..." : s.script ? "Rewrite EN" : "Generate"}
                      {autoTranslate && !isLoadingThis && <span style={{ fontSize:10, opacity:0.6 }}>+ all langs</span>}
                    </button>

                    {s.script && availLangs.length < 4 && (
                      <button onClick={() => translateAll(s)} disabled={!!loading} style={{
                        padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                        background:"var(--fill2)", color:"var(--t1)",
                        border:"1px solid var(--border)", cursor:loading?"not-allowed":"pointer",
                        display:"flex", alignItems:"center", gap:5,
                      }}>
                        <Layers size={12} />
                        {isLoadingFr||isLoadingEs||isLoadingPt ? "Translating..." : "Translate missing"}
                      </button>
                    )}

                    {getScript(s, getViewLang(s.id)) && !isStreaming && (
                      <button onClick={() => { const vl=getViewLang(s.id); navigator.clipboard.writeText(getScript(s,vl)); setCopied(`${s.id}-${vl}`); setTimeout(()=>setCopied(false),2000); }} style={{
                        padding:"8px 12px", borderRadius:7, fontSize:12, fontWeight:600,
                        background:"var(--fill2)", color: copied===`${s.id}-${getViewLang(s.id)}` ? "var(--t1)" : "var(--t2)",
                        border:"1px solid var(--border)", cursor:"pointer",
                        display:"flex", alignItems:"center", gap:5,
                      }}>
                        <Copy size={12} />{copied===`${s.id}-${getViewLang(s.id)}` ? "Copied!" : `Copy ${getViewLang(s.id).toUpperCase()}`}
                      </button>
                    )}

                    {availLangs.length >= 1 && (
                      <button onClick={() => exportVoicePack(s)} style={{
                        padding:"8px 12px", borderRadius:7, fontSize:12, fontWeight:600,
                        background:"var(--fill2)", color:"var(--t2)",
                        border:"1px solid var(--border)", cursor:"pointer",
                        display:"flex", alignItems:"center", gap:5,
                      }}>
                        <Zap size={12} /> Script pack
                      </button>
                    )}
                  </div>

                  {error && <div style={{ marginTop:8, fontSize:11, color:"var(--t3)" }}>{error}</div>}

                  {/* Voice section */}
                  {s.script && (() => {
                    const vStatus      = getVoiceStatus(settings);
                    const vProvider    = getVoiceProvider(settings);
                    const vConfig      = VOICE_PROVIDER_CONFIG[vProvider] || {};
                    const isConfigured = vStatus === "configured";
                    const needsKey     = vStatus === "needs_key";
                    const vErr         = voiceError[s.id];
                    return (
                      <div style={{ marginTop:12, paddingTop:12, borderTop:"0.5px solid var(--border2)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                          <Mic size={12} color="var(--t3)" />
                          <span style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                            Voice · {vConfig.label || vProvider}
                          </span>
                        </div>
                        {!isConfigured && !needsKey && (
                          <div style={{ fontSize:11, color:"var(--t4)", padding:"8px 10px", borderRadius:7, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
                            No voice provider configured. Set one up in Settings → Providers.
                          </div>
                        )}
                        {needsKey && (
                          <div style={{ fontSize:11, color:"var(--t4)", padding:"8px 10px", borderRadius:7, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
                            {vConfig.label} configured but API key missing. Add it in Settings → Providers.
                          </div>
                        )}
                        {isConfigured && (
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                            {LANGS.filter(l => !!getScript(s, l.key)).map(l => {
                              const vKey       = `${s.id}-${l.key}`;
                              const isVLoading = !!voiceLoading[vKey];
                              const isDone     = !!voiceDone[vKey];
                              return (
                                <button key={l.key} onClick={() => generateVoiceForLang(s, l.key, settings?.providers?.voice?.api_key)} disabled={isVLoading} style={{
                                  padding:"6px 12px", borderRadius:6, fontSize:11, fontWeight:600,
                                  background: isDone ? "rgba(74,155,127,0.1)" : "var(--fill2)",
                                  color: isDone ? "#4A9B7F" : isVLoading ? "var(--t4)" : "var(--t2)",
                                  border:`0.5px solid ${isDone ? "rgba(74,155,127,0.3)" : "var(--border)"}`,
                                  cursor: isVLoading ? "not-allowed" : "pointer",
                                  display:"flex", alignItems:"center", gap:4,
                                }}>
                                  {isVLoading ? <div className="anim-spin" style={{ width:8, height:8, borderRadius:"50%", border:"1px solid var(--t4)", borderTopColor:"var(--t1)" }} /> : isDone ? <Check size={9} /> : <Mic size={9} />}
                                  {l.label}
                                </button>
                              );
                            })}
                            <button onClick={() => generateAllVoices(s, settings?.providers?.voice?.api_key)} disabled={Object.keys(voiceLoading).some(k => k.startsWith(s.id))} style={{
                              padding:"6px 12px", borderRadius:6, fontSize:11, fontWeight:600,
                              background:"var(--fill2)", color:"var(--t2)", border:"0.5px solid var(--border)", cursor:"pointer",
                              display:"flex", alignItems:"center", gap:4,
                            }}>
                              <Layers size={9} /> All langs
                            </button>
                          </div>
                        )}
                        {vErr && <div style={{ marginTop:6, fontSize:11, color:"#C0666A" }}>{vErr}</div>}
                      </div>
                    );
                  })()}

                  {/* Shortcuts */}
                  <div style={{ marginTop:10, fontSize:10, color:"var(--t4)", display:"flex", gap:10, flexWrap:"wrap" }}>
                    {[["Enter","Generate"],["⌘G","Rewrite"],["⌘E","Edit script"],["⌘T","Translate"],["Space","Select"],["⌘A","Select all"],["→←","Expand/collapse"]].map(([k,v]) => (
                      <span key={k}><kbd style={{ fontFamily:"'DM Mono',monospace", fontSize:9, padding:"1px 4px", borderRadius:3, background:"var(--bg3)", border:"1px solid var(--border)" }}>{k}</kbd> {v}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </div>
          );
        })}
      </div>

      {ready.length === 0 && allEligible.length > 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"var(--t4)" }}>
          <div style={{ fontSize:13 }}>No stories match your filters</div>
          {activeFilterCount > 0 && <button onClick={clearFilters} style={{ marginTop:10, fontSize:12, color:"var(--t2)", background:"transparent", border:"none", cursor:"pointer", textDecoration:"underline" }}>Clear filters</button>}
        </div>
      )}
    </div>
  );
}
