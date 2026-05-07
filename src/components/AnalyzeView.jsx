"use client";
import { useState, useMemo } from "react";
import { TrendingUp, Eye, Bookmark, Share2, Upload, BarChart3, Zap, CheckCircle, Clock, UserPlus } from "lucide-react";
import { STAGES, FORMATS, FORMAT_MAP, ACCENT } from "@/lib/constants";
import { supabase } from "@/lib/db";
import { PageHeader, Panel, StatCard, buttonStyle } from "@/components/OperationalUI";

// ── Intelligence stage tracker ──
function IntelligenceStage({ count }) {
  const stages = [
    { stage: 1, label: "Data Capture",       threshold: 0,   desc: "Capturing training data from every publish" },
    { stage: 2, label: "Pattern Recognition", threshold: 50,  desc: "Analyze tab patterns + score correlations" },
    { stage: 3, label: "Predictive Scoring",  threshold: 100, desc: "Predicted performance scores activate" },
    { stage: 4, label: "Voice Intelligence",  threshold: 200, desc: "Script consistency scoring + voice patterns" },
  ];
  const active = stages.filter(s => count >= s.threshold).length;
  const next   = stages.find(s => count < s.threshold);

  return (
    <Panel style={{ marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Intelligence Layer</span>
        <span style={{ fontSize:11, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:"var(--t2)" }}>Stage {active} active</span>
      </div>
      <div style={{ display:"flex", gap:4, marginBottom:10 }}>
        {stages.map((s, i) => (
          <div key={s.stage} style={{ flex:1, height:3, borderRadius:2, background: count>=s.threshold ? "#4A9B7F" : "var(--bg3)" }} />
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {stages.map(s => {
          const done = count >= s.threshold;
          const isCurrent = active === s.stage - 1 && !done;
          return (
            <div key={s.stage} style={{ display:"flex", alignItems:"center", gap:8, opacity: done ? 1 : isCurrent ? 0.8 : 0.4 }}>
              <div style={{ width:16, height:16, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background: done ? "#4A9B7F" : isCurrent ? "var(--fill2)" : "transparent", border: done ? "none" : "1px solid var(--border)" }}>
                {done && <CheckCircle size={10} color="white" />}
                {isCurrent && <div className="anim-spin" style={{ width:8, height:8, borderRadius:"50%", border:"1.5px solid var(--t4)", borderTopColor:"var(--t1)" }} />}
              </div>
              <div style={{ flex:1 }}>
                <span style={{ fontSize:12, fontWeight:done?500:400, color: done?"var(--t1)":isCurrent?"var(--t2)":"var(--t3)" }}>Stage {s.stage} — {s.label}</span>
                {isCurrent && next && (
                  <span style={{ fontSize:11, color:"var(--t4)", marginLeft:8 }}>{next.threshold - count} videos to unlock</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Mini bar chart ──
function BarChart({ data, valueKey="avg", labelKey="label", color="var(--t1)", format }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d[valueKey])) * 1.1 || 1;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {data.map((d, i) => {
        const fmt = FORMAT_MAP[d.format];
        const barColor = fmt ? fmt.color : color;
        return (
          <div key={d[labelKey]||i}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                {fmt && <span style={{ width:8, height:8, borderRadius:2, background:fmt.color, display:"inline-block", flexShrink:0 }}/>}
                <span style={{ fontSize:12, color:"var(--t2)" }}>{d[labelKey]} {d.count!=null&&<span style={{color:"var(--t4)",fontSize:11}}>({d.count})</span>}</span>
              </div>
              <span style={{ fontSize:12, fontWeight:600, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color: i===0?"var(--t1)":"var(--t2)" }}>{typeof d[valueKey]==="number"?d[valueKey].toFixed(1):d[valueKey]}</span>
            </div>
            <div style={{ height:3, borderRadius:2, background:"var(--bg3)", overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${(d[valueKey]/max)*100}%`, background:barColor, borderRadius:2, transition:"width 0.4s ease" }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Score vs performance scatter (simplified as ranked list) ──
function ScoreCorrelation({ stories }) {
  const withBoth = stories.filter(s => s.score_total!=null && s.metrics_completion);
  if (withBoth.length < 3) return (
    <div style={{ textAlign:"center", padding:"32px 0", color:"var(--t4)", fontSize:12 }}>
      Need 3+ published stories with both AI score and completion rate data.
      <br/>Log metrics below to start building this chart.
    </div>
  );

  const sorted = [...withBoth].sort((a,b) => b.score_total - a.score_total);
  const corr = (() => {
    const n = withBoth.length;
    const xs = withBoth.map(s=>s.score_total);
    const ys = withBoth.map(s=>parseFloat(s.metrics_completion));
    const mx = xs.reduce((a,b)=>a+b,0)/n;
    const my = ys.reduce((a,b)=>a+b,0)/n;
    const num = xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0);
    const den = Math.sqrt(xs.reduce((s,x)=>s+(x-mx)**2,0)*ys.reduce((s,y)=>s+(y-my)**2,0));
    return den ? (num/den) : 0;
  })();

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14, padding:"10px 14px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)" }}>
        <div>
          <div style={{ fontSize:11, color:"var(--t3)" }}>Score ↔ Completion correlation</div>
          <div style={{ fontSize:20, fontWeight:700, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color: corr>0.5?"#4A9B7F":corr>0?"#C49A3C":"#C0666A" }}>{(corr*100).toFixed(0)}%</div>
        </div>
        <div style={{ fontSize:12, color:"var(--t3)", flex:1 }}>
          {corr > 0.5 ? "Strong — AI score is a reliable predictor of completion rate." :
           corr > 0.2 ? "Moderate — some correlation, more data will sharpen it." :
           corr > 0   ? "Weak — AI score and completion not yet aligned. Normal at low volume." :
           "Negative — completion rate not following score. Check scoring calibration."}
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {sorted.map(s => {
          const completion = parseFloat(s.metrics_completion);
          const fmt = FORMAT_MAP[s.format];
          return (
            <div key={s.id} style={{ display:"grid", gridTemplateColumns:"1fr 60px 60px", gap:12, alignItems:"center", padding:"8px 10px", borderRadius:7, background:"var(--fill2)", borderLeft:`3px solid ${fmt?.color||"var(--border)"}` }}>
              <div style={{ fontSize:12, color:"var(--t1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:10, color:"var(--t4)" }}>Score</div>
                <div style={{ fontSize:12, fontWeight:600, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:"var(--t1)" }}>{s.score_total}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:10, color:"var(--t4)" }}>Completion</div>
                <div style={{ fontSize:12, fontWeight:600, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color: completion>60?"#4A9B7F":completion>40?"#C49A3C":"var(--t3)" }}>{completion.toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Metricool CSV parser ──
function parseMetricoolCSV(text) {
  const lines = text.split("\n").filter(l=>l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(h=>h.replace(/"/g,"").trim().toLowerCase());
  const rows = [];
  for (let i=1; i<lines.length; i++) {
    const vals = lines[i].match(/(\"[^\"]*\"|[^,]+)/g)?.map(v=>v.replace(/^\"|\"$/g,"").trim()) || [];
    const row = {};
    headers.forEach((h,j)=>{ row[h]=vals[j]||""; });
    rows.push(row);
  }
  return rows;
}

function findCSVColumn(headers, candidates) {
  for (const c of candidates) {
    const found = headers.find(h=>h.includes(c));
    if (found) return found;
  }
  return null;
}

export default function AnalyzeView({ stories, onUpdate }) {
  const [activeTab,  setActiveTab]  = useState("overview");
  const [selId,      setSelId]      = useState(null);
  const [form,       setForm]       = useState({});
  const [csvStatus,  setCsvStatus]  = useState(null);
  const [importing,  setImporting]  = useState(false);

  const published   = stories.filter(s => s.status==="published" || s.metrics_views);
  const publishedCt = stories.filter(s => s.status==="published").length;
  const sel         = stories.find(s=>s.id===selId);

  // ── Metric log form ──
  const handleSelect = (id) => {
    setSelId(id);
    const s = stories.find(s=>s.id===id);
    if (s) setForm({
      metrics_views:      s.metrics_views||"",
      metrics_completion: s.metrics_completion||"",
      metrics_saves:      s.metrics_saves||"",
      metrics_shares:     s.metrics_shares||"",
      metrics_follows:    s.metrics_follows||"",
      metrics_comments:   s.metrics_comments||"",
      metrics_likes:      s.metrics_likes||"",
      metrics_watch_time: s.metrics_watch_time||"",
    });
  };

  const saveMetrics = () => {
    onUpdate(selId, { ...form, status:"published" });
    setSelId(null);
    setCsvStatus("Metrics saved.");
    setTimeout(()=>setCsvStatus(null), 2000);
  };

  // ── Metricool CSV import ──
  const importCSV = () => {
    const input = document.createElement("input");
    input.type="file"; input.accept=".csv";
    input.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      setImporting(true); setCsvStatus("Parsing CSV...");
      try {
        const text = await file.text();
        const rows = parseMetricoolCSV(text);
        if (!rows.length) { setCsvStatus("No data found in CSV."); setImporting(false); return; }

        const headers = Object.keys(rows[0]);
        const titleCol      = findCSVColumn(headers, ["title","name","post","content","caption"]);
        const viewsCol      = findCSVColumn(headers, ["view","reach","impression","play"]);
        const completionCol = findCSVColumn(headers, ["completion","retention","watch","through"]);
        const savesCol      = findCSVColumn(headers, ["save","bookmark"]);
        const sharesCol     = findCSVColumn(headers, ["share","repost"]);
        const followsCol    = findCSVColumn(headers, ["follow","subscriber"]);
        const commentsCol   = findCSVColumn(headers, ["comment"]);
        const likesCol      = findCSVColumn(headers, ["like","reaction","heart"]);

        let matched = 0;
        for (const row of rows) {
          const title = row[titleCol]?.toLowerCase().trim();
          if (!title) continue;
          const story = stories.find(s => s.title?.toLowerCase().includes(title) || title.includes(s.title?.toLowerCase().slice(0,15)));
          if (!story) continue;
          const updates = {};
          if (viewsCol&&row[viewsCol])      updates.metrics_views      = row[viewsCol];
          if (completionCol&&row[completionCol]) updates.metrics_completion = row[completionCol];
          if (savesCol&&row[savesCol])      updates.metrics_saves      = row[savesCol];
          if (sharesCol&&row[sharesCol])    updates.metrics_shares     = row[sharesCol];
          if (followsCol&&row[followsCol])  updates.metrics_follows    = row[followsCol];
          if (commentsCol&&row[commentsCol]) updates.metrics_comments   = row[commentsCol];
          if (likesCol&&row[likesCol])      updates.metrics_likes      = row[likesCol];
          if (Object.keys(updates).length) { onUpdate(story.id, updates); matched++; }
        }
        setCsvStatus(`✓ Matched ${matched} of ${rows.length} rows from CSV.`);
      } catch(err) { setCsvStatus(`Error: ${err.message}`); }
      setImporting(false);
    };
    input.click();
  };

  // ── Analysis data ──
  const analyzeBy = (field) => {
    const g = {};
    for (const s of published) {
      const key = s[field]; if (!key) continue;
      if (!g[key]) g[key] = { label:key, count:0, completions:[], views:[], saves:[], format:s.format };
      g[key].count++;
      if (s.metrics_completion) g[key].completions.push(parseFloat(s.metrics_completion));
      if (s.metrics_views)      g[key].views.push(parseInt(s.metrics_views));
      if (s.metrics_saves)      g[key].saves.push(parseInt(s.metrics_saves));
    }
    return Object.values(g)
      .map(g=>({
        ...g,
        avg: g.completions.length ? g.completions.reduce((a,b)=>a+b,0)/g.completions.length : 0,
        avgViews: g.views.length ? g.views.reduce((a,b)=>a+b,0)/g.views.length : 0,
      }))
      .filter(g=>g.count>0)
      .sort((a,b)=>b.avg-a.avg);
  };

  const byFormat    = analyzeBy("format");
  const byArchetype = analyzeBy("archetype");
  const byEra       = analyzeBy("era");

  const TABS = [
    { key:"overview",     label:"Overview" },
    { key:"score",        label:"Score vs Performance" },
    { key:"breakdowns",   label:"Breakdowns" },
    { key:"log",          label:"Log Metrics" },
  ];

  const tabStyle = (k) => ({
    ...buttonStyle(activeTab===k ? "primary" : "ghost", {
      padding:"6px 14px",
      fontWeight: activeTab===k?600:400,
      border: activeTab===k?"1px solid var(--t1)":"1px solid transparent",
    }),
  });

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Insights"
        description="Track published performance, import Metricool data, and watch the intelligence layer mature as volume grows."
        meta={`${publishedCt} published`}
        action={
          <button onClick={importCSV} disabled={importing} style={buttonStyle("secondary", { padding:"6px 14px" })}>
            <Upload size={13}/> Import Metricool CSV
          </button>
        }
      />

      {/* Intelligence stage */}
      <IntelligenceStage count={publishedCt} />

      {/* Tab nav */}
      <div style={{ display:"flex", gap:4, marginBottom:20, flexWrap:"wrap" }}>
        {TABS.map(t=><button key={t.key} onClick={()=>setActiveTab(t.key)} style={tabStyle(t.key)}>{t.label}</button>)}
      </div>

      {csvStatus && <div style={{ padding:"8px 12px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)", fontSize:12, color:"var(--t2)", marginBottom:14 }}>{csvStatus}</div>}

      {/* ── Overview ── */}
      {activeTab==="overview" && (
        <div>
          {/* Summary stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:10, marginBottom:20 }}>
            {[
              { label:"Published",    value:publishedCt, suffix:"" },
              { label:"With metrics", value:published.filter(s=>s.metrics_completion).length, suffix:"" },
              { label:"Avg completion", value: published.filter(s=>s.metrics_completion).length ? (published.filter(s=>s.metrics_completion).reduce((a,s)=>a+parseFloat(s.metrics_completion),0)/published.filter(s=>s.metrics_completion).length).toFixed(1) : "—", suffix:"%" },
              { label:"Avg score",    value: published.filter(s=>s.score_total).length ? Math.round(published.filter(s=>s.score_total).reduce((a,s)=>a+s.score_total,0)/published.filter(s=>s.score_total).length) : "—", suffix:"/100" },
            ].map(m=>(
              <StatCard key={m.label} label={m.label} value={m.value} suffix={m.suffix} />
            ))}
          </div>

          {published.length < 3 ? (
            <div style={{ textAlign:"center", padding:"48px 0", color:"var(--t4)" }}>
              <BarChart3 size={32} style={{ margin:"0 auto 12px", display:"block", opacity:0.25 }}/>
              <div style={{ fontSize:13 }}>Publish 3+ episodes and log metrics to see patterns</div>
              <div style={{ fontSize:11, marginTop:6 }}>Import from Metricool or log manually in the Log Metrics tab</div>
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <Panel>
                <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12 }}>By Format</div>
                <BarChart data={byFormat} valueKey="avg" labelKey="label"/>
              </Panel>
              <Panel>
                <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12 }}>By Era</div>
                <BarChart data={byEra} valueKey="avg" labelKey="label"/>
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* ── Score vs Performance ── */}
      {activeTab==="score" && <ScoreCorrelation stories={published}/>}

      {/* ── Breakdowns ── */}
      {activeTab==="breakdowns" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {[
            { label:"Archetype", data:byArchetype },
            { label:"Format",    data:byFormat    },
            { label:"Era",       data:byEra       },
          ].map(({ label, data }) => (
            <Panel key={label}>
              <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12 }}>{label} · avg completion rate</div>
              {data.length ? <BarChart data={data} valueKey="avg" labelKey="label"/> : <div style={{ fontSize:12, color:"var(--t4)" }}>No data yet</div>}
            </Panel>
          ))}
        </div>
      )}

      {/* ── Log Metrics ── */}
      {activeTab==="log" && (
        <div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Select episode</div>
            <select value={selId||""} onChange={e=>handleSelect(e.target.value||null)}
              style={{ width:"100%", padding:"9px 12px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border-in)", color:"var(--t1)", fontSize:13, outline:"none" }}>
              <option value="">Select episode...</option>
              {stories.filter(s=>!["rejected","archived"].includes(s.status)).map(s=>(
                <option key={s.id} value={s.id}>{s.title} ({STAGES[s.status]?.label})</option>
              ))}
            </select>
          </div>

          {sel && (
            <div style={{ padding:"16px", borderRadius:10, background:"var(--card)", border:"1px solid var(--border)" }}>
              <div style={{ fontSize:14, fontWeight:500, color:"var(--t1)", marginBottom:14 }}>{sel.title}</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:8, marginBottom:14 }}>
                {[
                  { k:"metrics_views",      label:"Views",        suffix:"" },
                  { k:"metrics_completion", label:"Completion %",  suffix:"%" },
                  { k:"metrics_saves",      label:"Saves",        suffix:"" },
                  { k:"metrics_shares",     label:"Shares",       suffix:"" },
                  { k:"metrics_follows",    label:"Follows",      suffix:"" },
                  { k:"metrics_comments",   label:"Comments",     suffix:"" },
                  { k:"metrics_likes",      label:"Likes",        suffix:"" },
                  { k:"metrics_watch_time", label:"Watch time",   suffix:"s" },
                ].map(({ k, label, suffix }) => (
                  <div key={k}>
                    <div style={{ fontSize:10, color:"var(--t3)", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
                    <input
                      type="number"
                      value={form[k]||""}
                      onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                      placeholder="—"
                      style={{ width:"100%", padding:"7px 10px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", fontSize:13, outline:"none" }}
                    />
                  </div>
                ))}
              </div>
              <button onClick={saveMetrics} style={{
                width:"100%", padding:"10px", borderRadius:8, fontSize:13, fontWeight:600,
                background:"var(--t1)", color:"var(--bg)", border:"none", cursor:"pointer",
              }}>
                Save metrics
              </button>
            </div>
          )}

          <div style={{ marginTop:20, padding:"12px 14px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)", fontSize:12, color:"var(--t3)" }}>
            <strong style={{color:"var(--t2)"}}>Tip:</strong> Import your Metricool CSV export using the button above to bulk-import metrics for all published episodes at once. The system matches by title automatically.
          </div>
        </div>
      )}
    </div>
  );
}
