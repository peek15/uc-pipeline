"use client";
import { useState } from "react";
import { Search, Check, X, Star } from "lucide-react";
import { ARCHETYPES, ERAS, TEAMS, RESEARCH_ANGLES } from "@/lib/constants";
import { callClaude } from "@/lib/db";

function ScoreBar({ score, label, max = 10 }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <span style={{ fontSize:10, color:"var(--t3)", width:80, flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:3, borderRadius:2, background:"var(--bg3)", overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${(score/max)*100}%`, background:"var(--t1)", borderRadius:2, transition:"width 0.4s ease" }} />
      </div>
      <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace", color:"var(--t2)", width:16, textAlign:"right" }}>{score}</span>
    </div>
  );
}

function TotalScore({ score }) {
  const color = score >= 80 ? "var(--t1)" : score >= 60 ? "var(--t2)" : "var(--t3)";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)" }}>
      <Star size={11} color={color} fill={score >= 70 ? color : "none"} />
      <span style={{ fontSize:13, fontWeight:700, color, fontFamily:"'DM Mono',monospace" }}>{score}</span>
      <span style={{ fontSize:10, color:"var(--t3)" }}>/ 100</span>
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

  const text = await callFn(prompt, 1000, "haiku");
  const clean = text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
  let parsed = null;
  try { parsed = JSON.parse(clean); } catch {}
  if (!parsed) { const m = clean.match(/\[\s*\{[\s\S]*\}\s*\]/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
  return parsed || [];
}

export default function ResearchView({ stories, onAddStories }) {
  const [topic,   setTopic]   = useState("");
  const [count,   setCount]   = useState("8");
  const [era,     setEra]     = useState("");
  const [team,    setTeam]    = useState("");
  const [loading, setLoading] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [error,   setError]   = useState(null);
  const [results, setResults] = useState([]);
  const [scores,  setScores]  = useState({});
  const [batch,   setBatch]   = useState(0);

  const doFetch = async () => {
    setLoading(true); setError(null); setScores({});
    const n = Math.max(1, Math.min(30, parseInt(count) || 8));
    try {
      const angle    = RESEARCH_ANGLES[Math.floor(Math.random() * RESEARCH_ANGLES.length)];
      const existing = stories.slice(-30).map(s => s.title).join("; ");
      const prompt   = `You are a story research engine for "Uncle Carter," an NBA storytelling brand. Find ${n} compelling, lesser-known human stories.\n\nReturn JSON objects with: title, archetype (${ARCHETYPES.join("/")}), obscurity (1-5, prefer 3-5), players, era, angle (2-3 sentences human tension), hook (1 sentence opener).\n\nRULES: Human story > highlights. Specific facts. Obscure > well-known. Each DISTINCT.${era ? `\nEra: ${era}.` : ""}${team ? `\nTeam: ${team}.` : ""}${topic ? `\nFocus: "${topic}"` : ""}\n${existing ? `\nALREADY COVERED: ${existing}` : ""}\n\nAngle: "${angle}". Batch #${batch + 1}. JSON array ONLY. No markdown.`;

      // Use Haiku for speed
      const text  = await callClaude(prompt, Math.min(700 + n * 350, 8000), "haiku");
      const clean = text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
      let parsed  = null;
      try { parsed = JSON.parse(clean); } catch {}
      if (!parsed) { const m = clean.match(/\[\s*\{[\s\S]*\}\s*\]/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
      if (!parsed) { const fi = clean.indexOf("["); const li = clean.lastIndexOf("]"); if (fi !== -1 && li > fi) try { parsed = JSON.parse(clean.substring(fi, li + 1)); } catch {} }
      if (!parsed || !Array.isArray(parsed)) throw new Error("Parse failed: " + clean.substring(0, 100));

      const valid  = parsed.filter(s => s && s.title);
      const titles = new Set(stories.map(s => s.title?.toLowerCase()));
      const fresh  = valid.filter(s => !titles.has(s.title?.toLowerCase()));
      setResults(fresh);
      setBatch(b => b + 1);

      // Auto-score in background with Haiku
      if (fresh.length > 0) {
        setScoring(true);
        try {
          const scoreData = await scoreStories(fresh, callClaude);
          const scoreMap = {};
          for (const s of scoreData) {
            if (s.index != null) scoreMap[s.index - 1] = s;
          }
          setScores(scoreMap);
        } catch {} finally { setScoring(false); }
      }

    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const acceptAll = () => {
    onAddStories(results.map(s => ({ ...s, id: crypto.randomUUID(), status: "accepted", created_at: new Date().toISOString() })));
    setResults([]); setScores({});
  };

  const acceptOne = (story, i) => {
    onAddStories([{ ...story, id: crypto.randomUUID(), status: "accepted", created_at: new Date().toISOString() }]);
    setResults(r => r.filter((_, idx) => idx !== i));
    setScores(sc => { const n = {...sc}; delete n[i]; return n; });
  };

  const dismiss = (i) => {
    setResults(r => r.filter((_, idx) => idx !== i));
    setScores(sc => { const n = {...sc}; delete n[i]; return n; });
  };

  // Sort by score desc if scores available
  const sortedResults = results.map((s, i) => ({ s, i, score: scores[i]?.total ?? null }))
    .sort((a, b) => {
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    });

  return (
    <div className="animate-fade-in">

      {/* Search row */}
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <div style={{ position:"relative", flex:1 }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--t3)", pointerEvents:"none" }} />
          <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Topic or focus (optional)"
            onKeyDown={e => e.key === "Enter" && doFetch()}
            style={{ width:"100%", padding:"9px 12px 9px 32px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border-in)", color:"var(--t1)", fontSize:13, outline:"none" }} />
        </div>
        <input value={count} onChange={e=>setCount(e.target.value.replace(/\D/g,""))}
          style={{ width:52, padding:"9px 0", borderRadius:8, textAlign:"center", fontSize:13, fontWeight:700, background:"var(--fill2)", border:"1px solid var(--border-in)", color:"var(--t1)", outline:"none", fontFamily:"'DM Mono',monospace" }} />
        <button onClick={doFetch} disabled={loading} style={{
          padding:"9px 20px", borderRadius:8, fontSize:13, fontWeight:600,
          background: loading ? "var(--fill2)" : "var(--t1)",
          color: loading ? "var(--t3)" : "var(--bg)",
          border:"none", cursor: loading ? "not-allowed" : "pointer", transition:"all 0.15s",
        }}>
          {loading ? "Finding..." : "Find"}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        <select value={era} onChange={e=>setEra(e.target.value)} style={{ padding:"6px 10px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color: era ? "var(--t1)" : "var(--t3)", outline:"none" }}>
          <option value="">Any era</option>
          {ERAS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={team} onChange={e=>setTeam(e.target.value)} style={{ padding:"6px 10px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color: team ? "var(--t1)" : "var(--t3)", outline:"none", maxWidth:180 }}>
          <option value="">Any team</option>
          {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {scoring && (
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--t3)" }}>
            <div className="anim-spin" style={{ width:12, height:12, borderRadius:"50%", border:"1.5px solid var(--t4)", borderTopColor:"var(--t1)" }} />
            Scoring...
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:16, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", fontSize:12 }}>{error}</div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontSize:13, fontWeight:600, color:"var(--t1)" }}>{results.length} stories found</span>
            <button onClick={acceptAll} style={{ padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:600, background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
              <Check size={12} /> Accept all
            </button>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {sortedResults.map(({ s, i, score: sc }) => {
              const scoreData = scores[i];
              return (
                <div key={i} className="animate-fade-in" style={{ padding:"16px 18px", borderRadius:10, background:"var(--card)", border:"1px solid var(--border)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{s.archetype}</span>
                        {s.era && <span style={{ fontSize:10, color:"var(--t4)" }}>{s.era}</span>}
                      </div>
                      <div style={{ fontSize:15, fontWeight:600, color:"var(--t1)", letterSpacing:"-0.02em", lineHeight:1.3, marginBottom:4 }}>{s.title}</div>
                      {s.players && <div style={{ fontSize:12, color:"var(--t3)", marginBottom:8 }}>{Array.isArray(s.players) ? s.players.join(", ") : s.players}</div>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, marginLeft:12 }}>
                      {sc != null && <TotalScore score={sc} />}
                      <button onClick={() => dismiss(i)} style={{ width:28, height:28, borderRadius:6, border:"1px solid var(--border)", background:"var(--fill2)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <X size={12} color="var(--t3)" />
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize:13, color:"var(--t2)", lineHeight:1.6, marginBottom:8 }}>{s.angle}</div>
                  <div style={{ fontSize:13, color:"var(--t3)", fontStyle:"italic", paddingLeft:12, borderLeft:"2px solid var(--border)", lineHeight:1.5, marginBottom: scoreData ? 12 : 12 }}>"{s.hook}"</div>

                  {/* Score breakdown */}
                  {scoreData && (
                    <div style={{ padding:"10px 12px", borderRadius:7, background:"var(--bg2)", border:"1px solid var(--border2)", marginBottom:12, display:"flex", flexDirection:"column", gap:5 }}>
                      <ScoreBar score={scoreData.emotional_depth} label="Emotional depth" max={25} />
                      <ScoreBar score={scoreData.obscurity}       label="Obscurity"       max={25} />
                      <ScoreBar score={scoreData.visual_potential} label="Visual potential" max={25} />
                      <ScoreBar score={scoreData.hook_strength}   label="Hook strength"   max={25} />
                    </div>
                  )}

                  <button onClick={() => acceptOne(s, i)} style={{
                    padding:"7px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                    background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer",
                    display:"flex", alignItems:"center", gap:5,
                  }}>
                    <Check size={12} /> Accept
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign:"center", padding:"80px 0" }}>
          <div className="anim-spin" style={{ width:20, height:20, borderRadius:"50%", border:"1.5px solid var(--t4)", borderTopColor:"var(--t1)", margin:"0 auto 12px" }} />
          <div style={{ fontSize:12, color:"var(--t3)" }}>Searching NBA history...</div>
        </div>
      )}

      {!loading && !results.length && (
        <div style={{ textAlign:"center", padding:"80px 0", color:"var(--t4)" }}>
          <Search size={32} style={{ margin:"0 auto 12px", display:"block", opacity:0.25 }} />
          <div style={{ fontSize:13 }}>Search for NBA stories to get started</div>
        </div>
      )}
    </div>
  );
}
