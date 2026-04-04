"use client";
import { useState, useEffect } from "react";
import { TrendingUp, Eye, Bookmark, Share2, Clock, Heart, MessageCircle, UserPlus, BarChart3 } from "lucide-react";
import { STAGES, ACCENT, HOOK_STYLES, PACING_OPTS, MUSIC_OPTS, VISUAL_OPTS, DURATION_OPTS, POST_TIMES } from "@/lib/constants";

export default function AnalyzeView({ stories, onUpdate }) {
  const [selId, setSelId] = useState(null);
  const [metric, setMetric] = useState("metrics_completion");
  const published = stories.filter(s => s.status === "published" || s.metrics_views);
  const sel = stories.find(s => s.id === selId);
  const [form, setForm] = useState({});

  useEffect(() => {
    if (sel) setForm({
      metrics_views: sel.metrics_views || "",
      metrics_completion: sel.metrics_completion || "",
      metrics_watch_time: sel.metrics_watch_time || "",
      metrics_likes: sel.metrics_likes || "",
      metrics_comments: sel.metrics_comments || "",
      metrics_saves: sel.metrics_saves || "",
      metrics_shares: sel.metrics_shares || "",
      metrics_follows: sel.metrics_follows || "",
      hook_style: sel.hook_style || "",
      pacing: sel.pacing || "",
      music_mood: sel.music_mood || "",
      visual_style: sel.visual_style || "",
      duration: sel.duration || "",
      post_time: sel.post_time || "",
    });
  }, [selId]);

  const saveMetrics = () => {
    onUpdate(selId, { ...form, status: "published" });
    setSelId(null);
  };

  const analyzeField = (field) => {
    const g = {};
    for (const ep of published) {
      const v = ep[field];
      if (!v) continue;
      if (!g[v]) g[v] = [];
      const n = parseFloat(ep[metric]);
      if (!isNaN(n)) g[v].push(n);
    }
    return Object.entries(g)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => ({ label: k, count: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length }))
      .sort((a, b) => b.avg - a.avg);
  };

  const fields = [
    { key: "archetype", label: "Archetype" },
    { key: "era", label: "Era" },
    { key: "hook_style", label: "Hook Style" },
    { key: "pacing", label: "Pacing" },
    { key: "music_mood", label: "Music" },
    { key: "visual_style", label: "Visuals" },
    { key: "duration", label: "Duration" },
    { key: "post_time", label: "Post Time" },
  ];

  const metricOpts = [
    { key: "metrics_completion", label: "Completion", Icon: TrendingUp },
    { key: "metrics_views", label: "Views", Icon: Eye },
    { key: "metrics_saves", label: "Saves", Icon: Bookmark },
    { key: "metrics_shares", label: "Shares", Icon: Share2 },
  ];

  const selStyle = "px-2.5 py-1.5 rounded-lg text-[10px] outline-none";

  return (
    <div className="animate-fade-in">
      {/* Quick log */}
      <div className="text-[11px] text-white/35 font-semibold mb-1.5">Log Metrics</div>
      <select value={selId || ""} onChange={e => setSelId(e.target.value || null)}
        className="w-full py-2.5 px-3 rounded-xl text-[13px] outline-none mb-2.5"
        style={{ background: "var(--fill2)", border: "1px solid var(--border-in)", color: selId ? "#fff" : "rgba(255,255,255,0.3)" }}>
        <option value="">Select episode...</option>
        {stories.filter(s => !["rejected", "archived"].includes(s.status)).map(s => (
          <option key={s.id} value={s.id}>{s.title} ({STAGES[s.status]?.label})</option>
        ))}
      </select>

      {sel && (
        <div className="rounded-xl p-3.5 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="text-[14px] font-bold font-display text-white mb-2.5" style={{ letterSpacing: "-0.02em" }}>{sel.title}</div>

          {/* Production vars */}
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {[
              { k: "hook_style", o: HOOK_STYLES },
              { k: "pacing", o: PACING_OPTS },
              { k: "music_mood", o: MUSIC_OPTS },
              { k: "visual_style", o: VISUAL_OPTS },
              { k: "duration", o: DURATION_OPTS },
              { k: "post_time", o: POST_TIMES },
            ].map(({ k, o }) => (
              <select key={k} value={form[k] || ""} onChange={e => setForm(f => ({ ...f, [k]: e.target.value || null }))}
                className={selStyle}
                style={{ background: "var(--fill2)", border: "1px solid var(--border-in)", color: form[k] ? "#B8860B" : "rgba(255,255,255,0.25)" }}>
                <option value="">{k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
                {o.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            ))}
          </div>

          {/* Metrics */}
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {[
              { k: "metrics_views", I: Eye, p: "Views" },
              { k: "metrics_completion", I: TrendingUp, p: "Completion %" },
              { k: "metrics_watch_time", I: Clock, p: "Watch Time" },
              { k: "metrics_likes", I: Heart, p: "Likes" },
              { k: "metrics_comments", I: MessageCircle, p: "Comments" },
              { k: "metrics_saves", I: Bookmark, p: "Saves" },
              { k: "metrics_shares", I: Share2, p: "Shares" },
              { k: "metrics_follows", I: UserPlus, p: "Follows" },
            ].map(({ k, I, p }) => (
              <div key={k} className="relative">
                <I size={10} className="absolute left-2 top-2 text-(--t4)" />
                <input value={form[k] || ""} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                  placeholder={p} type="number"
                  className="w-[90px] py-1.5 pl-6 pr-2 rounded-lg text-[11px] outline-none"
                  style={{ background: "var(--fill2)", border: "1px solid var(--border-in)", color: "var(--t1)" }} />
              </div>
            ))}
          </div>

          <button onClick={saveMetrics}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all"
            style={{ background: "linear-gradient(135deg, rgba(184,134,11,0.2), rgba(184,134,11,0.08))", color: "#B8860B", border: "none", cursor: "pointer" }}>
            Save Metrics
          </button>
        </div>
      )}

      {/* Analysis */}
      {published.length >= 3 && (
        <div>
          <div className="flex gap-1.5 mb-3.5">
            {metricOpts.map(m => (
              <button key={m.key} onClick={() => setMetric(m.key)}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-all"
                style={{ background: metric === m.key ? "rgba(184,134,11,0.12)" : "rgba(255,255,255,0.04)", color: metric === m.key ? "#B8860B" : "rgba(255,255,255,0.35)", border: "none", cursor: "pointer" }}>
                <m.Icon size={11} />{m.label}
              </button>
            ))}
          </div>

          {fields.map(f => {
            const analysis = analyzeField(f.key);
            if (!analysis.length) return null;
            const mx = Math.max(...analysis.map(a => a.avg)) * 1.1;
            return (
              <div key={f.key} className="mb-3.5">
                <div className="text-[11px] font-semibold text-white/35 mb-1.5" style={{ letterSpacing: "-0.01em" }}>{f.label}</div>
                {analysis.map((item, i) => (
                  <div key={item.label} className="mb-1">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[11px] text-white/45">{item.label} ({item.count})</span>
                      <span className="text-[11px] font-bold font-mono" style={{ color: i === 0 ? "#34C759" : "#B8860B" }}>{item.avg.toFixed(1)}</span>
                    </div>
                    <div className="w-full h-1 rounded-full" style={{ background: "var(--card)" }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(item.avg / mx) * 100}%`, background: i === 0 ? "#34C759" : "#B8860B" }} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {published.length < 3 && (
        <div className="text-center py-8 text-white/15 text-[12px]">
          Log 3+ episodes to see analysis
        </div>
      )}
    </div>
  );
}
