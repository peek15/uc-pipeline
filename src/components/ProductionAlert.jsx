"use client";
import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, TrendingUp, Calendar, FileText, X, ArrowRight, RefreshCw } from "lucide-react";
import { FORMAT_MAP, FORMATS, ARCHETYPES, ACCENT } from "@/lib/constants";

const HEALTHY_STOCK = 20;
const LOW_STOCK     = 10;
const HORIZON_DAYS  = 21;
const CADENCE       = 5; // posts per week

function getReadyStories(stories) {
  return stories.filter(s => ["approved","scripted","produced"].includes(s.status));
}

function getDaysUntilGap(stories, ready) {
  const scheduled = stories.filter(s => s.scheduled_date && s.status !== "rejected");
  const today = new Date();
  const horizon = new Date(today.getTime() + HORIZON_DAYS * 86400000);

  // Count scheduled slots in horizon
  const scheduledInHorizon = scheduled.filter(s => {
    const d = new Date(s.scheduled_date);
    return d >= today && d <= horizon;
  }).length;

  // Total slots in horizon (5/week * 3 weeks)
  const totalSlots = Math.round(HORIZON_DAYS / 7 * CADENCE);
  const covered = scheduledInHorizon + ready.length;
  const gap = totalSlots - covered;

  if (gap <= 0) return null;
  // Days until we run out
  const daysOfBuffer = Math.floor(covered / CADENCE * 7);
  return Math.max(0, daysOfBuffer);
}

function getFormatBalance(stories, ready) {
  const scheduled = stories.filter(s => s.scheduled_date && ["produced","scripted","approved"].includes(s.status));
  const alerts = [];

  for (const fmt of FORMATS) {
    if (fmt.key === "special_edition") continue;
    const readyCount = ready.filter(s => s.format === fmt.key).length;
    const scheduledCount = scheduled.filter(s => s.format === fmt.key).length;
    const total = readyCount + scheduledCount;
    if (total < 2) {
      alerts.push({ format: fmt, readyCount, scheduledCount, total });
    }
  }
  return alerts;
}

function getBestPerformers(stories) {
  const published = stories.filter(s => s.status === "published" && s.metrics_completion);
  if (published.length < 5) return null;

  // Group by archetype + era combo
  const combos = {};
  for (const s of published) {
    const key = `${s.archetype}|${s.era}`;
    if (!combos[key]) combos[key] = { archetype: s.archetype, era: s.era, completions: [], count: 0 };
    combos[key].completions.push(parseFloat(s.metrics_completion)||0);
    combos[key].count++;
  }
  const sorted = Object.values(combos)
    .filter(c => c.count >= 2)
    .map(c => ({ ...c, avg: c.completions.reduce((a,b)=>a+b,0)/c.completions.length }))
    .sort((a,b) => b.avg - a.avg);
  return sorted[0] || null;
}

function getMissingTranslations(stories) {
  const scripted = stories.filter(s => s.script && ["scripted","produced"].includes(s.status));
  return scripted.filter(s => !s.script_fr || !s.script_es || !s.script_pt).length;
}

function getCalendarGaps(stories) {
  const today = new Date();
  const horizon = new Date(today.getTime() + HORIZON_DAYS * 86400000);
  const totalSlots = Math.round(HORIZON_DAYS / 7 * CADENCE);
  const scheduled = stories.filter(s => {
    if (!s.scheduled_date) return false;
    const d = new Date(s.scheduled_date);
    return d >= today && d <= horizon;
  }).length;
  return { totalSlots, scheduled, empty: Math.max(0, totalSlots - scheduled) };
}

export default function ProductionAlert({ stories, onNavigate, onPrefillResearch, forceExpanded, onToggle }) {
  const [dismissed, setDismissed] = useState(new Set());
  const [_expanded, _setExpanded] = useState(true);
  const expanded  = forceExpanded !== undefined ? forceExpanded : _expanded;
  const setExpanded = onToggle || _setExpanded;

  const ready        = getReadyStories(stories);
  const stockLevel   = ready.length;
  const daysUntilGap = getDaysUntilGap(stories, ready);
  const formatAlerts = getFormatBalance(stories, ready);
  const bestPerformer= getBestPerformers(stories);
  const missingTrans = getMissingTranslations(stories);
  const calGaps      = getCalendarGaps(stories);

  const stockColor  = stockLevel >= HEALTHY_STOCK ? "#4A9B7F" : stockLevel >= LOW_STOCK ? "#C49A3C" : "#C0666A";
  const stockLabel  = stockLevel >= HEALTHY_STOCK ? "Healthy" : stockLevel >= LOW_STOCK ? "Low" : "Critical";

  // Build alert bullets
  const bullets = [];

  // Stock alert
  if (stockLevel < HEALTHY_STOCK) {
    bullets.push({
      id: "stock",
      icon: AlertTriangle,
      color: stockColor,
      text: `${stockLevel} stories ready — ${stockLabel.toLowerCase()} stock. Target is ${HEALTHY_STOCK}+.`,
      action: { label: "Research more", fn: () => onNavigate("research") },
    });
  }

  // Days until gap
  if (daysUntilGap !== null && daysUntilGap < 14) {
    bullets.push({
      id: "gap",
      icon: Calendar,
      color: "#C0666A",
      text: `Coverage gap in ~${daysUntilGap} days based on current stock + calendar (${calGaps.scheduled}/${calGaps.totalSlots} slots filled in next 3 weeks).`,
      action: { label: "Fill calendar", fn: () => onNavigate("calendar") },
    });
  }

  // Format balance
  formatAlerts.forEach(({ format, total }) => {
    if (dismissed.has(`fmt-${format.key}`)) return;
    bullets.push({
      id: `fmt-${format.key}`,
      icon: ArrowRight,
      color: format.color,
      text: `Low on ${format.label} stories — only ${total} ready or scheduled in next 3 weeks.`,
      action: { label: `Research ${format.label}`, fn: () => { onPrefillResearch({ format: format.key }); onNavigate("research"); } },
      dismissible: true,
    });
  });

  // Best performer recommendation
  if (bestPerformer && !dismissed.has("best")) {
    bullets.push({
      id: "best",
      icon: TrendingUp,
      color: "#4A9B7F",
      text: `${bestPerformer.archetype} + ${bestPerformer.era} averaging ${Math.round(bestPerformer.avg)}% completion — your best performing combo. Find more.`,
      action: { label: "Research this", fn: () => { onPrefillResearch({ archetype: bestPerformer.archetype, era: bestPerformer.era }); onNavigate("research"); } },
      dismissible: true,
    });
  }

  // Missing translations
  if (missingTrans > 0 && !dismissed.has("trans")) {
    bullets.push({
      id: "trans",
      icon: FileText,
      color: "#C49A3C",
      text: `${missingTrans} scripted ${missingTrans===1?"story":"stories"} missing FR/ES/PT translations — blocking full publishing readiness.`,
      action: { label: "Go to Script", fn: () => onNavigate("script") },
      dismissible: true,
    });
  }

  // No alerts
  if (bullets.length === 0) return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:10, background:"var(--fill2)", border:"1px solid var(--border)", marginBottom:16, fontSize:12, color:"var(--t3)" }}>
      <span style={{ width:8, height:8, borderRadius:"50%", background:"#4A9B7F", display:"inline-block", flexShrink:0 }} />
      Production looks healthy — {stockLevel} stories ready, calendar well-covered.
    </div>
  );

  const visibleBullets = bullets.filter(b => !dismissed.has(b.id));
  if (visibleBullets.length === 0) return null;

  return (
    <div style={{ borderRadius:10, border:"1px solid var(--border)", background:"var(--card)", marginBottom:20, overflow:"hidden" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom: expanded ? "1px solid var(--border2)" : "none", cursor:"pointer" }}
        onClick={() => setExpanded(e=>!e)}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ width:8, height:8, borderRadius:"50%", background:stockColor, display:"inline-block" }} />
          <span style={{ fontSize:12, fontWeight:600, color:"var(--t1)" }}>
            Production · {stockLabel} · {stockLevel} ready
          </span>
          {!expanded && <span style={{ fontSize:11, color:"var(--t3)" }}>· {visibleBullets.length} alert{visibleBullets.length!==1?"s":""}</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:10, color:"var(--t4)", fontFamily:"'DM Mono',monospace" }}>⌘J</span>
          <span style={{ fontSize:12, color:"var(--t4)" }}>{expanded?"↑":"↓"}</span>
        </div>
      </div>

      {/* Bullets */}
      {expanded && (
        <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:8 }}>
          {visibleBullets.map(b => {
            const Icon = b.icon;
            return (
              <div key={b.id} style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                <Icon size={13} color={b.color} style={{ flexShrink:0, marginTop:1 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <span style={{ fontSize:12, color:"var(--t2)", lineHeight:1.5 }}>{b.text} </span>
                  {b.action && (
                    <button onClick={b.action.fn} style={{ fontSize:12, color:b.color, background:"transparent", border:"none", cursor:"pointer", padding:0, fontWeight:600, textDecoration:"underline" }}>
                      {b.action.label} →
                    </button>
                  )}
                </div>
                {b.dismissible && (
                  <button onClick={()=>setDismissed(d=>new Set([...d,b.id]))} style={{ width:18, height:18, borderRadius:4, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <X size={11} color="var(--t4)" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
