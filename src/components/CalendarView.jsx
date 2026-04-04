"use client";
import { useState } from "react";
import { X, Check, Clock } from "lucide-react";
import { STAGES, ACCENT, ARCHETYPES, LANGS } from "@/lib/constants";

export default function CalendarView({ stories, onUpdate }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAssign, setShowAssign] = useState(null);

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const fmt = d => d.toISOString().split("T")[0];
  const dayLabel = d => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.getDay() === 0 ? 6 : d.getDay() - 1];
  const monthDay = d => `${d.getMonth() + 1}/${d.getDate()}`;
  const isToday = d => fmt(d) === fmt(today);

  const getForDay = d => stories.filter(s => s.scheduled_date === fmt(d));
  const ready = stories.filter(s => ["approved", "scripted", "produced"].includes(s.status) && !s.scheduled_date);

  const recentArchetypes = days.flatMap(d => getForDay(d).map(s => s.archetype)).filter(Boolean);
  const suggestArchetype = () => {
    const counts = {};
    for (const a of ARCHETYPES) counts[a] = 0;
    for (const a of recentArchetypes) counts[a] = (counts[a] || 0) + 1;
    return ARCHETYPES.sort((a, b) => counts[a] - counts[b])[0];
  };

  const published = stories.filter(s => s.metrics_completion);
  const bestTime = () => {
    if (published.length < 5) return null;
    const byTime = {};
    for (const s of published) {
      if (!s.post_time) continue;
      if (!byTime[s.post_time]) byTime[s.post_time] = [];
      byTime[s.post_time].push(parseFloat(s.metrics_completion));
    }
    let best = null, bestAvg = 0;
    for (const [time, vals] of Object.entries(byTime)) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (avg > bestAvg) { bestAvg = avg; best = time; }
    }
    return best;
  };

  const assignToDay = (storyId, date) => {
    onUpdate(storyId, { scheduled_date: fmt(date), status: "produced" });
    setShowAssign(null);
  };

  const sugArch = suggestArchetype();
  const bt = bestTime();
  const bankSize = stories.filter(s => ["approved", "scripted", "produced"].includes(s.status)).length;
  const emptyDays = days.filter(d => getForDay(d).length === 0 && d >= today).length;

  const weekLabel = () => {
    const sm = days[0].toLocaleString("default", { month: "short" });
    const em = days[6].toLocaleString("default", { month: "short" });
    return sm === em ? `${sm} ${days[0].getDate()}–${days[6].getDate()}` : `${sm} ${days[0].getDate()} – ${em} ${days[6].getDate()}`;
  };

  return (
    <div className="animate-fade-in">
      {/* Health */}
      <div className="flex gap-2 mb-3.5 overflow-x-auto pb-0.5" style={{ WebkitOverflowScrolling: "touch" }}>
        {[
          { label: "Story Bank", value: bankSize, color: bankSize > 7 ? "#34C759" : bankSize > 3 ? "#FF9F0A" : "#FF3B30", sub: `${bankSize} days` },
          { label: "Empty Days", value: emptyDays, color: emptyDays === 0 ? "#34C759" : "#FF9F0A" },
          bt && { label: "Best Time", value: bt, color: "#5AC8FA" },
          sugArch && { label: "Suggest", value: sugArch, color: ACCENT[sugArch] || "#B8860B" },
        ].filter(Boolean).map((s, i) => (
          <div key={i} className="shrink-0 px-3 py-2 rounded-xl text-center min-w-[70px]" style={{ background: "var(--card)", border: "1px solid var(--border2)" }}>
            <div className="text-[13px] font-bold font-display" style={{ color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
            <div className="text-[8px] text-[var(--t4)] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Week nav */}
      <div className="flex justify-between items-center mb-3">
        <button onClick={() => setWeekOffset(w => w - 1)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--t3)] text-[14px]" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>‹</button>
        <div className="text-center">
          <div className="text-[15px] font-bold font-display text-[var(--t1)]" style={{ letterSpacing: "-0.02em" }}>{weekLabel()}</div>
          {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-[10px] mt-0.5 bg-transparent border-none cursor-pointer" style={{ color: "var(--t2)" }}>Today</button>}
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--t3)] text-[14px]" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>›</button>
      </div>

      {/* Days */}
      <div className="flex flex-col gap-1">
        {days.map((d, di) => {
          const items = getForDay(d);
          const isPast = d < today && !isToday(d);
          const tod = isToday(d);
          return (
            <div key={di} className="rounded-xl p-2.5" style={{ background: tod ? "var(--fill2)" : "transparent", border: `1px solid ${tod ? "var(--border-in)" : "var(--border2)"}`, opacity: isPast ? 0.5 : 1 }}>
              <div className="flex justify-between items-center" style={{ marginBottom: items.length > 0 || showAssign === di ? 8 : 0 }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-bold" style={{ color: tod ? "var(--t1)" : "var(--t3)", fontWeight: tod ? 700 : 600 }}>{dayLabel(d)}</span>
                  <span className="text-[11px] text-[var(--t3)]">{monthDay(d)}</span>
                  {tod && <span className="text-[9px] font-semibold px-1.5 rounded-full" style={{ color: "var(--t1)", background: "var(--fill2)", border: "1px solid var(--border)" }}>Today</span>}
                </div>
                {!isPast && (
                  <button onClick={() => setShowAssign(showAssign === di ? null : di)}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--t3)] text-[16px]"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}>+</button>
                )}
              </div>

              {items.map(s => {
                const ac = ACCENT[s.archetype] || "#FF9F0A";
                return (
                  <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1" style={{ background: `${ac}10`, borderLeft: `3px solid ${ac}`, borderRadius:6 }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold truncate" style={{color:"var(--t1)"}}>{s.title}</div>
                      <div className="text-[9px] text-[var(--t3)] flex items-center gap-1">
                        <span>{s.archetype} · {s.era}</span>
                        {LANGS.filter(l => l.key === "en" ? s.script : s[`script_${l.key}`]).map(l => (
                          <span key={l.key} className="text-[7px] font-bold px-0.5 rounded" style={{ color: l.color, background: `${l.color}15` }}>{l.label}</span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => onUpdate(s.id, { scheduled_date: null })}
                      className="w-5 h-5 rounded flex items-center justify-center"
                      style={{ background: "rgba(255,59,48,0.06)", border: "none", cursor: "pointer" }}>
                      <X size={11} color="rgba(255,59,48,0.4)" />
                    </button>
                  </div>
                );
              })}

              {showAssign === di && (
                <div className="mt-1.5 p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="text-[9px] text-[var(--t3)] font-semibold mb-1.5">Assign to {dayLabel(d)} {monthDay(d)}</div>
                  {!ready.length ? <div className="text-[11px] text-[var(--t4)]">No unscheduled stories</div> : (
                    <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
                      {ready.map(s => {
                        const ac = ACCENT[s.archetype] || "#FF9F0A";
                        const isSug = s.archetype === sugArch;
                        return (
                          <button key={s.id} onClick={() => assignToDay(s.id, d)}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left transition-all"
                            style={{ background: isSug ? `${ac}10` : "rgba(255,255,255,0.02)", border: `1px solid ${isSug ? `${ac}20` : "rgba(255,255,255,0.04)"}` }}>
                            <div className="w-1 h-5 rounded-sm shrink-0" style={{ background: ac }} />
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-semibold truncate" style={{color:"var(--t1)"}}>{s.title}</div>
                              <div className="text-[9px] text-[var(--t3)]">{s.archetype}{isSug ? " · Suggested" : ""}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {!items.length && showAssign !== di && !isPast && <div className="text-[10px] text-[var(--t4)] mt-0.5">No episode</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
