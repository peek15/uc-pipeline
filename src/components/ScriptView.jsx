"use client";
import { useState } from "react";
import { FileText, ChevronRight, ChevronDown, RefreshCw, Copy, Check, Layers } from "lucide-react";
import { LANGS, SCRIPT_SYSTEM } from "@/lib/constants";
import { callClaude } from "@/lib/db";

function wc(t) { return (t||"").trim().split(/\s+/).filter(w=>w.length>0).length; }

export default function ScriptView({ stories, onUpdate }) {
  const ready = stories.filter(s => s.status === "approved" || (s.status === "scripted" && s.script));
  const [selId,    setSelId]    = useState(null);
  const [loading,  setLoading]  = useState(null);
  const [error,    setError]    = useState(null);
  const [copied,   setCopied]   = useState(false);
  const [viewLang, setViewLang] = useState("en");

  const generate = async (story) => {
    setLoading("en"); setError(null);
    try {
      const prompt = `${SCRIPT_SYSTEM}\n\n---\n\nWrite an Uncle Carter episode script about:\nStory: ${story.angle||story.title}\nPlayer(s): ${story.players||"Unknown"}\nEra: ${story.era||"Unknown"}\nEmotional angle: ${story.archetype||"Pressure"}\n\n110-150 words. Pure script only.`;
      const text = await callClaude(prompt);
      onUpdate(story.id, { script: text, script_version: (story.script_version||0)+1, status: "scripted" });
    } catch (err) { setError(err.message); } finally { setLoading(null); }
  };

  const translate = async (story, lang) => {
    setLoading(lang); setError(null);
    try {
      const langName = LANGS.find(l=>l.key===lang)?.name||lang;
      const prompt = `Translate this Uncle Carter sports storytelling script to ${langName}. Keep the same tone: calm, warm, storytelling uncle by a fireplace. Translate "Forty seconds." and the closing line naturally. Same structure, same rhythm. 110-150 words.\n\nReturn ONLY the translated script.\n\nOriginal:\n${story.script}`;
      const text = await callClaude(prompt);
      onUpdate(story.id, { [`script_${lang}`]: text });
    } catch (err) { setError(err.message); } finally { setLoading(null); }
  };

  const translateAll = async (story) => {
    setLoading("all"); setError(null);
    try {
      for (const lang of ["fr","es","pt"]) {
        if (story[`script_${lang}`]) continue;
        const langName = LANGS.find(l=>l.key===lang)?.name;
        const prompt = `Translate this Uncle Carter sports storytelling script to ${langName}. Keep the same tone: calm, warm, storytelling uncle by a fireplace. 110-150 words.\n\nReturn ONLY the translated script.\n\nOriginal:\n${story.script}`;
        const text = await callClaude(prompt);
        onUpdate(story.id, { [`script_${lang}`]: text });
        await new Promise(r=>setTimeout(r,1000));
      }
    } catch (err) { setError(err.message); } finally { setLoading(null); }
  };

  const getScript = (story, lang) => lang === "en" ? story.script : story[`script_${lang}`];

  if (!ready.length) return (
    <div style={{ textAlign:"center", padding:"80px 0", color:"var(--t4)" }} className="animate-fade-in">
      <FileText size={32} style={{ margin:"0 auto 12px", display:"block", opacity:0.25 }} />
      <div style={{ fontSize:13 }}>Approve stories to start scripting</div>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }} className="animate-fade-in">
      {ready.map(s => {
        const isOpen   = selId === s.id;
        const langCount = LANGS.filter(l => getScript(s, l.key)).length;

        return (
          <div key={s.id} style={{ borderRadius:10, overflow:"hidden", background:"var(--card)", border:"1px solid var(--border)" }}>
            <button onClick={() => setSelId(isOpen ? null : s.id)} style={{
              width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"14px 16px", background:"transparent", border:"none", cursor:"pointer", textAlign:"left",
            }}>
              <div>
                <div style={{ fontSize:14, fontWeight:500, color:"var(--t1)", letterSpacing:"-0.01em", marginBottom:3 }}>{s.title}</div>
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--t3)" }}>
                  <span>{s.archetype}</span>
                  {s.era && <><span style={{color:"var(--t4)"}}>·</span><span>{s.era}</span></>}
                  {s.script && <><span style={{color:"var(--t4)"}}>·</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:11}}>v{s.script_version||1} · {wc(s.script)}w</span></>}
                  {langCount > 0 && LANGS.filter(l=>getScript(s,l.key)).map(l => (
                    <span key={l.key} style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background:"var(--fill2)", color:"var(--t2)", border:"1px solid var(--border)" }}>{l.label}</span>
                  ))}
                </div>
              </div>
              {isOpen ? <ChevronDown size={15} color="var(--t4)" /> : <ChevronRight size={15} color="var(--t4)" />}
            </button>

            {isOpen && (
              <div style={{ padding:"0 16px 16px", borderTop:"1px solid var(--border2)" }}>
                {s.angle && <div style={{ fontSize:13, color:"var(--t3)", lineHeight:1.6, margin:"12px 0" }}>{s.angle}</div>}

                {/* Lang tabs */}
                {s.script && (
                  <div style={{ display:"flex", gap:4, marginBottom:10 }}>
                    {LANGS.map(l => {
                      const has = !!getScript(s, l.key);
                      return (
                        <button key={l.key} onClick={() => has && setViewLang(l.key)} style={{
                          padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:600,
                          background: viewLang===l.key && has ? "var(--t1)" : "var(--fill2)",
                          color: viewLang===l.key && has ? "var(--bg)" : has ? "var(--t2)" : "var(--t4)",
                          border: "1px solid var(--border)",
                          cursor: has ? "pointer" : "default",
                          display:"flex", alignItems:"center", gap:4,
                        }}>
                          {l.label}{has && <Check size={9} />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Script text */}
                {getScript(s, viewLang) && (
                  <div style={{ padding:"14px 16px", borderRadius:8, background:"var(--bg2)", marginBottom:10, maxHeight:220, overflowY:"auto" }}>
                    <div style={{ fontSize:14, color:"var(--t2)", lineHeight:1.8, fontFamily:"Georgia, serif", whiteSpace:"pre-wrap" }}>
                      {getScript(s, viewLang)}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  <button onClick={() => generate(s)} disabled={!!loading} style={{
                    flex:1, minWidth:100, padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                    background: loading==="en" ? "var(--fill2)" : "var(--t1)",
                    color: loading==="en" ? "var(--t3)" : "var(--bg)",
                    border:"none", cursor:loading?"not-allowed":"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                  }}>
                    <RefreshCw size={12} />
                    {loading==="en" ? "Writing..." : s.script ? "Rewrite EN" : "Generate script"}
                  </button>

                  {s.script && (
                    <button onClick={() => translateAll(s)} disabled={!!loading} style={{
                      flex:1, minWidth:100, padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                      background: loading==="all" ? "var(--fill2)" : "var(--fill2)",
                      color: loading==="all" ? "var(--t3)" : "var(--t1)",
                      border:"1px solid var(--border)", cursor:loading?"not-allowed":"pointer",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                    }}>
                      <Layers size={12} />
                      {loading==="all" ? "Translating..." : "Translate all"}
                    </button>
                  )}

                  {getScript(s, viewLang) && (
                    <button onClick={() => { navigator.clipboard.writeText(getScript(s,viewLang)); setCopied(`${s.id}-${viewLang}`); setTimeout(()=>setCopied(false),2000); }} style={{
                      padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                      background:"var(--fill2)", color: copied===`${s.id}-${viewLang}` ? "var(--t1)" : "var(--t2)",
                      border:"1px solid var(--border)", cursor:"pointer",
                      display:"flex", alignItems:"center", gap:5,
                    }}>
                      <Copy size={12} />{copied===`${s.id}-${viewLang}` ? "Copied!" : `Copy ${viewLang.toUpperCase()}`}
                    </button>
                  )}
                </div>

                {/* Individual translate buttons */}
                {s.script && LANGS.filter(l=>l.key!=="en"&&!getScript(s,l.key)).length > 0 && (
                  <div style={{ display:"flex", gap:4, marginTop:6 }}>
                    {LANGS.filter(l=>l.key!=="en"&&!getScript(s,l.key)).map(l => (
                      <button key={l.key} onClick={() => translate(s, l.key)} disabled={!!loading} style={{
                        padding:"5px 10px", borderRadius:6, fontSize:11, fontWeight:600,
                        background:"var(--fill2)", color:"var(--t3)",
                        border:"1px solid var(--border)", cursor:loading?"not-allowed":"pointer",
                      }}>
                        {loading===l.key ? "..." : `+ ${l.label}`}
                      </button>
                    ))}
                  </div>
                )}

                {error && <div style={{ marginTop:8, fontSize:11, color:"var(--t2)" }}>{error}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
