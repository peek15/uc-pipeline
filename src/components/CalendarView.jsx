"use client";
import { useState, useMemo, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Plus, Circle } from "lucide-react";
import { STAGES, ACCENT, ARCHETYPES, LANGS, FORMAT_MAP, FORMATS } from "@/lib/constants";

const PLATFORMS = ["TikTok","Instagram","YouTube","All"];
const CADENCE   = 5; // target per week

function fmt(d)     { return d.toISOString().split("T")[0]; }
function isToday(d) { return fmt(d) === fmt(new Date()); }
function isPast(d)  { const t = new Date(); t.setHours(0,0,0,0); return d < t; }

// 3-week coverage summary
function CoverageSummary({ stories, weekOffset }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const horizon = new Date(today.getTime() + 21*86400000);
  const totalSlots = Math.round(21/7*CADENCE); // 15

  const scheduled = stories.filter(s => {
    if (!s.scheduled_date) return false;
    const d = new Date(s.scheduled_date);
    return d >= today && d <= horizon;
  });

  const ready = stories.filter(s =>
    ["approved","scripted","produced"].includes(s.status) && !s.scheduled_date
  ).sort((a,b) => {
    // Sort by combined score — intelligence layer will replace this later
    const scoreA = (a.score_total||0) + (a.reach_score||0);
    const scoreB = (b.score_total||0) + (b.reach_score||0);
    return scoreB - scoreA;
  });

  const covered   = scheduled.length + ready.length;
  const pct       = Math.min(100, Math.round((covered/totalSlots)*100));
  const color     = covered >= totalSlots ? "#4A9B7F" : covered >= totalSlots*0.6 ? "#C49A3C" : "#C0666A";

  // Format balance in next 3 weeks
  const fmtCounts = {};
  for (const s of [...scheduled, ...ready]) {
    const f = s.format||"standard";
    fmtCounts[f] = (fmtCounts[f]||0) + 1;
  }

  return (
    <div style={{ padding:"14px 16px", borderRadius:10, background:"var(--bg2)", border:"1px solid var(--border)", marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <span style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>3-week coverage</span>
        <span style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Mono',monospace", color }}>{covered}/{totalSlots} slots</span>
      </div>
      <div style={{ height:4, borderRadius:2, background:"var(--bg3)", overflow:"hidden", marginBottom:10 }}>
        <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:2, transition:"width 0.4s" }}/>
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        <span style={{ fontSize:11, color:"var(--t3)" }}>{scheduled.length} scheduled</span>
        <span style={{ fontSize:11, color:"var(--t4)" }}>·</span>
        <span style={{ fontSize:11, color:"var(--t3)" }}>{ready.length} ready unscheduled</span>
        {FORMATS.filter(f=>f.key!=="special_edition").map(f => (
          <span key={f.key} style={{ fontSize:10, padding:"1px 7px", borderRadius:99, background:`${f.color}15`, color:f.color, border:`1px solid ${f.color}25`, fontWeight:600 }}>
            {f.label} {fmtCounts[f.key]||0}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CalendarView({ stories, onUpdate, onProduce }) {
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [showAssign,  setShowAssign]  = useState(null); // day index
  const [platform,    setPlatform]    = useState("All");
  const [view,        setView]        = useState("week"); // week | month

  const today = new Date(); today.setHours(0,0,0,0);

  // Week days
  const weekStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(today.getDate() - (today.getDay()===0?6:today.getDay()-1) + weekOffset*7);
    return d;
  }, [weekOffset]);

  const days = useMemo(() =>
    Array.from({length:7}, (_,i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate()+i);
      return d;
    }), [weekStart]);

  const getForDay = (d) => stories.filter(s => s.scheduled_date === fmt(d));

  const ready = stories.filter(s =>
    ["approved","scripted","produced"].includes(s.status) && !s.scheduled_date
  ).sort((a,b) => {
    // Sort by combined score — intelligence layer will replace this later
    const scoreA = (a.score_total||0) + (a.reach_score||0);
    const scoreB = (b.score_total||0) + (b.reach_score||0);
    return scoreB - scoreA;
  });

  const assignToDay = (storyId, date, plt) => {
    onUpdate(storyId, {
      scheduled_date: fmt(date),
      platform_target: plt !== "All" ? plt : null,
    });
    setShowAssign(null);
  };

  const weekLabel = () => {
    const sm = days[0].toLocaleString("default",{month:"short"});
    const em = days[6].toLocaleString("default",{month:"short"});
    return sm===em
      ? `${sm} ${days[0].getDate()}–${days[6].getDate()}`
      : `${sm} ${days[0].getDate()} – ${em} ${days[6].getDate()}`;
  };

  // Suggest best story for a day based on format balance + archetype variety
  const getSuggested = (dayIdx) => {
    const weekStories = days.flatMap(d => getForDay(d));
    const usedFormats   = weekStories.map(s=>s.format).filter(Boolean);
    const usedArchetypes = weekStories.map(s=>s.archetype).filter(Boolean);
    return ready.map(s => {
      let score = 0;
      if (!usedFormats.includes(s.format)) score += 3;
      if (!usedArchetypes.includes(s.archetype)) score += 2;
      if (s.score_total) score += s.score_total/100;
      return { s, score };
    }).sort((a,b)=>b.score-a.score).map(x=>x.s);
  };

  // Auto-fill week with best stories per empty slot
  const autoFillWeek = () => {
    const emptyFuture = days.filter(d => !isPast(d) && getForDay(d).length === 0);
    let available = [...ready];
    for (const d of emptyFuture) {
      if (!available.length) break;
      const used = days.flatMap(day => getForDay(day));
      const usedFormats    = used.map(s=>s.format).filter(Boolean);
      const usedArchetypes = used.map(s=>s.archetype).filter(Boolean);
      const scored = available.map(s => {
        let score = 0;
        if (!usedFormats.includes(s.format))     score += 3;
        if (!usedArchetypes.includes(s.archetype)) score += 2;
        if (s.score_total) score += s.score_total/100;
        return { s, score };
      }).sort((a,b) => b.score - a.score);
      const pick = scored[0]?.s;
      if (pick) {
        onUpdate(pick.id, { scheduled_date: fmt(d) });
        available = available.filter(s => s.id !== pick.id);
      }
    }
  };

  // Cmd+F = auto-fill week
  useEffect(() => {
    const handler = (e) => {
      if (e.metaKey && e.key === "f" && !e.shiftKey) {
        const tag = document.activeElement?.tagName;
        if (["INPUT","TEXTAREA","SELECT"].includes(tag)) return;
        e.preventDefault();
        autoFillWeek();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [days, ready, stories]);

  // Auto-produce: trigger script generation for all scheduled-but-unscripted stories
  const [producing,    setProducing]    = useState(false);
  const [produceStatus,setProduceStatus]= useState(null);

  const autoProduce = async () => {
    const today2 = new Date(); today2.setHours(0,0,0,0);
    const horizon = new Date(today2.getTime() + 14*86400000);
    const toProcess = stories.filter(s => {
      if (!s.scheduled_date) return false;
      const d = new Date(s.scheduled_date);
      return d >= today2 && d <= horizon && !s.script;
    }).sort((a,b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

    if (!toProcess.length) {
      setProduceStatus("All scheduled stories in the next 2 weeks already have scripts.");
      setTimeout(()=>setProduceStatus(null), 3000);
      return;
    }

    setProducing(true);
    setProduceStatus(`Producing ${toProcess.length} stories...`);

    for (let i=0; i<toProcess.length; i++) {
      const s = toProcess[i];
      setProduceStatus(`Scripting ${i+1}/${toProcess.length} — ${s.title.slice(0,40)}...`);
      try {
        // Trigger script generation via parent
        if (onProduce) await onProduce(s.id);
      } catch(err) {
        setProduceStatus(`Error on "${s.title.slice(0,30)}": ${err.message}`);
        await new Promise(r=>setTimeout(r,2000));
      }
      if (i < toProcess.length-1) await new Promise(r=>setTimeout(r,800));
    }

    setProducing(false);
    setProduceStatus(`✓ Done — ${toProcess.length} stories scripted.`);
    setTimeout(()=>setProduceStatus(null), 4000);
  };

  const scheduledNext14 = (() => {
    const today2 = new Date(); today2.setHours(0,0,0,0);
    const horizon = new Date(today2.getTime() + 14*86400000);
    return stories.filter(s => {
      if (!s.scheduled_date) return false;
      const d = new Date(s.scheduled_date);
      return d >= today2 && d <= horizon;
    });
  })();
  const needsScript = scheduledNext14.filter(s => !s.script).length;

  return (
    <div className="animate-fade-in">

      {/* 3-week coverage */}
      <CoverageSummary stories={stories} weekOffset={weekOffset} />

      {/* Auto-produce banner */}
      {needsScript > 0 && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:9, background:"var(--fill2)", border:"1px solid var(--border)", marginBottom:14 }}>
          <div>
            <span style={{ fontSize:13, fontWeight:500, color:"var(--t1)" }}>{needsScript} scheduled {needsScript===1?"story":"stories"} need{needsScript===1?"s":""} scripting</span>
            <span style={{ fontSize:12, color:"var(--t3)", marginLeft:8 }}>in the next 14 days</span>
          </div>
          <button onClick={autoProduce} disabled={producing} style={{
            padding:"7px 16px", borderRadius:7, fontSize:12, fontWeight:600,
            background: producing?"var(--fill2)":"var(--t1)",
            color: producing?"var(--t3)":"var(--bg)",
            border:"none", cursor: producing?"not-allowed":"pointer",
            display:"flex", alignItems:"center", gap:6,
          }}>
            {producing ? "Producing..." : `⚡ Auto-produce ${needsScript}`}
          </button>
        </div>
      )}
      {produceStatus && (
        <div style={{ padding:"8px 12px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)", fontSize:12, color:"var(--t2)", marginBottom:12 }}>{produceStatus}</div>
      )}

      {/* Controls */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button onClick={()=>setWeekOffset(w=>w-1)} style={{ width:30, height:30, borderRadius:7, border:"1px solid var(--border)", background:"var(--fill2)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ChevronLeft size={14} color="var(--t2)"/>
          </button>
          <div style={{ textAlign:"center", minWidth:140 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"var(--t1)", letterSpacing:"-0.02em" }}>{weekLabel()}</div>
            {weekOffset!==0 && <button onClick={()=>setWeekOffset(0)} style={{ fontSize:10, color:"var(--t3)", background:"transparent", border:"none", cursor:"pointer", padding:0 }}>Today</button>}
          </div>
          <button onClick={()=>setWeekOffset(w=>w+1)} style={{ width:30, height:30, borderRadius:7, border:"1px solid var(--border)", background:"var(--fill2)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ChevronRight size={14} color="var(--t2)"/>
          </button>
        </div>

        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <button onClick={autoFillWeek} style={{
            padding:"5px 12px", borderRadius:7, fontSize:12, fontWeight:500,
            background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", cursor:"pointer",
            display:"flex", alignItems:"center", gap:5,
          }}>
            ⌘F Auto-fill week
          </button>
        </div>
        {/* Platform filter */}
        <div style={{ display:"flex", gap:4 }}>
          {PLATFORMS.map(p => (
            <button key={p} onClick={()=>setPlatform(p)} style={{
              padding:"5px 10px", borderRadius:6, fontSize:11, fontWeight:500,
              background: platform===p?"var(--t1)":"var(--fill2)",
              color:      platform===p?"var(--bg)":"var(--t3)",
              border: platform===p?"1px solid var(--t1)":"1px solid var(--border)",
              cursor:"pointer",
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Week grid */}
      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
        {days.map((d, di) => {
          const items    = getForDay(d).filter(s => platform==="All" || !s.platform_target || s.platform_target===platform);
          const past     = isPast(d);
          const today_   = isToday(d);
          const suggested = getSuggested(di);
          const isGap    = !past && items.length===0;

          return (
            <div key={di} style={{
              borderRadius:9,
              border: today_ ? "1px solid var(--t2)" : isGap ? "1px dashed var(--border)" : "1px solid var(--border2)",
              background: today_ ? "var(--fill2)" : "transparent",
              opacity: past ? 0.45 : 1,
              overflow:"hidden",
            }}>
              {/* Day header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, fontWeight:today_?700:500, color:today_?"var(--t1)":"var(--t3)", width:28 }}>
                    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][di]}
                  </span>
                  <span style={{ fontSize:11, color:"var(--t4)" }}>{d.getMonth()+1}/{d.getDate()}</span>
                  {today_ && <span style={{ fontSize:9, fontWeight:600, padding:"1px 6px", borderRadius:99, background:"var(--t1)", color:"var(--bg)" }}>Today</span>}
                  {isGap && <span style={{ fontSize:10, color:"var(--t4)" }}>empty slot</span>}
                </div>
                {!past && (
                  <button onClick={()=>setShowAssign(showAssign===di?null:di)} style={{
                    width:24, height:24, borderRadius:6, border:"1px solid var(--border)", background: showAssign===di?"var(--t1)":"var(--fill2)",
                    cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    <Plus size={12} color={showAssign===di?"var(--bg)":"var(--t3)"}/>
                  </button>
                )}
              </div>

              {/* Scheduled items */}
              {items.length > 0 && (
                <div style={{ padding:"0 8px 8px" }}>
                  {items.map(s => {
                    const fmtObj = FORMAT_MAP[s.format];
                    const ac     = fmtObj ? fmtObj.color : (ACCENT[s.archetype]||"var(--border)");
                    const ready4 = [!!s.script, !!s.script_fr, !!s.script_es, !!s.script_pt].filter(Boolean).length;
                    return (
                      <div key={s.id} style={{
                        display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:7, marginBottom:3,
                        background:"var(--card)", borderLeft:`3px solid ${ac}`,
                      }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                            {fmtObj && <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background:`${fmtObj.color}15`, color:fmtObj.color, border:`1px solid ${fmtObj.color}25` }}>{fmtObj.label}</span>}
                            <span style={{ fontSize:9, color:"var(--t4)" }}>·</span>
                            <span style={{ fontSize:10, color:ACCENT[s.archetype]||"var(--t3)", fontWeight:500 }}>{s.archetype}</span>
                            {s.platform_target && <span style={{ fontSize:9, color:"var(--t4)", marginLeft:2 }}>{s.platform_target}</span>}
                          </div>
                          <div style={{ fontSize:12, fontWeight:500, color:"var(--t1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</div>
                          <div style={{ display:"flex", gap:3, marginTop:3 }}>
                            {LANGS.filter(l=>l.key==="en"?s.script:s[`script_${l.key}`]).map(l=>(
                              <span key={l.key} style={{ fontSize:8, fontWeight:700, padding:"1px 4px", borderRadius:3, background:"var(--fill2)", color:"var(--t3)" }}>{l.label}</span>
                            ))}
                            <span style={{ fontSize:9, color: ready4===4?"#4A9B7F":"var(--t4)", marginLeft:2 }}>{ready4}/4 langs</span>
                          </div>
                        </div>
                        <button onClick={()=>onUpdate(s.id,{scheduled_date:null})} style={{ width:22, height:22, borderRadius:5, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <X size={11} color="var(--t4)"/>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Assign panel */}
              {showAssign===di && (() => { const assignDay = new Date(d); return (
                <div style={{ margin:"0 8px 8px", padding:"12px", borderRadius:8, background:"var(--bg2)", border:"1px solid var(--border)" }}>
                  <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>
                    Assign to {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][di]} {d.getMonth()+1}/{d.getDate()}
                  </div>

                  {/* Platform select */}
                  <div style={{ display:"flex", gap:4, marginBottom:8 }}>
                    {PLATFORMS.map(p=>(
                      <button key={p} onClick={()=>setPlatform(p)} style={{
                        padding:"3px 8px", borderRadius:5, fontSize:10, fontWeight:500,
                        background:platform===p?"var(--t1)":"var(--fill2)",
                        color:platform===p?"var(--bg)":"var(--t3)",
                        border:"1px solid var(--border)", cursor:"pointer",
                      }}>{p}</button>
                    ))}
                  </div>

                  {!ready.length ? (
                    <div style={{ fontSize:12, color:"var(--t4)" }}>No unscheduled stories ready</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:3, maxHeight:200, overflowY:"auto" }}>
                      {suggested.map((s,i) => {
                        const fmtObj = FORMAT_MAP[s.format];
                        const ac = fmtObj?fmtObj.color:(ACCENT[s.archetype]||"var(--border)");
                        return (
                          <button key={s.id} onClick={()=>assignToDay(s.id,assignDay,platform)} style={{
                            display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:7,
                            background: i===0?"var(--fill2)":"transparent",
                            border: i===0?"1px solid var(--border)":"1px solid transparent",
                            cursor:"pointer", textAlign:"left",
                          }}>
                            <div style={{ width:3, height:32, borderRadius:2, background:ac, flexShrink:0 }}/>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:1 }}>
                                {fmtObj && <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background:`${fmtObj.color}15`, color:fmtObj.color }}>{fmtObj.label}</span>}
                                <span style={{ fontSize:10, color:ACCENT[s.archetype]||"var(--t3)" }}>{s.archetype}</span>
                                {i===0 && <span style={{ fontSize:9, color:"#4A9B7F", fontWeight:600 }}>· Suggested</span>}
                              </div>
                              <div style={{ fontSize:12, color:"var(--t1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</div>
                            </div>
                            {s.score_total && <span style={{ fontSize:11, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"var(--t3)", flexShrink:0 }}>{s.score_total}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ); })()}
            </div>
          );
        })}
      </div>

      {/* Ready bank */}
      <div style={{ marginTop:20, padding:"12px 14px", borderRadius:9, background:"var(--bg2)", border:"1px solid var(--border)" }}>
        <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>
          Ready to schedule — {ready.length} stories
        </div>
        {!ready.length ? (
          <div style={{ fontSize:12, color:"var(--t4)" }}>No stories ready. Approve or script stories in the Pipeline.</div>
        ) : (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {FORMATS.filter(f=>f.key!=="special_edition").map(f => {
              const count = ready.filter(s=>s.format===f.key).length;
              return (
                <span key={f.key} style={{ fontSize:11, padding:"3px 10px", borderRadius:99, background:`${f.color}15`, color:f.color, border:`1px solid ${f.color}25`, fontWeight:600 }}>
                  {f.label} · {count}
                </span>
              );
            })}
            <span style={{ fontSize:11, padding:"3px 10px", borderRadius:99, background:"var(--fill2)", color:"var(--t3)", border:"1px solid var(--border)" }}>
              No format · {ready.filter(s=>!s.format).length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
