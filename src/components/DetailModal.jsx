"use client";
import { useState } from "react";
import { X, Circle, Check, FileText, Film, Award, Archive } from "lucide-react";
import { STAGES, LANGS, ACCENT, FORMATS, FORMAT_MAP, HOOK_TYPES, EMOTIONAL_ANGLES } from "@/lib/constants";

const ICONS = { accepted: Circle, approved: Check, scripted: FileText, produced: Film, published: Award, rejected: X, archived: Archive };
function wc(t) { return (t||"").trim().split(/\s+/).filter(w=>w.length>0).length; }

function ReadinessChecklist({ story }) {
  const checks = [
    { label: "Script (EN)",      done: !!story.script },
    { label: "Translation FR",   done: !!story.script_fr },
    { label: "Translation ES",   done: !!story.script_es },
    { label: "Translation PT",   done: !!story.script_pt },
    { label: "Hook written",     done: !!story.hook },
    { label: "Format assigned",  done: !!story.format },
    { label: "AI score",         done: story.score_total != null },
    { label: "Scheduled",        done: !!story.scheduled_date },
  ];
  const done  = checks.filter(c => c.done).length;
  const total = checks.length;
  const pct   = Math.round((done / total) * 100);
  const color = pct === 100 ? "#4A9B7F" : pct >= 60 ? "#C49A3C" : "var(--t3)";

  return (
    <div style={{ padding:"14px 16px", borderRadius:10, background:"var(--bg2)", border:"1px solid var(--border)", marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <span style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Publishing Readiness</span>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:60, height:3, borderRadius:2, background:"var(--bg3)", overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:2 }} />
          </div>
          <span style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Mono',monospace", color }}>{done}/{total}</span>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 16px" }}>
        {checks.map((c, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:16, height:16, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background: c.done ? color : "var(--bg3)", border: c.done ? "none" : "1px solid var(--border)" }}>
              {c.done && <Check size={9} color="white" />}
            </div>
            <span style={{ fontSize:12, color: c.done ? "var(--t1)" : "var(--t4)", fontWeight: c.done ? 500 : 400 }}>{c.label}</span>
          </div>
        ))}
      </div>
      {pct === 100 && (
        <div style={{ marginTop:10, padding:"6px 10px", borderRadius:6, background:"rgba(74,155,127,0.1)", border:"1px solid rgba(74,155,127,0.2)", fontSize:11, color:"#4A9B7F", fontWeight:600, textAlign:"center" }}>
          ✓ Ready to publish
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:10, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>{label}</div>
      {children}
    </div>
  );
}

export default function DetailModal({ story, onClose, onDelete, onStageChange, onUpdate }) {
  const st   = STAGES[story.status] || STAGES.accepted;
  const Icon = ICONS[story.status] || Circle;
  const ac   = ACCENT[story.archetype] || "var(--border)";
  const fmt  = FORMAT_MAP[story.format];

  const [editing, setEditing] = useState(false);
  const [localFormat,   setLocalFormat]   = useState(story.format || "");
  const [localHookType, setLocalHookType] = useState(story.hook_type || "");
  const [localAngle,    setLocalAngle]    = useState(story.emotional_angle || "");
  const [localReach,    setLocalReach]    = useState(story.reach_score ?? "");
  const [localPtCleared,setLocalPtCleared]= useState(story.pt_review_cleared || false);

  const saveEdits = () => {
    if (onUpdate) {
      onUpdate(story.id, {
        format:          localFormat || null,
        hook_type:       localHookType || null,
        emotional_angle: localAngle || null,
        reach_score:     localReach !== "" ? parseInt(localReach) : null,
        pt_review_cleared: localPtCleared,
      });
    }
    setEditing(false);
  };

  const selectStyle = { width:"100%", padding:"7px 10px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none", fontFamily:"inherit" };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(8px)" }}
      className="animate-fade-in" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="anim-slide"
        style={{ width:"100%", maxWidth:640, maxHeight:"92vh", overflowY:"auto", background:"var(--sheet)", borderRadius:"16px 16px 0 0", padding:"20px 24px 40px", borderTop:`3px solid ${ac}` }}>

        <div style={{ width:36, height:4, borderRadius:2, background:"var(--t4)", margin:"0 auto 20px" }} />

        {/* Status + meta row */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, flexWrap:"wrap" }}>
          <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:99, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)" }}>
            <Icon size={11} />{st.label}
          </span>
          <span style={{ fontSize:11, color:ac, fontWeight:500 }}>{story.archetype}</span>
          {story.era && <span style={{fontSize:11,color:"var(--t3)"}}>{story.era}</span>}
          {fmt && (
            <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:99, background:`${fmt.color}15`, color:fmt.color, border:`1px solid ${fmt.color}30` }}>
              {fmt.label}
            </span>
          )}
          {story.score_total != null && (
            <span style={{ fontSize:11, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"var(--t2)", marginLeft:"auto" }}>
              {story.score_total}<span style={{fontSize:9,color:"var(--t3)",fontWeight:400}}>/100</span>
              {story.reach_score != null && <span style={{fontSize:9,color:"var(--t3)",fontWeight:400}}> · reach {story.reach_score}</span>}
            </span>
          )}
        </div>

        <h2 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.2, color:"var(--t1)", marginBottom:6 }}>{story.title}</h2>
        {story.players && <div style={{ fontSize:13, color:"var(--t3)", marginBottom:16 }}>{Array.isArray(story.players) ? story.players.join(", ") : story.players}</div>}

        {story.angle && <div style={{ fontSize:14, color:"var(--t2)", lineHeight:1.7, marginBottom:12 }}>{story.angle}</div>}
        {story.hook && (
          <div style={{ fontSize:13, color:"var(--t3)", fontStyle:"italic", paddingLeft:14, borderLeft:`2px solid ${ac}40`, lineHeight:1.5, marginBottom:18 }}>
            "{story.hook}"
          </div>
        )}

        {story.script && (
          <div style={{ borderRadius:8, padding:"14px 16px", background:"var(--bg2)", border:"1px solid var(--border)", marginBottom:12, maxHeight:180, overflowY:"auto" }}>
            <div style={{ fontSize:11, color:"var(--t4)", marginBottom:8, fontFamily:"'DM Mono',monospace" }}>v{story.script_version||1} · {wc(story.script)} words</div>
            <div style={{ fontSize:14, color:"var(--t2)", lineHeight:1.8, fontFamily:"Georgia, serif", whiteSpace:"pre-wrap" }}>{story.script}</div>
          </div>
        )}

        {/* Lang badges + PT flag */}
        {story.script && (
          <div style={{ display:"flex", gap:4, alignItems:"center", marginBottom:20 }}>
            {LANGS.filter(l => l.key==="en" ? story.script : story[`script_${l.key}`]).map(l => (
              <span key={l.key} style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{l.label}</span>
            ))}
            {story.script_pt && (
              <span style={{ fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:4, background: story.pt_review_cleared ? "rgba(74,155,127,0.1)" : "rgba(196,154,60,0.1)", color: story.pt_review_cleared ? "#4A9B7F" : "#C49A3C", border: `1px solid ${story.pt_review_cleared ? "rgba(74,155,127,0.2)" : "rgba(196,154,60,0.2)"}` }}>
                PT {story.pt_review_cleared ? "✓ cleared" : "⚠ needs review"}
              </span>
            )}
          </div>
        )}

        {/* Publishing readiness */}
        <ReadinessChecklist story={story} />

        {/* ── Metadata editor ── */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Intelligence Metadata</span>
            <button onClick={() => editing ? saveEdits() : setEditing(true)} style={{
              padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:600,
              background: editing ? "var(--t1)" : "var(--fill2)",
              color: editing ? "var(--bg)" : "var(--t2)",
              border:"1px solid var(--border)", cursor:"pointer",
            }}>
              {editing ? "Save" : "Edit"}
            </button>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {/* Format */}
            <FieldRow label="Format">
              {editing ? (
                <select value={localFormat} onChange={e=>setLocalFormat(e.target.value)} style={selectStyle}>
                  <option value="">— Select format —</option>
                  {FORMATS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              ) : (
                <div style={{ fontSize:13, color: fmt ? fmt.color : "var(--t4)", fontWeight: fmt ? 500 : 400 }}>
                  {fmt ? fmt.label : "Not set"}
                </div>
              )}
            </FieldRow>

            {/* Hook type */}
            <FieldRow label="Hook Type">
              {editing ? (
                <select value={localHookType} onChange={e=>setLocalHookType(e.target.value)} style={selectStyle}>
                  <option value="">— Select hook —</option>
                  {HOOK_TYPES.map(h => <option key={h.key} value={h.key}>{h.label}</option>)}
                </select>
              ) : (
                <div style={{ fontSize:13, color: story.hook_type ? "var(--t1)" : "var(--t4)" }}>
                  {HOOK_TYPES.find(h=>h.key===story.hook_type)?.label || "Not set"}
                </div>
              )}
            </FieldRow>

            {/* Emotional angle */}
            <FieldRow label="Emotional Angle">
              {editing ? (
                <select value={localAngle} onChange={e=>setLocalAngle(e.target.value)} style={selectStyle}>
                  <option value="">— Select angle —</option>
                  {EMOTIONAL_ANGLES.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase()+a.slice(1)}</option>)}
                </select>
              ) : (
                <div style={{ fontSize:13, color: story.emotional_angle ? "var(--t1)" : "var(--t4)", textTransform:"capitalize" }}>
                  {story.emotional_angle || "Not set"}
                </div>
              )}
            </FieldRow>

            {/* Reach score */}
            <FieldRow label="Reach Score">
              {editing ? (
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <input type="range" min="0" max="100" value={localReach||0} onChange={e=>setLocalReach(e.target.value)}
                    style={{ flex:1 }} />
                  <span style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"var(--t1)", minWidth:28 }}>{localReach||0}</span>
                </div>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ flex:1, height:3, borderRadius:2, background:"var(--bg3)" }}>
                    <div style={{ height:"100%", width:`${story.reach_score||0}%`, background:"var(--t1)", borderRadius:2 }} />
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Mono',monospace", color: story.reach_score ? "var(--t1)" : "var(--t4)" }}>
                    {story.reach_score ?? "—"}
                  </span>
                </div>
              )}
            </FieldRow>
          </div>

          {/* PT review flag */}
          {story.script_pt && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)", marginTop:10 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:500, color:"var(--t1)" }}>PT Translation Reviewed</div>
                <div style={{ fontSize:11, color:"var(--t3)" }}>Required before PT can be scheduled</div>
              </div>
              {editing ? (
                <button onClick={()=>setLocalPtCleared(p=>!p)} style={{
                  width:44, height:24, borderRadius:12, border:"none", cursor:"pointer",
                  background: localPtCleared ? "#4A9B7F" : "var(--t4)", position:"relative", transition:"background 0.2s",
                }}>
                  <div style={{ position:"absolute", top:3, left: localPtCleared ? 22 : 3, width:18, height:18, borderRadius:"50%", background:"white", transition:"left 0.2s" }} />
                </button>
              ) : (
                <span style={{ fontSize:12, fontWeight:600, color: story.pt_review_cleared ? "#4A9B7F" : "#C49A3C" }}>
                  {story.pt_review_cleared ? "Cleared" : "Pending"}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Stage change */}
        <div style={{ fontSize:11, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Move to stage</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:20 }}>
          {Object.entries(STAGES).map(([key, s]) => {
            const SI = ICONS[key]||Circle;
            const active = story.status === key;
            return (
              <button key={key} onClick={() => { onStageChange(story.id,key); onClose(); }} style={{
                padding:"6px 12px", borderRadius:7, fontSize:12, fontWeight: active ? 600 : 400,
                background: active ? "var(--t1)" : "var(--fill2)",
                color: active ? "var(--bg)" : "var(--t2)",
                border: active ? "1px solid var(--t1)" : "1px solid var(--border)",
                cursor:"pointer", display:"flex", alignItems:"center", gap:5,
              }}>
                <SI size={11} />{s.label}
              </button>
            );
          })}
        </div>

        <button onClick={() => { onDelete(story.id); onClose(); }} style={{
          width:"100%", padding:"10px", borderRadius:8, fontSize:13, fontWeight:500,
          background:"transparent", color:"var(--t4)", border:"1px solid var(--border)",
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
        }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--t3)";e.currentTarget.style.color="var(--t2)";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--t4)";}}>
          <X size={13} /> Delete story
        </button>
      </div>
    </div>
  );
}
