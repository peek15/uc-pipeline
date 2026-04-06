"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Check, X, Star, Plus, Play, Pause, Trash2 } from "lucide-react";
import { ARCHETYPES, ERAS, TEAMS, RESEARCH_ANGLES, FORMATS, FORMAT_MAP, suggestFormat } from "@/lib/constants";
import { callClaude } from "@/lib/db";

function ScoreBar({ score, label, max = 25 }) {
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

async function scoreStories(stories, callFn) {
  const prompt = `You are an AI content scorer for "Uncle Carter," an NBA storytelling brand for short-form video.

Score each story on 4 dimensions (each out of 25, total out of 100):
- emotional_depth: Is there real human tension, not just a sports highlight?
- obscurity: How fresh/unknown is this story? (5=very well known, 25=almost nobody knows it)
- visual_potential: Can you find compelling images/footage for this?
- hook_strength: Would someone stop scrolling in the first 3 seconds?

Stories to score:
${stories.map((s,i) => `${i+1}. "${s.title}" — ${s.angle}`).join("\n")}

Return a JSON array with objects: { index, emotional_depth, obscurity, visual_potential, hook_strength, total }
JSON array ONLY. No markdown.`;

  const text = await callFn(prompt, 1500, "haiku");
  const clean = text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
  let parsed = null;
  try { parsed = JSON.parse(clean); } catch {}
  if (!parsed) { const m = clean.match(/\[\s*\{[\s\S]*\}\s*\]/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
  return parsed || [];
}

// Build search prompt
function buildPrompt(params, existingTitles, batch) {
  const { topic, count, era, team, archetype, format } = params;
  const fmtLabel = FORMAT_MAP[format]?.label || "";
  const fmtDesc  = format==="classics" ? "pre-2000s NBA"
                 : format==="performance_special" ? "historic records/dominant seasons"
                 : "recent NBA 2000s-present";
  const angle = RESEARCH_ANGLES[Math.floor(Math.random() * RESEARCH_ANGLES.length)];

  return `You are a story research engine for "Uncle Carter," an NBA storytelling brand. Find ${count} compelling, lesser-known human stories.\n\nReturn JSON objects with: title, archetype (${ARCHETYPES.join("/")}), obscurity (1-5, prefer 3-5), players, era, angle (2-3 sentences human tension), hook (1 sentence opener).\n\nRULES: Human story > highlights. Specific facts. Obscure > well-known. Each DISTINCT.${era?`\nEra: ${era}.`:""}${team?`\nTeam: ${team}.`:""}${archetype?`\nArchetype: ${archetype}.`:""}${fmtLabel?`\nContent format: ${fmtLabel} (${fmtDesc}).`:""}${topic?`\nFocus: "${topic}"`:""}${existingTitles?`\nALREADY COVERED: ${existingTitles}`:""}.\n\nAngle: "${angle}". Batch #${batch}. JSON array ONLY. No markdown.`;
}

export default function ResearchView({ stories, onAddStories, prefill, onPrefillUsed }) {
  // Search params
  const [topic,     setTopic]     = useState("");
  const [count,     setCount]     = useState("8");
  const [era,       setEra]       = useState("");
  const [team,      setTeam]      = useState("");
  const [archetype, setArchetype] = useState("");
  const [format,    setFormat]    = useState("");

  // Results
  const [results,   setResults]   = useState([]);
  const [scores,    setScores]    = useState({});
  const [scoring,   setScoring]   = useState(false);
  const [error,     setError]     = useState(null);
  const [batch,     setBatch]     = useState(0);

  // Queue system
  const [queue,     setQueue]     = useState([]); // [{id, label, params, status: pending|running|done}]
  const [queueRunning, setQueueRunning] = useState(false);
  const queueRef = useRef([]);
  queueRef.current = queue;

  // Apply prefill from ProductionAlert / Cmd+J
  const [_prefillApplied, setPrefillApplied] = useState(false);
  useEffect(() => {
    if (prefill && !_prefillApplied) {
      if (prefill.topic)     setTopic(prefill.topic);
      if (prefill.era)       setEra(prefill.era);
      if (prefill.archetype) setArchetype(prefill.archetype);
      if (prefill.format)    setFormat(prefill.format);
      if (prefill.count)     setCount(String(prefill.count));
      setPrefillApplied(true);
      if (onPrefillUsed) onPrefillUsed();
    }
  }, [prefill, _prefillApplied, onPrefillUsed]);

  const getExisting = useCallback(() =>
    [...stories.map(s=>s.title), ...results.map(s=>s.title)].slice(-40).join("; "),
  [stories, results]);

  const runSearch = useCallback(async (params) => {
    const n = Math.max(1, Math.min(30, parseInt(params.count)||8));
    const prompt = buildPrompt({...params, count:n}, getExisting(), batch+1);
    const text  = await callClaude(prompt, Math.min(700+n*350,8000), "haiku");
    const clean = text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
    let parsed  = null;
    try { parsed = JSON.parse(clean); } catch {}
    if (!parsed) { const m = clean.match(/\[\s*\{[\s\S]*\}\s*\]/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
    if (!parsed) { const fi=clean.indexOf("["); const li=clean.lastIndexOf("]"); if(fi!==-1&&li>fi) try{parsed=JSON.parse(clean.substring(fi,li+1));}catch{} }
    if (!parsed||!Array.isArray(parsed)) throw new Error("Parse failed");
    return parsed.filter(s=>s&&s.title);
  }, [batch, getExisting]);

  // Single search
  const doFetch = useCallback(async () => {
    if (!topic && !era && !archetype && !format && !team) {
      // No params — just run with defaults
    }
    setError(null); setScores({});
    const params = { topic, count, era, team, archetype, format };
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
          const scoreData = await scoreStories(newStories, callClaude);
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
  }, [topic, count, era, team, archetype, format, runSearch, stories]);

  // Add to queue
  const addToQueue = () => {
    const label = [
      format ? FORMAT_MAP[format]?.label : null,
      archetype || null,
      era || null,
      topic || null,
    ].filter(Boolean).join(" · ") || "General search";
    const id = crypto.randomUUID();
    setQueue(q => [...q, { id, label, params: { topic, count, era, team, archetype, format }, status:"pending" }]);
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
            const scoreData = await scoreStories(newStories, callClaude);
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
  }, [runSearch, stories]);

  // Loading state — true if single search or queue running
  const [singleLoading, setSingleLoading] = useState(false);
  const handleFind = useCallback(async () => {
    setSingleLoading(true);
    await doFetch();
    setSingleLoading(false);
  }, [doFetch]);

  const loading = singleLoading || queueRunning;

  const addAllToPipeline = () => {
    const sortedResultsList = results.map((s,i) => {
      const sc = scores[i];
      return {
        ...s,
        id: crypto.randomUUID(),
        status: "accepted",
        created_at: new Date().toISOString(),
        format: s.format || format || suggestFormat(s.era),
        ...(sc ? {
          score_total:     sc.total,
          score_emotional: sc.emotional_depth,
          score_obscurity: sc.obscurity,
          score_visual:    sc.visual_potential,
          score_hook:      sc.hook_strength,
        } : {}),
      };
    });
    onAddStories(sortedResultsList);
    setResults([]); setScores({});
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

      {/* Active filter pills */}
      {(era||team||archetype||format) && (
        <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:11, color:"var(--t3)" }}>Targeting:</span>
          {format && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:`${FORMAT_MAP[format]?.color}15`, color:FORMAT_MAP[format]?.color, border:`1px solid ${FORMAT_MAP[format]?.color}25`, fontWeight:600 }}>{FORMAT_MAP[format]?.label}</span>}
          {archetype && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{archetype}</span>}
          {era && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{era}</span>}
          {team && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{team}</span>}
          <button onClick={()=>{setEra("");setTeam("");setArchetype("");setFormat("");}} style={{ fontSize:11, color:"var(--t3)", background:"transparent", border:"none", cursor:"pointer" }}>Clear ×</button>
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
          style={{ width:52, padding:"9px 0", borderRadius:8, textAlign:"center", fontSize:13, fontWeight:700, background:"var(--fill2)", border:"1px solid var(--border-in)", color:"var(--t1)", outline:"none", fontFamily:"'DM Mono',monospace" }} />
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
          <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Format</div>
          <select value={format} onChange={e=>setFormat(e.target.value)} style={{...selStyle,width:"100%"}}>
            <option value="">Any format</option>
            {FORMATS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Archetype</div>
          <select value={archetype} onChange={e=>setArchetype(e.target.value)} style={{...selStyle,width:"100%"}}>
            <option value="">Any archetype</option>
            {ARCHETYPES.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Era</div>
          <select value={era} onChange={e=>setEra(e.target.value)} style={{...selStyle,width:"100%"}}>
            <option value="">Any era</option>
            {ERAS.map(e=><option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Team</div>
          <select value={team} onChange={e=>setTeam(e.target.value)} style={{...selStyle,width:"100%"}}>
            <option value="">Any team</option>
            {TEAMS.map(t=><option key={t} value={t}>{t}</option>)}
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
              <span style={{ fontSize:12, color:"var(--t2)", flex:1 }}>{item.label} · {item.params.count} stories</span>
              <span style={{ fontSize:10, color:"var(--t4)", fontFamily:"'DM Mono',monospace" }}>{item.status}</span>
              {item.status==="pending" && (
                <button onClick={()=>setQueue(q=>q.filter((_,idx)=>idx!==i))} style={{ width:18, height:18, borderRadius:4, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <X size={11} color="var(--t4)" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:16, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", fontSize:12 }}>{error}</div>}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontSize:13, fontWeight:600, color:"var(--t1)" }}>{results.length} stories found{scoring?" · scoring...":""}</span>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>{setResults([]);setScores({});}} style={{ padding:"6px 12px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t3)", cursor:"pointer" }}>
                Clear results
              </button>
              <button onClick={addAllToPipeline} style={{ padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:600, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                <Plus size={12} /> Add all to Pipeline
              </button>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {sortedResults.map(({ s, i, score: sc }) => {
              const scoreData = scores[i];
              const fmt = FORMAT_MAP[s.format || format || suggestFormat(s.era)];
              return (
                <div key={i} className="animate-fade-in" style={{ padding:"16px 18px", borderRadius:10, background:"var(--card)", border:"1px solid var(--border)", borderLeft:`3px solid ${fmt?.color||"var(--border)"}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                        <span style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{s.archetype}</span>
                        {s.era&&<span style={{ fontSize:10, color:"var(--t4)" }}>{s.era}</span>}
                        {fmt&&<span style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:3, background:`${fmt.color}15`, color:fmt.color, border:`1px solid ${fmt.color}25` }}>{fmt.label}</span>}
                      </div>
                      <div style={{ fontSize:15, fontWeight:600, color:"var(--t1)", letterSpacing:"-0.02em", lineHeight:1.3, marginBottom:4 }}>{s.title}</div>
                      {s.players&&<div style={{ fontSize:12, color:"var(--t3)", marginBottom:8 }}>{Array.isArray(s.players)?s.players.join(", "):s.players}</div>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, marginLeft:12 }}>
                      {sc!=null&&(
                        <div style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 9px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)" }}>
                          <Star size={11} color={sc>=70?"var(--t1)":"var(--t3)"} fill={sc>=70?"var(--t1)":"none"} />
                          <span style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"var(--t1)" }}>{sc}</span>
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
                  {scoreData&&(
                    <div style={{ padding:"10px 12px", borderRadius:7, background:"var(--bg2)", border:"1px solid var(--border2)", marginTop:12, display:"flex", flexDirection:"column", gap:5 }}>
                      <ScoreBar score={scoreData.emotional_depth}  label="Emotional depth"/>
                      <ScoreBar score={scoreData.obscurity}        label="Obscurity"/>
                      <ScoreBar score={scoreData.visual_potential} label="Visual potential"/>
                      <ScoreBar score={scoreData.hook_strength}    label="Hook strength"/>
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
          <div style={{ fontSize:13 }}>Search or build a queue to find NBA stories</div>
          <div style={{ fontSize:11, marginTop:6, color:"var(--t4)" }}>Add multiple searches to queue to mix formats in one batch</div>
        </div>
      )}
    </div>
  );
}
