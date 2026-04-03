"use client";
import { useState, useEffect } from "react";
import { Shuffle, Trophy, TrendingUp, Eye, Bookmark, Share2, ChevronDown, ChevronRight } from "lucide-react";

// What can be A/B tested
export const AB_VARIABLES = [
  { key: "hook", label: "Hook Style", options: ["Question","Bold Claim","Mystery","Contrast","Direct Quote","Cold Open"] },
  { key: "pacing", label: "Pacing", options: ["Slow Build","Steady","Fast Cut","Climax Heavy","Even"] },
  { key: "music", label: "Music", options: ["Lo-fi Calm","Dramatic Build","Minimal/Ambient","Piano-led","Percussive","No Music"] },
  { key: "visual", label: "Visual Style", options: ["Press Photo Heavy","AI Scene Heavy","Mixed Balanced","Motion Graphic Heavy","Minimal"] },
  { key: "duration", label: "Duration", options: ["Under 40s","40-45s","45-50s","50-55s","Over 55s"] },
  { key: "time", label: "Post Time", options: ["6-9 AM","9-12 PM","12-3 PM","3-6 PM","6-9 PM","9-12 AM"] },
];

const PLATFORMS = ["Instagram", "TikTok", "YouTube Shorts"];

// ─── A/B TEST SETUP (used in Calendar when scheduling) ───
export function ABTestSetup({ story, onSave, onCancel }) {
  const [variable, setVariable] = useState("hook");
  const [variantA, setVariantA] = useState("");
  const [variantB, setVariantB] = useState("");
  const [platformA, setPlatformA] = useState("Instagram");
  const [platformB, setPlatformB] = useState("TikTok");

  const varDef = AB_VARIABLES.find(v => v.key === variable);

  useEffect(() => {
    if (varDef && varDef.options.length >= 2) {
      setVariantA(varDef.options[0]);
      setVariantB(varDef.options[1]);
    }
  }, [variable]);

  const save = () => {
    onSave({
      ab_test: true,
      ab_variable: variable,
      ab_variable_label: varDef?.label,
      ab_variant_a: variantA,
      ab_variant_b: variantB,
      ab_platform_a: platformA,
      ab_platform_b: platformB,
      ab_winner: null,
    });
  };

  return (
    <div style={{ padding: 12, borderRadius: 10, background: "var(--fill)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Shuffle size={13} style={{ color: "var(--gold)" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gold)" }} className="font-display">A/B Test</span>
      </div>

      {/* Variable selector */}
      <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 4, fontWeight: 600 }}>What to test</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {AB_VARIABLES.map(v => (
          <button key={v.key} onClick={() => setVariable(v.key)} style={{
            padding: "5px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600,
            background: variable === v.key ? "var(--gold-subtle)" : "var(--fill)",
            color: variable === v.key ? "var(--gold)" : "var(--t3)",
            border: `1px solid ${variable === v.key ? "var(--gold-border)" : "var(--border2)"}`,
            cursor: "pointer", fontFamily: "inherit",
          }}>{v.label}</button>
        ))}
      </div>

      {/* Variants */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#007AFF", marginBottom: 3 }}>Variant A</div>
          <select value={variantA} onChange={e => setVariantA(e.target.value)}
            style={{ width: "100%", padding: "6px 8px", borderRadius: 8, background: "var(--input)", border: "1px solid var(--border-in)", color: "var(--t1)", fontSize: 11, fontFamily: "inherit", outline: "none" }}>
            {varDef?.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={platformA} onChange={e => setPlatformA(e.target.value)}
            style={{ width: "100%", padding: "4px 8px", borderRadius: 6, background: "var(--fill)", border: "1px solid var(--border2)", color: "var(--t2)", fontSize: 10, fontFamily: "inherit", outline: "none", marginTop: 4 }}>
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", color: "var(--t4)", fontSize: 11, fontWeight: 700 }}>vs</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#FF9500", marginBottom: 3 }}>Variant B</div>
          <select value={variantB} onChange={e => setVariantB(e.target.value)}
            style={{ width: "100%", padding: "6px 8px", borderRadius: 8, background: "var(--input)", border: "1px solid var(--border-in)", color: "var(--t1)", fontSize: 11, fontFamily: "inherit", outline: "none" }}>
            {varDef?.options.filter(o => o !== variantA).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={platformB} onChange={e => setPlatformB(e.target.value)}
            style={{ width: "100%", padding: "4px 8px", borderRadius: 6, background: "var(--fill)", border: "1px solid var(--border2)", color: "var(--t2)", fontSize: 10, fontFamily: "inherit", outline: "none", marginTop: 4 }}>
            {PLATFORMS.filter(p => p !== platformA).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "var(--fill)", border: "1px solid var(--border)", color: "var(--t3)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={save} disabled={variantA === variantB} style={{
          flex: 2, padding: "8px 0", borderRadius: 8,
          background: variantA !== variantB ? "var(--gold-subtle)" : "var(--fill)",
          border: `1px solid ${variantA !== variantB ? "var(--gold-border)" : "var(--border)"}`,
          color: variantA !== variantB ? "var(--gold)" : "var(--t4)",
          fontSize: 11, fontWeight: 600, cursor: variantA !== variantB ? "pointer" : "not-allowed", fontFamily: "inherit",
        }}>Create A/B Test</button>
      </div>
    </div>
  );
}

// ─── A/B TEST RESULTS (used in Analyze tab) ───
export function ABTestResults({ stories }) {
  const [expanded, setExpanded] = useState(null);
  const tests = stories.filter(s => s.ab_test);
  if (!tests.length) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Shuffle size={13} style={{ color: "var(--gold)" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }} className="font-display">A/B Tests</span>
        <span style={{ fontSize: 11, color: "var(--t3)" }}>{tests.length}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {tests.map(s => {
          const hasMetrics = s.ab_metrics_a_views && s.ab_metrics_b_views;
          const isOpen = expanded === s.id;

          // Determine winner
          let winner = null;
          if (hasMetrics) {
            const scoreA = (parseFloat(s.ab_metrics_a_completion) || 0) * 0.4 + (parseFloat(s.ab_metrics_a_saves) || 0) * 0.3 + (parseFloat(s.ab_metrics_a_shares) || 0) * 0.3;
            const scoreB = (parseFloat(s.ab_metrics_b_completion) || 0) * 0.4 + (parseFloat(s.ab_metrics_b_saves) || 0) * 0.3 + (parseFloat(s.ab_metrics_b_shares) || 0) * 0.3;
            winner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "tie";
          }

          return (
            <div key={s.id} style={{ borderRadius: 10, background: "var(--card)", border: "1px solid var(--border2)", overflow: "hidden" }}>
              <button onClick={() => setExpanded(isOpen ? null : s.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                background: "none", border: "none", cursor: "pointer", textAlign: "left",
              }}>
                <Shuffle size={12} style={{ color: "var(--gold)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>
                    {s.ab_variable_label}: {s.ab_variant_a} vs {s.ab_variant_b}
                  </div>
                </div>
                {winner && winner !== "tie" && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                    background: winner === "A" ? "rgba(0,122,255,0.1)" : "rgba(255,149,0,0.1)",
                    color: winner === "A" ? "#007AFF" : "#FF9500",
                  }}>{winner === "A" ? s.ab_variant_a : s.ab_variant_b} wins</span>
                )}
                {!hasMetrics && <span style={{ fontSize: 9, color: "var(--t4)" }}>Awaiting data</span>}
                {isOpen ? <ChevronDown size={14} style={{ color: "var(--t4)" }} /> : <ChevronRight size={14} style={{ color: "var(--t4)" }} />}
              </button>

              {isOpen && (
                <div style={{ padding: "0 12px 12px" }}>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {/* Variant A */}
                    <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "rgba(0,122,255,0.04)", border: "1px solid rgba(0,122,255,0.1)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#007AFF", marginBottom: 4 }}>A: {s.ab_variant_a}</div>
                      <div style={{ fontSize: 9, color: "var(--t3)", marginBottom: 4 }}>{s.ab_platform_a}</div>
                      {hasMetrics ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <MetricRow icon={Eye} label="Views" value={s.ab_metrics_a_views} winner={winner === "A"} />
                          <MetricRow icon={TrendingUp} label="Compl." value={`${s.ab_metrics_a_completion}%`} winner={winner === "A"} />
                          <MetricRow icon={Bookmark} label="Saves" value={s.ab_metrics_a_saves} winner={winner === "A"} />
                          <MetricRow icon={Share2} label="Shares" value={s.ab_metrics_a_shares} winner={winner === "A"} />
                        </div>
                      ) : <div style={{ fontSize: 10, color: "var(--t4)" }}>No data yet</div>}
                    </div>

                    {/* Variant B */}
                    <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "rgba(255,149,0,0.04)", border: "1px solid rgba(255,149,0,0.1)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#FF9500", marginBottom: 4 }}>B: {s.ab_variant_b}</div>
                      <div style={{ fontSize: 9, color: "var(--t3)", marginBottom: 4 }}>{s.ab_platform_b}</div>
                      {hasMetrics ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <MetricRow icon={Eye} label="Views" value={s.ab_metrics_b_views} winner={winner === "B"} />
                          <MetricRow icon={TrendingUp} label="Compl." value={`${s.ab_metrics_b_completion}%`} winner={winner === "B"} />
                          <MetricRow icon={Bookmark} label="Saves" value={s.ab_metrics_b_saves} winner={winner === "B"} />
                          <MetricRow icon={Share2} label="Shares" value={s.ab_metrics_b_shares} winner={winner === "B"} />
                        </div>
                      ) : <div style={{ fontSize: 10, color: "var(--t4)" }}>No data yet</div>}
                    </div>
                  </div>

                  {winner && winner !== "tie" && (
                    <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(52,199,89,0.06)", border: "1px solid rgba(52,199,89,0.12)", display: "flex", alignItems: "center", gap: 6 }}>
                      <Trophy size={12} style={{ color: "#34C759" }} />
                      <span style={{ fontSize: 11, color: "#34C759", fontWeight: 600 }}>
                        {winner === "A" ? s.ab_variant_a : s.ab_variant_b} outperformed on {winner === "A" ? s.ab_platform_a : s.ab_platform_b}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricRow({ icon: Icon, label, value, winner }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Icon size={9} style={{ color: "var(--t4)" }} />
        <span style={{ fontSize: 9, color: "var(--t3)" }}>{label}</span>
      </div>
      <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: winner ? "#34C759" : "var(--t2)" }}>{value || "—"}</span>
    </div>
  );
}

// ─── A/B TEST BADGE (for story cards) ───
export function ABBadge({ story }) {
  if (!story.ab_test) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
      background: "var(--gold-subtle)", color: "var(--gold)",
    }}>
      <Shuffle size={8} />A/B
    </span>
  );
}
