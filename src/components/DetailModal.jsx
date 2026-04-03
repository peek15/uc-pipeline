"use client";
import { X, Circle, Check, FileText, Film, Award, Archive } from "lucide-react";
import { STAGES, LANGS } from "@/lib/constants";

const ICONS = { accepted: Circle, approved: Check, scripted: FileText, produced: Film, published: Award, rejected: X, archived: Archive };
function wc(t) { return (t||"").trim().split(/\s+/).filter(w=>w.length>0).length; }

export default function DetailModal({ story, onClose, onDelete, onStageChange }) {
  const st   = STAGES[story.status] || STAGES.accepted;
  const Icon = ICONS[story.status] || Circle;

  return (
    <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(8px)" }}
      className="animate-fade-in" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="anim-slide"
        style={{ width:"100%", maxWidth:640, maxHeight:"85vh", overflowY:"auto", background:"var(--sheet)", borderRadius:"16px 16px 0 0", padding:"20px 24px 40px" }}>

        {/* Handle */}
        <div style={{ width:36, height:4, borderRadius:2, background:"var(--t4)", margin:"0 auto 20px" }} />

        {/* Status + meta */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
          <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:99, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)" }}>
            <Icon size={11} />{st.label}
          </span>
          <span style={{ fontSize:11, color:"var(--t3)" }}>{story.archetype}</span>
          {story.era && <><span style={{color:"var(--t4)",fontSize:11}}>·</span><span style={{fontSize:11,color:"var(--t3)"}}>{story.era}</span></>}
        </div>

        <h2 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.2, color:"var(--t1)", marginBottom:6 }}>{story.title}</h2>
        {story.players && <div style={{ fontSize:13, color:"var(--t3)", marginBottom:16 }}>{Array.isArray(story.players) ? story.players.join(", ") : story.players}</div>}

        {story.statline && (
          <div style={{ padding:"8px 12px", borderRadius:7, background:"var(--fill2)", border:"1px solid var(--border)", fontFamily:"'DM Mono',monospace", fontSize:12, color:"var(--t2)", marginBottom:14 }}>
            {story.statline}
          </div>
        )}

        {story.angle && <div style={{ fontSize:14, color:"var(--t2)", lineHeight:1.7, marginBottom:12 }}>{story.angle}</div>}
        {story.hook && (
          <div style={{ fontSize:13, color:"var(--t3)", fontStyle:"italic", paddingLeft:14, borderLeft:"2px solid var(--border)", lineHeight:1.5, marginBottom:18 }}>
            "{story.hook}"
          </div>
        )}

        {story.script && (
          <div style={{ borderRadius:8, padding:"14px 16px", background:"var(--bg2)", border:"1px solid var(--border)", marginBottom:16, maxHeight:200, overflowY:"auto" }}>
            <div style={{ fontSize:11, color:"var(--t4)", marginBottom:8, fontFamily:"'DM Mono',monospace" }}>v{story.script_version||1} · {wc(story.script)} words</div>
            <div style={{ fontSize:14, color:"var(--t2)", lineHeight:1.8, fontFamily:"Georgia, serif", whiteSpace:"pre-wrap" }}>{story.script}</div>
          </div>
        )}

        {/* Lang badges */}
        {story.script && (
          <div style={{ display:"flex", gap:4, marginBottom:20 }}>
            {LANGS.filter(l => l.key==="en" ? story.script : story[`script_${l.key}`]).map(l => (
              <span key={l.key} style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{l.label}</span>
            ))}
          </div>
        )}

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

        {/* Delete */}
        <button onClick={() => { onDelete(story.id); onClose(); }} style={{
          width:"100%", padding:"10px", borderRadius:8, fontSize:13, fontWeight:500,
          background:"transparent", color:"var(--t4)", border:"1px solid var(--border)",
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
          transition:"all 0.15s",
        }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--t3)";e.currentTarget.style.color="var(--t2)";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--t4)";}}>
          <X size={13} /> Delete story
        </button>
      </div>
    </div>
  );
}
