"use client";
import { useState, useMemo, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Plus, RefreshCw, ShieldCheck, AlertCircle } from "lucide-react";
import { ACCENT, FORMAT_MAP, FORMATS } from "@/lib/constants";
import { matches, shouldIgnoreFromInput, SHORTCUTS } from "@/lib/shortcuts";
import { PageHeader, Panel, Pill, buttonStyle } from "@/components/OperationalUI";
import { getBrandLanguages, getBrandProgrammeMap, getStoryScript } from "@/lib/brandConfig";

const PLATFORMS = ["TikTok","Instagram","YouTube","All"];
const DEFAULT_CADENCE = 5;

function fmt(d)     { return d.toISOString().split("T")[0]; }
function isToday(d) { return fmt(d) === fmt(new Date()); }
function isPast(d)  { const t = new Date(); t.setHours(0,0,0,0); return d < t; }

// 3-week coverage summary
function CoverageSummary({ stories, weekOffset, cadence=DEFAULT_CADENCE }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const horizon = new Date(today.getTime() + 21*86400000);
  const totalSlots = Math.round(21/7*cadence);

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
  const color     = covered >= totalSlots ? "var(--success)" : covered >= totalSlots*0.6 ? "var(--warning)" : "var(--error)";

  // Format balance in next 3 weeks
  const fmtCounts = {};
  for (const s of [...scheduled, ...ready]) {
    const f = s.format||"standard";
    fmtCounts[f] = (fmtCounts[f]||0) + 1;
  }

  return (
    <Panel style={{ height:"100%" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <span style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>3-week coverage</span>
        <span style={{ fontSize:12, fontWeight:700, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color }}>{covered}/{totalSlots} slots</span>
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
    </Panel>
  );
}

function gateStatus(story) {
  if (story.quality_gate_status) return story.quality_gate_status;
  if (Number(story.quality_gate_blockers) > 0) return "blocked";
  if (Number(story.quality_gate_warnings) > 0) return "warnings";
  if (story.quality_gate) return "passed";
  return "missing";
}

function CalendarAuditPanel({ audit, onAutoFill, onSafeFill }) {
  const scoreColor = audit.score >= 85 ? "var(--success)" : audit.score >= 65 ? "var(--warning)" : "var(--error)";
  const issueRows = [
    { key:"missing", label:"Open slots", value:audit.missingSlots, tone:audit.missingSlots ? "var(--warning)" : "var(--success)" },
    { key:"quality", label:"Quality flags", value:audit.qualityFlags.length, tone:audit.qualityFlags.length ? "var(--error)" : "var(--success)" },
    { key:"script", label:"Need scripts", value:audit.needsScript.length, tone:audit.needsScript.length ? "var(--warning)" : "var(--success)" },
    { key:"sequence", label:"Sequence issues", value:audit.sequenceIssues.length, tone:audit.sequenceIssues.length ? "var(--warning)" : "var(--success)" },
  ];

  return (
    <Panel style={{ height:"100%" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:9 }}>
          <div style={{ width:28, height:28, borderRadius:7, background:"var(--fill2)", border:"0.5px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ShieldCheck size={14} color={scoreColor}/>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:"var(--t1)" }}>Weekly planner audit</div>
            <div style={{ fontSize:11, color:"var(--t3)" }}>{audit.scheduledCount}/{audit.cadence} target slots · {audit.safeReadyCount} safe ready stories</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:18, fontWeight:700, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:scoreColor }}>{audit.score}</span>
          <button onClick={onSafeFill} disabled={!audit.missingSlots || !audit.safeReadyCount} style={{
            padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:600,
            background:audit.missingSlots&&audit.safeReadyCount?"var(--t1)":"var(--fill2)",
            color:audit.missingSlots&&audit.safeReadyCount?"var(--bg)":"var(--t3)",
            border:"0.5px solid var(--border)", cursor:audit.missingSlots&&audit.safeReadyCount?"pointer":"not-allowed",
          }}>Auto-fill safe</button>
          <button onClick={onAutoFill} disabled={!audit.missingSlots} style={{
            padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight:500,
            background:"var(--fill2)", color:audit.missingSlots?"var(--t2)":"var(--t4)",
            border:"0.5px solid var(--border)", cursor:audit.missingSlots?"pointer":"not-allowed",
          }}>Auto-fill week</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:8, marginBottom:12 }}>
        {issueRows.map(row => (
          <div key={row.key} style={{ padding:"9px 10px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)" }}>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>{row.label}</div>
            <div style={{ fontSize:17, fontWeight:700, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:row.tone }}>{row.value}</div>
          </div>
        ))}
      </div>

      {(audit.formatGaps.length || audit.qualityFlags.length || audit.sequenceIssues.length) ? (
        <div style={{ display:"grid", gap:6 }}>
          {audit.formatGaps.slice(0,3).map(gap => (
            <div key={gap.format} style={{ display:"flex", alignItems:"center", gap:7, fontSize:11, color:"var(--t3)" }}>
              <AlertCircle size={12} color="var(--warning)"/>
              <span>{gap.label} is under target this week: {gap.actual}/{gap.target}.</span>
            </div>
          ))}
          {audit.qualityFlags.slice(0,3).map(item => (
            <div key={item.id} style={{ display:"flex", alignItems:"center", gap:7, fontSize:11, color:"var(--t3)" }}>
              <AlertCircle size={12} color={item.status==="blocked"?"var(--error)":"var(--warning)"}/>
              <span>{item.title} · {item.status === "missing" ? "not audited" : item.status}.</span>
            </div>
          ))}
          {audit.sequenceIssues.slice(0,2).map(item => (
            <div key={item.key} style={{ display:"flex", alignItems:"center", gap:7, fontSize:11, color:"var(--t3)" }}>
              <AlertCircle size={12} color="var(--warning)"/>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize:11, color:"var(--success)" }}>Week looks balanced against current cadence, quality, and sequence rules.</div>
      )}
    </Panel>
  );
}

export default function CalendarView({ stories, onUpdate, onProduce, settings, campaigns = [] }) {
  const languages = useMemo(() => getBrandLanguages(settings), [settings]);
  const programmeMap = useMemo(() => getBrandProgrammeMap(settings), [settings]);
  const [weekOffset,      setWeekOffset]      = useState(0);
  const [showAssign,      setShowAssign]       = useState(null); // day index
  const [platform,        setPlatform]         = useState("All");
  const [planPreview,     setPlanPreview]      = useState(null);
  const [campaignFilter,  setCampaignFilter]   = useState("");

  const activeCampaign = useMemo(() =>
    campaignFilter ? campaigns.find(c => c.id === campaignFilter) || null : null,
    [campaignFilter, campaigns]
  );

  // Read from settings — fall back to defaults
  const cadence   = settings?.strategy?.weekly_cadence || DEFAULT_CADENCE;
  const formatMix = settings?.strategy?.format_mix || { standard:60, classics:25, performance_special:15, special_edition:0 };
  const seqRules  = settings?.strategy?.sequence_rules || { no_consecutive_classics:true, no_consecutive_performance_special:true };

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

  const getForDay = (d) => stories.filter(s =>
    s.scheduled_date === fmt(d) &&
    (!campaignFilter || s.campaign_id === campaignFilter)
  );

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
    setPlanPreview(null);
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

  const weekAudit = useMemo(() => {
    const scheduled = days.flatMap(d => getForDay(d));
    const futureScheduled = days.filter(d => !isPast(d)).flatMap(d => getForDay(d));
    const missingSlots = Math.max(0, cadence - scheduled.length);

    const targets = {};
    for (const [key, pct] of Object.entries(formatMix)) {
      if (key !== "special_edition") targets[key] = Math.round((pct/100) * cadence);
    }

    const fmtCounts = {};
    for (const s of scheduled) {
      const key = s.format || "standard";
      fmtCounts[key] = (fmtCounts[key] || 0) + 1;
    }
    const formatGaps = Object.entries(targets)
      .map(([format, target]) => ({
        format,
        label: FORMAT_MAP[format]?.label || format,
        target,
        actual: fmtCounts[format] || 0,
      }))
      .filter(row => row.target > 0 && row.actual < row.target)
      .sort((a,b) => (b.target-b.actual) - (a.target-a.actual));

    const qualityFlags = futureScheduled
      .map(s => ({ id:s.id, title:s.title, status:gateStatus(s) }))
      .filter(s => ["blocked","warnings","missing"].includes(s.status));
    const needsScript = futureScheduled.filter(s => !s.script);

    const sequenceIssues = [];
    for (let i = 1; i < days.length; i++) {
      const prev = getForDay(days[i-1])[0];
      const curr = getForDay(days[i])[0];
      if (!prev || !curr) continue;
      const prevFmt = prev.format || "standard";
      const currFmt = curr.format || "standard";
      if (seqRules.no_consecutive_classics && prevFmt === "classics" && currFmt === "classics") {
        sequenceIssues.push({ key:`classic-${i}`, message:`Back-to-back Classics on ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i-1]} and ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}.` });
      }
      if (seqRules.no_consecutive_performance_special && prevFmt === "performance_special" && currFmt === "performance_special") {
        sequenceIssues.push({ key:`perf-${i}`, message:`Back-to-back Performance Specials on ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i-1]} and ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}.` });
      }
      if (seqRules.no_consecutive_same_format && prevFmt === currFmt) {
        sequenceIssues.push({ key:`same-${i}`, message:`Same format repeats on consecutive days: ${FORMAT_MAP[currFmt]?.label || currFmt}.` });
      }
    }

    const safeReadyCount = ready.filter(s => gateStatus(s) !== "blocked").length;
    const penalty = missingSlots*10 + qualityFlags.length*12 + needsScript.length*5 + sequenceIssues.length*8 + formatGaps.length*4;
    return {
      cadence,
      scheduledCount: scheduled.length,
      missingSlots,
      formatGaps,
      qualityFlags,
      needsScript,
      sequenceIssues,
      safeReadyCount,
      score: Math.max(0, Math.min(100, 100 - penalty)),
    };
  }, [days, stories, ready, cadence, formatMix, seqRules]);

  // Auto-fill week respecting cadence + format mix + sequence rules
  const buildAutoFillPlan = ({ safeOnly=false } = {}) => {
    const futureDays = days.filter(d => !isPast(d) && getForDay(d).length === 0);
    // Respect weekly cadence — only fill up to target
    const alreadyScheduled = days.filter(d => !isPast(d) && getForDay(d).length > 0).length;
    const slotsToFill = Math.max(0, cadence - alreadyScheduled);
    const emptyFuture = futureDays.slice(0, slotsToFill);
    if (!emptyFuture.length) return [];

    // Calculate target count per format this week based on mix percentages
    const targets = {};
    for (const [fmt, pct] of Object.entries(formatMix)) {
      targets[fmt] = Math.round((pct/100) * cadence);
    }
    // Count already scheduled formats this week
    const scheduled = days.flatMap(d => getForDay(d));
    const fmtCounts = {};
    for (const s of scheduled) { fmtCounts[s.format||"standard"] = (fmtCounts[s.format||"standard"]||0)+1; }

    let available = safeOnly ? ready.filter(s => gateStatus(s) !== "blocked") : [...ready];
    let lastFormat = scheduled[scheduled.length-1]?.format || null;
    const placed = [];

    for (const d of emptyFuture) {
      if (!available.length) break;

      // Pick format that still needs filling, respecting sequence rules
      const neededFormats = Object.entries(targets)
        .filter(([f, target]) => (fmtCounts[f]||0) < target && f !== "special_edition")
        .sort((a,b) => ((fmtCounts[a[0]]||0)/a[1]) - ((fmtCounts[b[0]]||0)/b[1]))
        .map(([f])=>f);

      // Apply sequence rules
      const allowedFormats = neededFormats.filter(f => {
        if (seqRules.no_consecutive_classics && f==="classics" && lastFormat==="classics") return false;
        if (seqRules.no_consecutive_performance_special && f==="performance_special" && lastFormat==="performance_special") return false;
        if (seqRules.no_consecutive_same_format && f===lastFormat) return false;
        return true;
      });

      const targetFormat = allowedFormats[0] || neededFormats[0] || "standard";

      // Pick best available story matching target format
      const candidates = available
        .filter(s => (s.format||"standard") === targetFormat)
        .sort((a,b) => ((b.score_total||0)+(b.reach_score||0)) - ((a.score_total||0)+(a.reach_score||0)));

      // Fall back to any format if none available
      const pick = candidates[0] || available.sort((a,b) => ((b.score_total||0)+(b.reach_score||0)) - ((a.score_total||0)+(a.reach_score||0)))[0];

      if (pick) {
        placed.push({ story: pick, date: fmt(d), platform_target: platform !== "All" ? platform : null });
        fmtCounts[pick.format||"standard"] = (fmtCounts[pick.format||"standard"]||0)+1;
        lastFormat = pick.format||"standard";
        available = available.filter(s => s.id !== pick.id);
      }
    }
    return placed;
  };

  const previewAutoFill = ({ safeOnly=false } = {}) => {
    setPlanPreview({ safeOnly, placements: buildAutoFillPlan({ safeOnly }) });
  };

  const applyPlanPreview = async () => {
    const placements = planPreview?.placements || [];
    for (const p of placements) {
      await onUpdate(p.story.id, { scheduled_date: p.date, platform_target: p.platform_target });
    }
    setPlanPreview(null);
  };

  const autoFillWeek = ({ safeOnly=false } = {}) => {
    const placements = buildAutoFillPlan({ safeOnly });
    placements.forEach(p => onUpdate(p.story.id, { scheduled_date: p.date, platform_target: p.platform_target }));
  };

  // Alt+F = auto-fill week
  useEffect(() => {
    const handler = (e) => {
      if (matches(e, SHORTCUTS.calendarAutoFill.combo)) {
        if (shouldIgnoreFromInput()) return;
        e.preventDefault();
        previewAutoFill();
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

      <PageHeader
        title="Schedule"
        description="Plan the visible week, check cadence and quality pressure, then move scheduled stories into scripting and production."
        meta={`${scheduledNext14.length} scheduled · ${ready.length} ready`}
      />

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:12, marginBottom:16 }}>
        <CoverageSummary stories={stories} weekOffset={weekOffset} cadence={cadence} />
        <CalendarAuditPanel
          audit={weekAudit}
          onAutoFill={() => previewAutoFill()}
          onSafeFill={() => previewAutoFill({ safeOnly:true })}
        />
      </div>

      {planPreview && (
        <Panel style={{ marginBottom:14, border:"0.5px solid var(--warning)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--t1)", marginBottom:3 }}>
                {planPreview.safeOnly ? "Safe auto-fill preview" : "Auto-fill preview"}
              </div>
              <div style={{ fontSize:11, color:"var(--t3)" }}>
                Review the proposed schedule before committing dates to stories.
              </div>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button onClick={applyPlanPreview} disabled={!planPreview.placements.length} style={buttonStyle("primary", { opacity:planPreview.placements.length ? 1 : 0.45 })}>
                Apply plan
              </button>
              <button onClick={()=>setPlanPreview(null)} style={buttonStyle("ghost")}>Discard</button>
            </div>
          </div>
          {planPreview.placements.length ? (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:8 }}>
              {planPreview.placements.map(p => {
                const d = new Date(p.date);
                const fmtObj = programmeMap[p.story.format] || FORMAT_MAP[p.story.format];
                const gate = gateStatus(p.story);
                const usedIds = new Set(planPreview.placements.filter(pl => pl.date !== p.date).map(pl => pl.story.id));
                const swapOptions = ready.filter(s => s.id !== p.story.id && !usedIds.has(s.id));
                const gateColor = gate==="blocked" ? "var(--error)" : gate==="warnings" ? "var(--warning)" : gate==="passed" ? "var(--success)" : "var(--t4)";
                return (
                  <div key={`${p.story.id}-${p.date}`} style={{ padding:"9px 10px", borderRadius:8, background:"var(--fill2)", border:"0.5px solid var(--border)", borderLeft:`3px solid ${fmtObj?.color || "var(--border)"}`, display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:10, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                        {d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" })}
                      </span>
                      <button onClick={() => setPlanPreview(prev => ({ ...prev, placements: prev.placements.filter(pl => !(pl.date===p.date && pl.story.id===p.story.id)) }))}
                        style={{ width:16, height:16, borderRadius:3, border:"none", background:"transparent", color:"var(--t4)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
                        <X size={11}/>
                      </button>
                    </div>
                    <div style={{ fontSize:12, fontWeight:600, color:"var(--t1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.story.title}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                      <span style={{ fontSize:10, color:"var(--t4)" }}>{fmtObj?.label || p.story.format || "—"}</span>
                      {p.story.score_total != null && (
                        <span style={{ fontSize:10, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:"var(--t3)" }}>· {p.story.score_total}</span>
                      )}
                      {gate !== "missing" && (
                        <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, border:`0.5px solid ${gateColor}40`, color:gateColor, background:`${gateColor}12` }}>
                          {gate === "passed" ? "gate ✓" : gate === "blocked" ? "blocked" : "warnings"}
                        </span>
                      )}
                    </div>
                    {swapOptions.length > 0 && (
                      <select
                        value=""
                        onChange={e => {
                          const newStory = ready.find(s => s.id === e.target.value);
                          if (!newStory) return;
                          setPlanPreview(prev => ({ ...prev, placements: prev.placements.map(pl => pl.date===p.date && pl.story.id===p.story.id ? { ...pl, story:newStory } : pl) }));
                        }}
                        style={{ marginTop:2, width:"100%", fontSize:10, borderRadius:5, border:"0.5px solid var(--border)", background:"var(--bg2)", color:"var(--t3)", padding:"3px 5px", outline:"none", cursor:"pointer", fontFamily:"inherit" }}
                      >
                        <option value="">Swap story…</option>
                        {swapOptions.slice(0, 8).map(s => (
                          <option key={s.id} value={s.id}>{s.title.slice(0,36)}{s.score_total ? ` · ${s.score_total}` : ""}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize:12, color:"var(--t4)" }}>No eligible empty future slots or ready stories for this week.</div>
          )}
        </Panel>
      )}

      {/* Auto-produce banner */}
      {needsScript > 0 && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:9, background:"var(--fill2)", border:"0.5px solid var(--border)", marginBottom:14 }}>
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
            {producing ? <><RefreshCw size={12} className="spin" /> Producing...</> : `⚡ Auto-produce ${needsScript}`}
          </button>
        </div>
      )}
      {produceStatus && (
        <div style={{ padding:"8px 12px", borderRadius:7, background:"var(--fill2)", border:"0.5px solid var(--border)", fontSize:12, color:"var(--t2)", marginBottom:12 }}>{produceStatus}</div>
      )}

      {/* Controls */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button onClick={()=>setWeekOffset(w=>w-1)} style={{ width:30, height:30, borderRadius:7, border:"0.5px solid var(--border)", background:"var(--fill2)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ChevronLeft size={14} color="var(--t2)"/>
          </button>
          <div style={{ textAlign:"center", minWidth:140 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"var(--t1)", letterSpacing:0 }}>{weekLabel()}</div>
            {weekOffset!==0 && <button onClick={()=>setWeekOffset(0)} style={{ fontSize:10, color:"var(--t3)", background:"transparent", border:"none", cursor:"pointer", padding:0 }}>Today</button>}
          </div>
          <button onClick={()=>setWeekOffset(w=>w+1)} style={{ width:30, height:30, borderRadius:7, border:"0.5px solid var(--border)", background:"var(--fill2)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ChevronRight size={14} color="var(--t2)"/>
          </button>
        </div>

        <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
          <button onClick={() => previewAutoFill()} style={buttonStyle("secondary", { padding:"5px 12px" })}>
            ⌥P Preview auto-fill
          </button>
          {/* Campaign filter */}
          {campaigns.length > 0 && (
            <select
              value={campaignFilter}
              onChange={e => setCampaignFilter(e.target.value)}
              style={{
                height: 30, borderRadius: 7, fontSize: 11, padding: "0 8px",
                border: campaignFilter ? `0.5px solid ${activeCampaign?.color || "var(--border)"}` : "0.5px solid var(--border)",
                background: campaignFilter ? `${activeCampaign?.color || "#4A9B7F"}14` : "var(--fill2)",
                color: campaignFilter ? (activeCampaign?.color || "var(--t2)") : "var(--t2)",
                outline: "none", fontFamily: "inherit", cursor: "pointer", fontWeight: campaignFilter ? 600 : 400,
              }}
            >
              <option value="">All campaigns</option>
              {campaigns.filter(c => c.status !== "archived").map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        {/* Platform filter */}
        <div style={{ display:"flex", gap:4 }}>
          {PLATFORMS.map(p => (
            <button key={p} onClick={()=>setPlatform(p)} style={{
              padding:"5px 10px", borderRadius:6, fontSize:11, fontWeight:500,
              background: platform===p?"var(--t1)":"var(--fill2)",
              color:      platform===p?"var(--bg)":"var(--t3)",
              border: platform===p?"0.5px solid var(--t1)":"0.5px solid var(--border)",
              cursor:"pointer",
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Campaign week legend — shows campaigns with stories in the visible week */}
      {(() => {
        const weekStoryIds = new Set(days.flatMap(d => getForDay(d).map(s => s.id)));
        const weekCampaigns = campaigns
          .filter(c => c.status !== "archived" && stories.some(s => s.campaign_id === c.id && weekStoryIds.has(s.id)));
        if (!weekCampaigns.length) return null;
        return (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontSize: 10, color: "var(--t4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>This week:</span>
            {weekCampaigns.map(c => {
              const count = stories.filter(s => s.campaign_id === c.id && weekStoryIds.has(s.id)).length;
              const active = campaignFilter === c.id;
              return (
                <button key={c.id} onClick={() => setCampaignFilter(active ? "" : c.id)} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99,
                  background: active ? `${c.color}20` : "var(--fill2)",
                  border: `0.5px solid ${active ? c.color : "var(--border)"}`,
                  cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 500,
                  color: active ? c.color : "var(--t3)",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                  {c.name} <span style={{ color: "var(--t4)", fontWeight: 400 }}>{count}</span>
                </button>
              );
            })}
            {campaignFilter && <button onClick={() => setCampaignFilter("")} style={{ fontSize: 10, color: "var(--t4)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px" }}>Clear ×</button>}
          </div>
        );
      })()}

      {/* Week grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(168px, 1fr))", gap:8, alignItems:"stretch" }}>
        {days.map((d, di) => {
          const items    = getForDay(d).filter(s => platform==="All" || !s.platform_target || s.platform_target===platform);
          const past     = isPast(d);
          const today_   = isToday(d);
          const suggested = getSuggested(di);
          const isGap    = !past && items.length===0;
          const inCampaignRange = activeCampaign && activeCampaign.start_date && activeCampaign.end_date &&
            fmt(d) >= activeCampaign.start_date && fmt(d) <= activeCampaign.end_date;

          return (
            <div key={di} style={{
              borderRadius:9,
              border: today_ ? "1px solid var(--t2)" : isGap ? "1px dashed var(--border)" : "1px solid var(--border2)",
              background: inCampaignRange ? `${activeCampaign.color}10` : today_ ? "var(--fill2)" : "transparent",
              opacity: past ? 0.45 : 1,
              overflow:"hidden",
              minHeight:220,
              display:"flex",
              flexDirection:"column",
            }}
              onDragOver={(e)=>{ if (!past) e.preventDefault(); }}
              onDrop={(e)=>{
                if (past) return;
                const id = e.dataTransfer.getData("text/story-id");
                if (id) assignToDay(id, d, platform);
              }}>
              {/* Day header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, fontWeight:today_?700:500, color:today_?"var(--t1)":"var(--t3)", width:28 }}>
                    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][di]}
                  </span>
                  <span style={{ fontSize:11, color:"var(--t4)" }}>{d.getMonth()+1}/{d.getDate()}</span>
                  {today_ && <Pill active>Today</Pill>}
                  {isGap && <Pill>Empty</Pill>}
                </div>
                {!past && (
                  <button onClick={()=>setShowAssign(showAssign===di?null:di)} style={{
                    width:24, height:24, borderRadius:6, border:"0.5px solid var(--border)", background: showAssign===di?"var(--t1)":"var(--fill2)",
                    cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    <Plus size={12} color={showAssign===di?"var(--bg)":"var(--t3)"}/>
                  </button>
                )}
              </div>

              {/* Scheduled items */}
              {items.length > 0 && (
                <div style={{ padding:"0 8px 8px", flex:1 }}>
                  {items.map(s => {
                    const fmtObj = programmeMap[s.format] || FORMAT_MAP[s.format];
                    const ac     = fmtObj ? fmtObj.color : "var(--border)";
                    const readyCount = languages.filter(l => getStoryScript(s, l.key)).length;
                    const storyColor = campaigns.find(c => c.id === s.campaign_id)?.color;
                    return (
                      <div key={s.id} draggable={!past} onDragStart={(e)=>e.dataTransfer.setData("text/story-id", s.id)} style={{
                        display:"flex", alignItems:"center", gap:8, padding:"var(--card-padding-y, 8px) var(--card-padding-x, 10px)", borderRadius:7, marginBottom:"var(--card-gap, 3px)",
                        background:"var(--card)", borderLeft:`3px solid ${ac}`, cursor:past ? "default" : "grab",
                        borderTop: storyColor ? `2px solid ${storyColor}` : undefined,
                      }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                            {fmtObj && <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background:`${fmtObj.color}15`, color:fmtObj.color, border:`1px solid ${fmtObj.color}25` }}>{fmtObj.label}</span>}
                            <span style={{ fontSize:9, color:"var(--t4)" }}>·</span>
                            <span style={{ fontSize:10, color:ACCENT[s.archetype]||"var(--t3)", fontWeight:500 }}>{s.archetype}</span>
                            {s.platform_target && <span style={{ fontSize:9, color:"var(--t4)", marginLeft:2 }}>{s.platform_target}</span>}
                          </div>
                          <div style={{ fontSize:12, fontWeight:500, color:"var(--t1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</div>
                          {storyColor && !campaignFilter && (
                            <div style={{ fontSize: 9, fontWeight: 600, color: storyColor, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.85 }}>
                              {campaigns.find(c => c.id === s.campaign_id)?.name}
                            </div>
                          )}
                          <div style={{ display:"flex", gap:3, marginTop:3 }}>
                            {languages.filter(l => getStoryScript(s, l.key)).map(l=>(
                              <span key={l.key} style={{ fontSize:8, fontWeight:700, padding:"1px 4px", borderRadius:3, background:"var(--fill2)", color:"var(--t3)" }}>{l.label}</span>
                            ))}
                            <span style={{ fontSize:9, color: readyCount===languages.length?"var(--success)":"var(--t4)", marginLeft:2 }}>{readyCount}/{languages.length} langs</span>
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
                <div style={{ margin:"0 8px 8px", padding:"12px", borderRadius:8, background:"var(--bg2)", border:"0.5px solid var(--border)" }}>
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
                        border:"0.5px solid var(--border)", cursor:"pointer",
                      }}>{p}</button>
                    ))}
                  </div>

                  {!ready.length ? (
                    <div style={{ fontSize:12, color:"var(--t4)" }}>No unscheduled stories ready</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:3, maxHeight:200, overflowY:"auto" }}>
                      {suggested.map((s,i) => {
                        const fmtObj = programmeMap[s.format] || FORMAT_MAP[s.format];
                        const ac = fmtObj?.color || "var(--border)";
                        return (
                          <button key={s.id} onClick={()=>assignToDay(s.id,assignDay,platform)} style={{
                            display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:7,
                            background: i===0?"var(--fill2)":"transparent",
                            border: i===0?"0.5px solid var(--border)":"0.5px solid transparent",
                            cursor:"pointer", textAlign:"left",
                          }}>
                            <div style={{ width:3, height:32, borderRadius:2, background:ac, flexShrink:0 }}/>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:1 }}>
                                {fmtObj && <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background:`${fmtObj.color}15`, color:fmtObj.color }}>{fmtObj.label}</span>}
                                <span style={{ fontSize:10, color:ACCENT[s.archetype]||"var(--t3)" }}>{s.archetype}</span>
                                {i===0 && <span style={{ fontSize:9, color:"var(--success)", fontWeight:600 }}>· Suggested</span>}
                              </div>
                              <div style={{ fontSize:12, color:"var(--t1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</div>
                            </div>
                            {s.score_total && <span style={{ fontSize:11, fontWeight:700, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:"var(--t3)", flexShrink:0 }}>{s.score_total}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ); })()}
              {!items.length && !showAssign && (
                <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"14px", color:"var(--t4)", fontSize:11, textAlign:"center" }}>
                  {past ? "No post" : "Open slot"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Ready bank */}
      <div style={{ marginTop:20, padding:"12px 14px", borderRadius:9, background:"var(--bg2)", border:"0.5px solid var(--border)" }}>
        <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>
          Ready to schedule — {ready.length} stories
        </div>
        {!ready.length ? (
          <div style={{ fontSize:12, color:"var(--t4)" }}>No stories ready. Approve or script stories in the Pipeline.</div>
        ) : (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:6, marginBottom:12 }}>
              {ready.slice(0, 12).map(s => {
                const fmtObj = programmeMap[s.format] || FORMAT_MAP[s.format];
                const ac = fmtObj?.color || "var(--border)";
                return (
                  <div key={s.id} draggable onDragStart={(e)=>e.dataTransfer.setData("text/story-id", s.id)} style={{ padding:"8px 10px", borderRadius:7, background:"var(--card)", border:"0.5px solid var(--border)", borderLeft:`3px solid ${ac}`, cursor:"grab" }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"var(--t1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</div>
                    <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:3, fontSize:10, color:"var(--t4)" }}>
                      <span>{fmtObj?.label || "No format"}</span>
                      {s.score_total && <span style={{ fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}>{s.score_total}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {FORMATS.filter(f=>f.key!=="special_edition").map(f => {
                const count = ready.filter(s=>s.format===f.key).length;
                return (
                  <span key={f.key} style={{ fontSize:11, padding:"3px 10px", borderRadius:99, background:`${f.color}15`, color:f.color, border:`1px solid ${f.color}25`, fontWeight:600 }}>
                    {f.label} · {count}
                  </span>
                );
              })}
              <span style={{ fontSize:11, padding:"3px 10px", borderRadius:99, background:"var(--fill2)", color:"var(--t3)", border:"0.5px solid var(--border)" }}>
                No format · {ready.filter(s=>!s.format).length}
                </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
