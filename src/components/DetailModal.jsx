"use client";
import { useState, useEffect } from "react";
import { X, Circle, Check, FileText, Film, Award, Archive, ChevronLeft, ChevronRight } from "lucide-react";
import { STAGES, LANGS, ACCENT, FORMATS, FORMAT_MAP, HOOK_TYPES, EMOTIONAL_ANGLES } from "@/lib/constants";

const ICONS = { accepted:Circle, approved:Check, scripted:FileText, produced:Film, published:Award, rejected:X, archived:Archive };
function wc(t) { return (t||"").trim().split(/\s+/).filter(w=>w.length>0).length; }

function getReadiness(s) {
  return [!!s.script,!!s.script_fr,!!s.script_es,!!s.script_pt,!!s.hook,!!s.format,s.score_total!=null,!!s.scheduled_date].filter(Boolean).length;
}

function ScoreRow({ label, value, max=100, muted=false }) {
  if (value==null) return null;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:11,color:"var(--t3)",width:80,flexShrink:0}}>{label}</span>
      <div style={{flex:1,height:3,borderRadius:2,background:"var(--bg3)",overflow:"hidden"}}>
        <div style={{height:"100%",width:`${(value/max)*100}%`,background:muted?"var(--t3)":"var(--t1)",borderRadius:2}}/>
      </div>
      <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:muted?"var(--t3)":"var(--t1)",width:24,textAlign:"right"}}>{value}</span>
    </div>
  );
}

export default function DetailModal({ story, stories=[], onClose, onDelete, onStageChange, onUpdate }) {
  const [currentId, setCurrentId] = useState(story.id);
  const [editing,   setEditing]   = useState(false);

  const current = stories.find(s=>s.id===currentId) || story;
  const idx     = stories.findIndex(s=>s.id===currentId);

  const [localFormat,    setLocalFormat]    = useState(current.format||"");
  const [localHookType,  setLocalHookType]  = useState(current.hook_type||"");
  const [localAngle,     setLocalAngle]     = useState(current.emotional_angle||"");
  const [localReach,     setLocalReach]     = useState(current.reach_score??50);
  const [localPtCleared, setLocalPtCleared] = useState(current.pt_review_cleared||false);

  // Reset local state when navigating
  useEffect(() => {
    setLocalFormat(current.format||"");
    setLocalHookType(current.hook_type||"");
    setLocalAngle(current.emotional_angle||"");
    setLocalReach(current.reach_score??50);
    setLocalPtCleared(current.pt_review_cleared||false);
    setEditing(false);
  }, [currentId]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e) => {
      if (e.key==="Escape") { onClose(); return; }
      if (e.key==="ArrowLeft"  && !editing && idx>0)                { e.preventDefault(); setCurrentId(stories[idx-1].id); }
      if (e.key==="ArrowRight" && !editing && idx<stories.length-1) { e.preventDefault(); setCurrentId(stories[idx+1].id); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [idx, stories, editing, onClose]);

  const saveEdits = () => {
    if (onUpdate) onUpdate(current.id, {
      format:           localFormat||null,
      hook_type:        localHookType||null,
      emotional_angle:  localAngle||null,
      reach_score:      localReach!==null ? parseInt(localReach) : null,
      pt_review_cleared:localPtCleared,
    });
    setEditing(false);
  };

  const st      = STAGES[current.status]||STAGES.accepted;
  const Icon    = ICONS[current.status]||Circle;
  const ac      = ACCENT[current.archetype]||"var(--border)";
  const fmt     = FORMAT_MAP[current.format];
  const players = Array.isArray(current.players)?current.players.join(", "):(current.players||"");
  const readiness = getReadiness(current);
  const rColor  = readiness===8?"#4A9B7F":readiness>=5?"#C49A3C":"var(--t3)";

  const sel = { width:"100%", padding:"7px 10px", borderRadius:7, fontSize:12, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t1)", outline:"none", fontFamily:"inherit" };

  return (
    <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.5)",backdropFilter:"blur(8px)",padding:"24px"}}
      className="animate-fade-in" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{width:"100%",maxWidth:720,maxHeight:"90vh",overflowY:"auto",background:"var(--sheet)",borderRadius:14,
          borderTop:`3px solid ${fmt?fmt.color:ac}`,
          boxShadow:"0 24px 60px rgba(0,0,0,0.2)",
        }}>

        {/* ── Header bar ── */}
        <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {/* Nav arrows */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <button onClick={()=>idx>0&&setCurrentId(stories[idx-1].id)} disabled={idx<=0}
              style={{width:28,height:28,borderRadius:6,border:"1px solid var(--border)",background:"var(--fill2)",cursor:idx>0?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",opacity:idx<=0?0.3:1}}>
              <ChevronLeft size={14} color="var(--t2)"/>
            </button>
            <button onClick={()=>idx<stories.length-1&&setCurrentId(stories[idx+1].id)} disabled={idx>=stories.length-1}
              style={{width:28,height:28,borderRadius:6,border:"1px solid var(--border)",background:"var(--fill2)",cursor:idx<stories.length-1?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",opacity:idx>=stories.length-1?0.3:1}}>
              <ChevronRight size={14} color="var(--t2)"/>
            </button>
            {stories.length>0&&<span style={{fontSize:11,color:"var(--t4)",fontFamily:"'DM Mono',monospace"}}>{idx+1}/{stories.length}</span>}
          </div>

          {/* Status + format */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:99,background:"var(--fill2)",border:"1px solid var(--border)",color:"var(--t2)"}}>
              <Icon size={10}/>{st.label}
            </span>
            {fmt&&<span style={{fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:99,background:`${fmt.color}15`,color:fmt.color,border:`1px solid ${fmt.color}30`}}>{fmt.label}</span>}
            <button onClick={onClose} style={{width:28,height:28,borderRadius:6,border:"1px solid var(--border)",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",marginLeft:4}}>
              <X size={13} color="var(--t3)"/>
            </button>
          </div>
        </div>

        {/* ── Two column body ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",height:460,overflow:"hidden"}}>

          {/* Left: story content */}
          <div style={{padding:"20px",borderRight:"1px solid var(--border2)",overflowY:"auto",height:"100%"}}>
            {/* Archetype + era */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:ac,display:"inline-block"}}/>
                <span style={{fontSize:12,color:ac,fontWeight:500}}>{current.archetype}</span>
              </span>
              {current.era&&<span style={{fontSize:12,color:"var(--t3)"}}>{current.era}</span>}
            </div>

            <h2 style={{fontSize:19,fontWeight:600,letterSpacing:"-0.02em",lineHeight:1.25,color:"var(--t1)",marginBottom:8}}>{current.title}</h2>

            {/* Players — full, no truncation */}
            {players&&<div style={{fontSize:13,color:"var(--t3)",marginBottom:14,lineHeight:1.5}}>{players}</div>}

            {current.statline&&<div style={{padding:"7px 10px",borderRadius:6,background:"var(--fill2)",border:"1px solid var(--border)",fontFamily:"'DM Mono',monospace",fontSize:12,color:"var(--t2)",marginBottom:12}}>{current.statline}</div>}

            {current.angle&&<p style={{fontSize:13,color:"var(--t2)",lineHeight:1.7,marginBottom:12}}>{current.angle}</p>}
            {current.hook&&(
              <div style={{fontSize:13,color:"var(--t3)",fontStyle:"italic",paddingLeft:12,borderLeft:`2px solid ${ac}40`,lineHeight:1.5,marginBottom:16}}>
                "{current.hook}"
              </div>
            )}

            {current.script&&(
              <div style={{borderRadius:7,padding:"12px 14px",background:"var(--bg2)",border:"1px solid var(--border)",maxHeight:180,overflowY:"auto"}}>
                <div style={{fontSize:10,color:"var(--t4)",marginBottom:6,fontFamily:"'DM Mono',monospace"}}>v{current.script_version||1} · {wc(current.script)} words</div>
                <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.8,fontFamily:"Georgia,serif",whiteSpace:"pre-wrap"}}>{current.script}</div>
              </div>
            )}
          </div>

          {/* Right: scores + metadata + readiness */}
          <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:16,overflowY:"auto",height:"100%"}}>

            {/* Scores */}
            <div>
              <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Scores</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <ScoreRow label="Community" value={current.score_total}  max={100}/>
                <ScoreRow label="Reach"     value={current.reach_score}  max={100} muted/>
                {current.score_emotional!=null&&<>
                  <div style={{height:"1px",background:"var(--border2)",margin:"2px 0"}}/>
                  <ScoreRow label="Emotional"  value={current.score_emotional} max={25}/>
                  <ScoreRow label="Obscurity"  value={current.score_obscurity} max={25}/>
                  <ScoreRow label="Visual"     value={current.score_visual}    max={25}/>
                  <ScoreRow label="Hook"       value={current.score_hook}      max={25}/>
                </>}
              </div>
            </div>

            {/* Readiness */}
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Readiness</div>
                <span style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:rColor}}>{readiness}/8</span>
              </div>
              <div style={{height:3,borderRadius:2,background:"var(--bg3)",overflow:"hidden",marginBottom:10}}>
                <div style={{height:"100%",width:`${(readiness/8)*100}%`,background:rColor,borderRadius:2}}/>
              </div>
              {/* Lang badges */}
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {LANGS.filter(l=>l.key==="en"?current.script:current[`script_${l.key}`]).map(l=>(
                  <span key={l.key} style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:"var(--fill2)",color:"var(--t2)",border:"1px solid var(--border)"}}>{l.label}</span>
                ))}
                {current.script_pt&&(
                  <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:4,background:current.pt_review_cleared?"rgba(74,155,127,0.1)":"rgba(196,154,60,0.1)",color:current.pt_review_cleared?"#4A9B7F":"#C49A3C",border:`1px solid ${current.pt_review_cleared?"rgba(74,155,127,0.2)":"rgba(196,154,60,0.2)"}`}}>
                    PT {current.pt_review_cleared?"✓":"⚠"}
                  </span>
                )}
              </div>
            </div>

            {/* Intelligence metadata */}
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:600,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Metadata</div>
                <button onClick={()=>editing?saveEdits():setEditing(true)} style={{
                  padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:600,
                  background:editing?"var(--t1)":"var(--fill2)",
                  color:editing?"var(--bg)":"var(--t2)",
                  border:"1px solid var(--border)",cursor:"pointer",
                }}>
                  {editing?"Save":"Edit"}
                </button>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {/* Format */}
                <div style={{padding:"8px 10px",borderRadius:7,background:"var(--fill2)",border:"1px solid var(--border2)"}}>
                  <div style={{fontSize:10,color:"var(--t3)",marginBottom:4}}>Format</div>
                  {editing?(
                    <select value={localFormat} onChange={e=>setLocalFormat(e.target.value)} style={{...sel,padding:"3px 6px",fontSize:11}}>
                      <option value="">—</option>
                      {FORMATS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  ):(
                    <div style={{fontSize:12,fontWeight:500,color:fmt?fmt.color:"var(--t4)"}}>{fmt?fmt.label:"Not set"}</div>
                  )}
                </div>

                {/* Hook type */}
                <div style={{padding:"8px 10px",borderRadius:7,background:"var(--fill2)",border:"1px solid var(--border2)"}}>
                  <div style={{fontSize:10,color:"var(--t3)",marginBottom:4}}>Hook type</div>
                  {editing?(
                    <select value={localHookType} onChange={e=>setLocalHookType(e.target.value)} style={{...sel,padding:"3px 6px",fontSize:11}}>
                      <option value="">—</option>
                      {HOOK_TYPES.map(h=><option key={h.key} value={h.key}>{h.label}</option>)}
                    </select>
                  ):(
                    <div style={{fontSize:12,fontWeight:500,color:current.hook_type?"var(--t1)":"var(--t4)"}}>{HOOK_TYPES.find(h=>h.key===current.hook_type)?.label||"Not set"}</div>
                  )}
                </div>

                {/* Emotional angle */}
                <div style={{padding:"8px 10px",borderRadius:7,background:"var(--fill2)",border:"1px solid var(--border2)"}}>
                  <div style={{fontSize:10,color:"var(--t3)",marginBottom:4}}>Angle</div>
                  {editing?(
                    <select value={localAngle} onChange={e=>setLocalAngle(e.target.value)} style={{...sel,padding:"3px 6px",fontSize:11}}>
                      <option value="">—</option>
                      {EMOTIONAL_ANGLES.map(a=><option key={a} value={a}>{a.charAt(0).toUpperCase()+a.slice(1)}</option>)}
                    </select>
                  ):(
                    <div style={{fontSize:12,fontWeight:500,color:current.emotional_angle?"var(--t1)":"var(--t4)",textTransform:"capitalize"}}>{current.emotional_angle||"Not set"}</div>
                  )}
                </div>

                {/* Reach score */}
                <div style={{padding:"8px 10px",borderRadius:7,background:"var(--fill2)",border:"1px solid var(--border2)"}}>
                  <div style={{fontSize:10,color:"var(--t3)",marginBottom:4}}>Reach score</div>
                  {editing?(
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <input type="range" min="0" max="100" value={localReach} onChange={e=>setLocalReach(e.target.value)} style={{flex:1}}/>
                      <span style={{fontSize:11,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"var(--t1)",minWidth:24}}>{localReach}</span>
                    </div>
                  ):(
                    <div style={{fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace",color:current.reach_score!=null?"var(--t1)":"var(--t4)"}}>{current.reach_score??"—"}</div>
                  )}
                </div>
              </div>

              {/* PT flag */}
              {current.script_pt&&(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:7,background:"var(--fill2)",border:"1px solid var(--border2)",marginTop:8}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:500,color:"var(--t1)"}}>PT reviewed</div>
                    <div style={{fontSize:10,color:"var(--t3)"}}>Required before scheduling</div>
                  </div>
                  {editing?(
                    <button onClick={()=>setLocalPtCleared(p=>!p)} style={{width:40,height:22,borderRadius:11,border:"none",cursor:"pointer",background:localPtCleared?"#4A9B7F":"var(--t4)",position:"relative",transition:"background 0.2s"}}>
                      <div style={{position:"absolute",top:3,left:localPtCleared?20:3,width:16,height:16,borderRadius:"50%",background:"white",transition:"left 0.2s"}}/>
                    </button>
                  ):(
                    <span style={{fontSize:11,fontWeight:600,color:current.pt_review_cleared?"#4A9B7F":"#C49A3C"}}>{current.pt_review_cleared?"Cleared":"Pending"}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom: stage strip ── */}
        <div style={{padding:"12px 20px",borderTop:"1px solid var(--border2)",display:"flex",gap:6,alignItems:"center",background:"var(--bg2)",borderRadius:"0 0 14px 14px",flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:"var(--t3)",marginRight:4}}>Move to</span>
          {Object.entries(STAGES).map(([key,s])=>{
            const SI=ICONS[key]||Circle;
            const active=current.status===key;
            return (
              <button key={key} onClick={()=>{onStageChange(current.id,key);}} style={{
                padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:active?600:400,
                background:active?"var(--t1)":"var(--fill2)",
                color:active?"var(--bg)":"var(--t2)",
                border:active?"1px solid var(--t1)":"1px solid var(--border)",
                cursor:"pointer",display:"flex",alignItems:"center",gap:4,
              }}>
                <SI size={10}/>{s.label}
              </button>
            );
          })}
          <button onClick={()=>{onDelete(current.id);onClose();}} style={{
            marginLeft:"auto",padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:400,
            background:"transparent",color:"var(--t4)",border:"1px solid var(--border)",cursor:"pointer",
            display:"flex",alignItems:"center",gap:4,
          }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--t3)";e.currentTarget.style.color="var(--t2)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--t4)";}}>
            <X size={11}/> Delete
          </button>
        </div>

        {/* Keyboard hint */}
        <div style={{padding:"8px 20px",borderTop:"1px solid var(--border2)",display:"flex",gap:12,fontSize:10,color:"var(--t4)"}}>
          {[["←→","Previous/next story"],["Esc","Close"]].map(([k,v])=>(
            <span key={k}><kbd style={{fontFamily:"'DM Mono',monospace",fontSize:9,padding:"1px 5px",borderRadius:3,background:"var(--bg3)",border:"1px solid var(--border)"}}>{k}</kbd> {v}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
