"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Check, X, Star, Plus, Play, Pause, Trash2, Target, RefreshCw } from "lucide-react";
import { suggestFormat } from "@/lib/constants";
import { runPrompt, runPromptStream } from "@/lib/ai/runner";
import { auditStoryQuality, qualityGatePatch } from "@/lib/qualityGate";
import { brandConfigForPrompt, getContentTemplate, getBrandTaxonomy, subjectText } from "@/lib/brandConfig";
import { tenantStorageKey, normalizeTenant } from "@/lib/brand";
import { attachAdaptiveScore } from "@/lib/adaptiveScoring";

function ScoreBar({ score, label, max = 25 }) {
  if (score == null) return null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ fontSize:10, color:"var(--t3)", width:90, flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:3, borderRadius:2, background:"var(--bg3)", overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${(score/max)*100}%`, background:"var(--t1)", borderRadius:2 }} />
      </div>
      <span style={{ fontSize:10, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:"var(--t2)", width:20, textAlign:"right" }}>{score}</span>
    </div>
  );
}

async function scoreStories(stories, settings, tenant) {
  const { parsed } = await runPrompt({
    type:   "score-story",
    params: { stories, brand_config: brandConfigForPrompt(settings) },
    context: {
      workspace_id: tenant?.workspace_id,
      brand_profile_id: tenant?.brand_profile_id,
    },
  });
  return (parsed || []).map((score, index) => {
    const story = stories[(score.index || index + 1) - 1] || {};
    return {
      ...score,
      adaptive_score: attachAdaptiveScore(story, settings, score).metadata.adaptive_score,
    };
  });
}

export default function ResearchView({ stories, onAddStories, prefill, onPrefillUsed, settings, tenant }) {
  const brandTaxonomy = getBrandTaxonomy(settings);
  const programmes = brandTaxonomy.programmes;
  const programmeMap = brandTaxonomy.programme_map;
  const archetypes = brandTaxonomy.archetypes;
  const eras = brandTaxonomy.eras;
  const subjects = brandTaxonomy.subjects;
  const contentTemplates = brandTaxonomy.content_templates || [];
  // Search params
  const [topic,     setTopic]     = useState("");
  const [count,     setCount]     = useState("8");
  const [era,       setEra]       = useState("");
  const [team,      setTeam]      = useState("");
  const [archetype, setArchetype] = useState("");
  const [format,    setFormat]    = useState("");
  const [templateId, setTemplateId] = useState(contentTemplates[0]?.id || "narrative_story");

  // Tenant-scoped localStorage keys — prevents cross-brand result contamination
  const _t = normalizeTenant(tenant);
  const resKey    = tenantStorageKey("uc_research_results", _t);
  const scoresKey = tenantStorageKey("uc_research_scores",  _t);

  // Results — persisted in tenant-scoped localStorage so they survive page reload
  const [results, setResults] = useState(() => {
    try { const r = localStorage.getItem(resKey); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [scores, setScores] = useState(() => {
    try { const s = localStorage.getItem(scoresKey); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  // Reload when tenant switches (component stays mounted)
  useEffect(() => {
    try { const r = localStorage.getItem(resKey); setResults(r ? JSON.parse(r) : []); } catch { setResults([]); }
    try { const s = localStorage.getItem(scoresKey); setScores(s ? JSON.parse(s) : {}); } catch { setScores({}); }
  }, [resKey]); // scoresKey always changes with resKey
  useEffect(() => { try { localStorage.setItem(resKey,    JSON.stringify(results)); } catch {} }, [results, resKey]);
  useEffect(() => { try { localStorage.setItem(scoresKey, JSON.stringify(scores));  } catch {} }, [scores,  scoresKey]);
  const [scoring,   setScoring]   = useState(false);
  const [error,     setError]     = useState(null);
  const [batch,     setBatch]     = useState(0);

  // Queue system
  const [queue,     setQueue]     = useState([]); // [{id, label, params, status: pending|running|done}]
  const [queueRunning, setQueueRunning] = useState(false);
  const queueRef = useRef([]);
  queueRef.current = queue;

  useEffect(() => {
    if (!contentTemplates.length) return;
    if (!contentTemplates.some(t => t.id === templateId)) setTemplateId(contentTemplates[0].id);
  }, [contentTemplates, templateId]);

  // Active campaign context — stories found will be auto-assigned
  const [activeCampaignId,   setActiveCampaignId]   = useState(null);
  const [activeCampaignName, setActiveCampaignName] = useState("");

  // Apply prefill from ProductionAlert / Cmd+J / campaign "Find stories"
  useEffect(() => {
    if (!prefill) return;
    if (prefill.topic)     setTopic(prefill.topic);
    if (prefill.era)       setEra(prefill.era);
    if (prefill.archetype) setArchetype(prefill.archetype);
    if (prefill.format)    setFormat(prefill.format);
    if (prefill.content_template_id) setTemplateId(prefill.content_template_id);
    if (prefill.count)     setCount(String(prefill.count));
    // Campaign context
    setActiveCampaignId(prefill.campaign_id || null);
    setActiveCampaignName(prefill.campaign_name || "");
    if (onPrefillUsed) onPrefillUsed();
  }, [prefill, onPrefillUsed]);

  const getExisting = useCallback(() =>
    [...stories.map(s=>s.title), ...results.map(s=>s.title)].slice(-40).join("; "),
  [stories, results]);

  const runSearch = useCallback(async (params) => {
    const n = Math.max(1, Math.min(30, parseInt(params.count)||8));
    const template = getContentTemplate(settings, params.templateId);
    const { parsed } = await runPrompt({
      type: "research-stories",
      params: {
        topic:          params.topic,
        count:          n,
        era:            params.era,
        team:           params.team,
        archetype:      params.archetype,
        format:         params.format,
        content_template: template,
        existingTitles: getExisting(),
        batch:          batch + 1,
        brand_config:   brandConfigForPrompt(settings),
      },
      maxTokens: Math.min(700 + n * 350, 8000),
      context: {
        workspace_id: tenant?.workspace_id,
        brand_profile_id: tenant?.brand_profile_id,
        task_type: "suggest_content_ideas",
      },
    });
    if (!parsed || !Array.isArray(parsed)) throw new Error("Parse failed");
    return parsed.filter(s => s && s.title).map(s => ({
      ...s,
      content_template_id: s.content_template_id || template?.id || params.templateId || null,
      content_type: s.content_type || template?.content_type || "narrative",
      format: s.format || params.format || "",
      objective: s.objective || template?.objective || "",
      audience: s.audience || template?.audience || "",
      channel: s.channel || template?.channels?.[0] || "",
      platform_target: s.platform_target || s.channel || template?.channels?.[0] || "",
      deliverable_type: s.deliverable_type || template?.deliverable_type || "",
    }));
  }, [batch, getExisting, settings, tenant]);

  // Single search
  const doFetch = useCallback(async () => {
    if (!topic && !era && !archetype && !format && !team) {
      // No params — just run with defaults
    }
    setError(null); setScores({});
    const params = { topic, count, era, team, archetype, format, templateId };
    try {
      const fresh = await runSearch(params);
      const titles = new Set(stories.map(s=>s.title?.toLowerCase()));
      const newStories = fresh.filter(s=>!titles.has(s.title?.toLowerCase()));
      setResults(prev => {
        const existingTitles = new Set(prev.map(s=>s.title?.toLowerCase()));
        return [...prev, ...newStories.filter(s=>!existingTitles.has(s.title?.toLowerCase()))];
      });
      setBatch(b=>b+1);

      if (newStories.length > 0) {
        setScoring(true);
        try {
          const scoreData = await scoreStories(newStories, settings, tenant);
          setScores(prev => {
            const base = Object.keys(prev).length;
            const next = {...prev};
            for (const s of scoreData) {
              if (s.index!=null) next[base + s.index - 1] = s;
            }
            return next;
          });
        } catch {} finally { setScoring(false); }
      }
    } catch(err) { setError(err.message); }
  }, [topic, count, era, team, archetype, format, templateId, runSearch, stories, settings, tenant]);

  // Add to queue
  const addToQueue = () => {
    const label = [
      format ? programmeMap[format]?.label : null,
      contentTemplates.find(t => t.id === templateId)?.name || null,
      archetype || null,
      era || null,
      topic || null,
    ].filter(Boolean).join(" · ") || "General search";
    const id = crypto.randomUUID();
    setQueue(q => [...q, { id, label, params: { topic, count, era, team, archetype, format, templateId }, status:"pending" }]);
  };

  // Run queue
  const runQueue = useCallback(async () => {
    setQueueRunning(true);
    setError(null);
    const q = queueRef.current;
    for (let i = 0; i < q.length; i++) {
      if (q[i].status !== "pending") continue;
      setQueue(prev => prev.map((item,idx) => idx===i ? {...item,status:"running"} : item));
      try {
        const fresh = await runSearch(q[i].params);
        const titles = new Set(stories.map(s=>s.title?.toLowerCase()));
        const newStories = fresh.filter(s=>!titles.has(s.title?.toLowerCase()));
        setResults(prev => {
          const existingTitles = new Set(prev.map(s=>s.title?.toLowerCase()));
          return [...prev, ...newStories.filter(s=>!existingTitles.has(s.title?.toLowerCase()))];
        });
        setBatch(b=>b+1);
        if (newStories.length > 0) {
          setScoring(true);
          try {
            const scoreData = await scoreStories(newStories, settings, tenant);
            setScores(prev => {
              const base = Object.keys(prev).length;
              const next = {...prev};
              for (const s of scoreData) { if(s.index!=null) next[base+s.index-1]=s; }
              return next;
            });
          } catch {} finally { setScoring(false); }
        }
        setQueue(prev => prev.map((item,idx) => idx===i ? {...item,status:"done"} : item));
      } catch(err) {
        setError(err.message);
        setQueue(prev => prev.map((item,idx) => idx===i ? {...item,status:"error"} : item));
      }
      if (i < q.length-1) await new Promise(r=>setTimeout(r,600));
    }
    setQueueRunning(false);
  }, [runSearch, stories, settings]);

  // Streaming state for live generating panel
  const [streamText, setStreamText]   = useState("");
  const [liveIdeas, setLiveIdeas]     = useState([]);

  // Single search — uses streaming for live feedback
  const [singleLoading, setSingleLoading] = useState(false);
  const handleFind = useCallback(async () => {
    setSingleLoading(true);
    setStreamText("");
    setLiveIdeas([]);
    setError(null);
    setScores({});
    try {
      const n = Math.max(1, Math.min(30, parseInt(count) || 8));
      const template = getContentTemplate(settings, templateId);
      const { text } = await runPromptStream({
        type: "research-stories",
        params: {
          topic, count: n, era, team, archetype, format,
          content_template: template,
          existingTitles: getExisting(),
          batch: batch + 1,
          brand_config: brandConfigForPrompt(settings),
        },
        maxTokens: Math.min(700 + n * 350, 8000),
        context: {
          workspace_id: tenant?.workspace_id,
          brand_profile_id: tenant?.brand_profile_id,
          task_type: "suggest_content_ideas",
        },
        onChunk: (accumulated) => {
          setStreamText(accumulated);
          const found = [...accumulated.matchAll(/"title"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
          setLiveIdeas(found);
        },
      });

      // Parse full result
      const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      let arr = null;
      try { arr = JSON.parse(clean); } catch {}
      if (!arr) { const m = clean.match(/\[\s*\{[\s\S]*\}\s*\]/); if (m) try { arr = JSON.parse(m[0]); } catch {} }
      if (!arr) { const fi = clean.indexOf("["); const li = clean.lastIndexOf("]"); if (fi !== -1 && li > fi) try { arr = JSON.parse(clean.substring(fi, li + 1)); } catch {} }
      if (!Array.isArray(arr)) throw new Error("Parse failed");

      const fresh = arr.filter(s => s && s.title).map(s => ({
        ...s,
        content_template_id: s.content_template_id || template?.id || templateId || null,
        content_type:    s.content_type    || template?.content_type  || "narrative",
        format:          s.format          || format                  || "",
        objective:       s.objective       || template?.objective      || "",
        audience:        s.audience        || template?.audience       || "",
        channel:         s.channel         || template?.channels?.[0] || "",
        platform_target: s.platform_target || s.channel               || template?.channels?.[0] || "",
        deliverable_type: s.deliverable_type || template?.deliverable_type || "",
      }));

      setStreamText(""); setLiveIdeas([]);
      const existingSet = new Set(stories.map(s => s.title?.toLowerCase()));
      const newStories  = fresh.filter(s => !existingSet.has(s.title?.toLowerCase()));
      setResults(prev => {
        const prevSet = new Set(prev.map(s => s.title?.toLowerCase()));
        return [...prev, ...newStories.filter(s => !prevSet.has(s.title?.toLowerCase()))];
      });
      setBatch(b => b + 1);

      if (newStories.length > 0) {
        setScoring(true);
        try {
          const scoreData = await scoreStories(newStories, settings, tenant);
          setScores(prev => {
            const base = Object.keys(prev).length;
            const next = { ...prev };
            for (const s of scoreData) { if (s.index != null) next[base + s.index - 1] = s; }
            return next;
          });
        } catch {} finally { setScoring(false); }
      }
    } catch (err) {
      setStreamText(""); setLiveIdeas([]);
      setError(err.message);
    } finally {
      setSingleLoading(false);
    }
  }, [topic, count, era, team, archetype, format, templateId, getExisting, batch, settings, stories, tenant]);

  const loading = singleLoading || queueRunning;

  const reScoreAll = useCallback(async () => {
    if (!results.length || scoring) return;
    setScoring(true);
    try {
      const scoreData = await scoreStories(results, settings, tenant);
      const fresh = {};
      for (const s of scoreData) { if (s.index != null) fresh[s.index - 1] = s; }
      setScores(fresh);
    } catch {} finally { setScoring(false); }
  }, [results, settings, scoring, tenant]);

  const addAllToPipeline = () => {
    const gated = results
      .map((s, i) => {
        const sc = scores[i];
        const normalized = {
          ...s,
          format: s.format || format || suggestFormat(s.era),
          content_template_id: s.content_template_id || templateId,
          ...(activeCampaignId ? { campaign_id: activeCampaignId, campaign_name: activeCampaignName } : {}),
          ...(sc ? { score_total: sc.total, metadata: { ...(s.metadata || {}), adaptive_score: sc.adaptive_score } } : {}),
        };
        return { s: normalized, i, gate: auditStoryQuality(normalized, stories, settings), score: sc };
      })
      .filter(({ gate }) => gate.canAdd);
    const blocked = results.length - gated.length;
    const sortedResultsList = gated.map(({ s, gate, score: sc }) => {
      return {
        ...s,
        id: crypto.randomUUID(),
        status: "accepted",
        created_at: new Date().toISOString(),
        ...qualityGatePatch(gate),
        ...(sc ? {
          score_total:     sc.total,
          score_emotional: sc.emotional_depth,
          score_obscurity: sc.obscurity,
          score_visual:    sc.visual_potential,
          score_hook:      sc.hook_strength,
          metadata:        { ...(s.metadata || {}), adaptive_score: sc.adaptive_score },
        } : {}),
      };
    });
    if (blocked > 0) setError(`${blocked} ${blocked === 1 ? "story was" : "stories were"} held back by quality-gate blockers.`);
    if (sortedResultsList.length === 0) return;
    onAddStories(sortedResultsList);
    setResults(prev => prev.filter((s, i) => !gated.some(g => g.i === i)));
    setScores({});
  };

  const dismiss = (i) => {
    setResults(r => r.filter((_,idx)=>idx!==i));
    setScores(sc => { const n={...sc}; delete n[i]; return n; });
  };

  const sortedResults = results
    .map((s,i) => ({ s, i, score: scores[i]?.total ?? null }))
    .sort((a,b) => {
      if (a.score==null&&b.score==null) return 0;
      if (a.score==null) return 1;
      if (b.score==null) return -1;
      return b.score - a.score;
    });

  const selStyle = { padding:"6px 10px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none" };

  return (
    <div className="animate-fade-in">

      {/* Campaign context banner */}
      {activeCampaignId && (
        <div style={{ marginBottom: 12, padding: "9px 14px", borderRadius: 8, background: "rgba(74,155,127,0.08)", border: "1px solid rgba(74,155,127,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Target size={13} color="#4A9B7F" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#4A9B7F" }}>Researching for "{activeCampaignName}"</span>
            <span style={{ fontSize: 11, color: "rgba(74,155,127,0.7)" }}>— found stories will be auto-assigned</span>
          </div>
          <button onClick={() => { setActiveCampaignId(null); setActiveCampaignName(""); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(74,155,127,0.7)", display: "flex", alignItems: "center" }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Active filter pills */}
      {(era||team||archetype||format||templateId) && (
        <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:11, color:"var(--t3)" }}>Targeting:</span>
          {templateId && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)", fontWeight:600 }}>{contentTemplates.find(t=>t.id===templateId)?.name || "Template"}</span>}
          {format && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:`${programmeMap[format]?.color}15`, color:programmeMap[format]?.color, border:`1px solid ${programmeMap[format]?.color}25`, fontWeight:600 }}>{programmeMap[format]?.label}</span>}
          {archetype && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{archetype}</span>}
          {era && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{era}</span>}
          {team && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{team}</span>}
          <button onClick={()=>{setEra("");setTeam("");setArchetype("");setFormat("");setTemplateId(contentTemplates[0]?.id || "narrative_story");}} style={{ fontSize:11, color:"var(--t3)", background:"transparent", border:"none", cursor:"pointer" }}>Clear ×</button>
        </div>
      )}

      {/* Search bar */}
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <div style={{ position:"relative", flex:1 }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--t3)", pointerEvents:"none" }} />
          <input
            value={topic}
            onChange={e=>setTopic(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"){e.preventDefault();handleFind();} }}
            placeholder="Topic or focus — Enter to search"
            style={{ width:"100%", padding:"9px 12px 9px 32px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border-in)", color:"var(--t1)", fontSize:13, outline:"none" }}
          />
        </div>
        <input value={count} onChange={e=>setCount(e.target.value.replace(/[^0-9]/g,""))}
          style={{ width:52, padding:"9px 0", borderRadius:8, textAlign:"center", fontSize:13, fontWeight:700, background:"var(--fill2)", border:"1px solid var(--border-in)", color:"var(--t1)", outline:"none", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }} />
        <button onClick={handleFind} disabled={loading} style={{
          padding:"9px 20px", borderRadius:8, fontSize:13, fontWeight:600,
          background: loading ? "var(--fill2)" : "var(--t1)",
          color: loading ? "var(--t3)" : "var(--bg)",
          border:"none", cursor: loading ? "not-allowed" : "pointer",
        }}>
          {singleLoading ? "Finding..." : "Find"}
        </button>
      </div>

      {/* Filters — always visible */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:8, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Template</div>
          <select value={templateId} onChange={e=>setTemplateId(e.target.value)} style={{...selStyle,width:"100%"}}>
            {contentTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Programme</div>
          <select value={format} onChange={e=>setFormat(e.target.value)} style={{...selStyle,width:"100%"}}>
            <option value="">Any programme</option>
            {programmes.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Archetype</div>
          <select value={archetype} onChange={e=>setArchetype(e.target.value)} style={{...selStyle,width:"100%"}}>
            <option value="">Any archetype</option>
            {archetypes.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Era</div>
          <select value={era} onChange={e=>setEra(e.target.value)} style={{...selStyle,width:"100%"}}>
            <option value="">Any era</option>
            {eras.map(e=><option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Subject</div>
          <select value={team} onChange={e=>setTeam(e.target.value)} style={{...selStyle,width:"100%"}}>
            <option value="">Any subject</option>
            {subjects.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Queue system */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <button onClick={addToQueue} style={{
          padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:500,
          background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer",
          display:"flex", alignItems:"center", gap:5,
        }}>
          <Plus size={12} /> Add to queue
        </button>
        {queue.length > 0 && (
          <>
            <button onClick={runQueue} disabled={queueRunning||queue.every(q=>q.status==="done")} style={{
              padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:600,
              background: queueRunning ? "var(--fill2)" : "var(--t1)",
              color: queueRunning ? "var(--t3)" : "var(--bg)",
              border:"none", cursor: queueRunning ? "not-allowed" : "pointer",
              display:"flex", alignItems:"center", gap:5,
            }}>
              <Play size={12} /> {queueRunning ? "Running..." : `Run queue (${queue.filter(q=>q.status==="pending").length})`}
            </button>
            <button onClick={()=>setQueue([])} style={{ padding:"6px 10px", borderRadius:7, fontSize:12, color:"var(--t3)", background:"transparent", border:"1px solid var(--border)", cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
              <Trash2 size={12} /> Clear
            </button>
          </>
        )}
        {scoring && (
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--t3)" }}>
            <div className="anim-spin" style={{ width:12, height:12, borderRadius:"50%", border:"1.5px solid var(--t4)", borderTopColor:"var(--t1)" }} />
            Scoring...
          </div>
        )}
      </div>

      {/* Queue list */}
      {queue.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:16 }}>
          {queue.map((item,i) => (
            <div key={item.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 12px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0, background:
                item.status==="done"?"#4A9B7F":item.status==="running"?"#C49A3C":item.status==="error"?"#C0666A":"var(--t4)"
              }} />
              <span style={{ fontSize:12, color:"var(--t2)", flex:1 }}>{item.label} · {item.params.count} ideas</span>
              <span style={{ fontSize:10, color:"var(--t4)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}>{item.status}</span>
              {item.status==="pending" && (
                <button onClick={()=>setQueue(q=>q.filter((_,idx)=>idx!==i))} style={{ width:18, height:18, borderRadius:4, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <X size={11} color="var(--t4)" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Live generating panel — visible while AI streams ideas */}
      {singleLoading && (
        <div style={{ marginBottom: 16, padding: "14px 16px", borderRadius: 10, border: "0.5px solid var(--border)", background: "var(--fill2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: liveIdeas.length > 0 ? 10 : 0 }}>
            <div className="anim-spin" style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--t1)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t2)" }}>
              {liveIdeas.length === 0
                ? "Searching for ideas…"
                : `Found ${liveIdeas.length} of ~${count} ideas…`}
            </span>
          </div>
          {liveIdeas.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {liveIdeas.map((title, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--t2)", padding: "5px 10px", borderRadius: 6, background: "var(--bg)", border: "0.5px solid var(--border2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:16, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", fontSize:12 }}>{error}</div>}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontSize:13, fontWeight:600, color:"var(--t1)" }}>{results.length} stories found{scoring?" · scoring...":""}</span>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={reScoreAll} disabled={scoring} title="Re-score all results" style={{ padding:"6px 10px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color: scoring ? "var(--t4)" : "var(--t3)", cursor: scoring ? "not-allowed" : "pointer", display:"flex", alignItems:"center", gap:5 }}>
                <RefreshCw size={11} /> Re-score
              </button>
              <button onClick={()=>{setResults([]);setScores({});}} style={{ padding:"6px 12px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t3)", cursor:"pointer" }}>
                Clear
              </button>
              <button onClick={addAllToPipeline} style={{ padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:600, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                <Plus size={12} /> Add all{activeCampaignId ? ` to "${activeCampaignName}"` : " to Pipeline"}
              </button>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {sortedResults.map(({ s, i, score: sc }) => {
              const scoreData = scores[i];
              const adaptive = scoreData?.adaptive_score;
              const fmt = programmeMap[s.format || format || suggestFormat(s.era)];
              const gate = auditStoryQuality({ ...s, format: s.format || format || suggestFormat(s.era), score_total: scoreData?.total ?? sc }, stories, settings);
              return (
                <div key={i} className="animate-fade-in" style={{ padding:"16px 18px", borderRadius:10, background:"var(--card)", border:"0.5px solid var(--border)", borderLeft:`2px solid ${fmt?.color||"var(--border)"}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                        <span style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{s.archetype}</span>
                        {s.era&&<span style={{ fontSize:10, color:"var(--t4)" }}>{s.era}</span>}
                        {fmt&&<span style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:3, background:`${fmt.color}15`, color:fmt.color, border:`1px solid ${fmt.color}25` }}>{fmt.label}</span>}
                        {gate.issues.length > 0 && (
                          <span style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:3, background:gate.canAdd?"var(--warning-bg)":"var(--error-bg)", color:gate.canAdd?"var(--warning)":"var(--error)", border:`0.5px solid ${gate.canAdd?"rgba(196,154,60,0.30)":"var(--error-border)"}` }}>
                            Gate · {gate.blockerCount ? `${gate.blockerCount} blocker` : `${gate.warningCount} warning${gate.warningCount === 1 ? "" : "s"}`}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:15, fontWeight:600, color:"var(--t1)", letterSpacing:0, lineHeight:1.3, marginBottom:4 }}>{s.title}</div>
                      {subjectText(s)&&<div style={{ fontSize:12, color:"var(--t3)", marginBottom:8 }}>{subjectText(s)}</div>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, marginLeft:12 }}>
                      {(adaptive?.total ?? sc)!=null&&(
                        <div style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 9px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)" }}>
                          <Star size={11} color={(adaptive?.total ?? sc)>=70?"var(--t1)":"var(--t3)"} fill={(adaptive?.total ?? sc)>=70?"var(--t1)":"none"} />
                          <span style={{ fontSize:12, fontWeight:700, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:"var(--t1)" }}>{adaptive?.total ?? sc}</span>
                          <span style={{ fontSize:10, color:"var(--t3)" }}>/100</span>
                        </div>
                      )}
                      <button onClick={()=>dismiss(i)} style={{ width:28, height:28, borderRadius:6, border:"1px solid var(--border)", background:"var(--fill2)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <X size={12} color="var(--t3)" />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize:13, color:"var(--t2)", lineHeight:1.6, marginBottom:8 }}>{s.angle}</div>
                  <div style={{ fontSize:13, color:"var(--t3)", fontStyle:"italic", paddingLeft:12, borderLeft:"2px solid var(--border)", lineHeight:1.5, marginBottom:scoreData?12:0 }}>"{s.hook}"</div>
                  {gate.issues.length > 0 && (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:10, marginBottom:scoreData?0:4 }}>
                      {gate.issues.slice(0, 4).map(issue => (
                        <span key={issue.code} style={{ fontSize:10, color:issue.severity==="blocker"?"var(--error)":"var(--t3)", padding:"2px 7px", borderRadius:99, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
                          {issue.message}
                        </span>
                      ))}
                      {gate.issues.length > 4 && <span style={{ fontSize:10, color:"var(--t4)", padding:"2px 4px" }}>+{gate.issues.length - 4} more</span>}
                    </div>
                  )}
                  {scoreData&&(
                    <div style={{ padding:"10px 12px", borderRadius:7, background:"var(--bg2)", border:"1px solid var(--border2)", marginTop:12, display:"flex", flexDirection:"column", gap:5 }}>
                      <ScoreBar score={adaptive?.components?.brand_fit ?? scoreData.brand_fit} label="Brand fit" max={100}/>
                      <ScoreBar score={adaptive?.components?.market_fit ?? scoreData.market_fit} label="Market fit" max={100}/>
                      <ScoreBar score={adaptive?.components?.production_readiness ?? scoreData.production_readiness} label="Production" max={100}/>
                      <ScoreBar score={adaptive?.components?.compliance_readiness ?? scoreData.compliance_readiness} label="Compliance" max={100}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading&&!results.length&&(
        <div style={{ textAlign:"center", padding:"60px 0", color:"var(--t4)" }}>
          <Search size={32} style={{ margin:"0 auto 12px", display:"block", opacity:0.25 }}/>
          <div style={{ fontSize:13 }}>Search or build a queue to find stories</div>
          <div style={{ fontSize:11, marginTop:6, color:"var(--t4)" }}>Add multiple searches to queue to mix formats in one batch</div>
        </div>
      )}
    </div>
  );
}
