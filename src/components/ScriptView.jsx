"use client";
import { useState } from "react";
import { FileText, ChevronRight, ChevronDown, RefreshCw, Copy, Check, Layers, Zap } from "lucide-react";
import { LANGS, SCRIPT_SYSTEM } from "@/lib/constants";
import { callClaude, callClaudeStream } from "@/lib/db";

function wc(t) { return (t||"").trim().split(/\s+/).filter(w=>w.length>0).length; }

// Progress indicator for multi-step operations
function ProgressSteps({ steps, current }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{
            display:"flex", alignItems:"center", gap:5,
            fontSize:11, fontWeight: i === current ? 600 : 400,
            color: i < current ? "var(--t3)" : i === current ? "var(--t1)" : "var(--t4)",
          }}>
            {i < current && <Check size={10} />}
            {i === current && <div className="anim-spin" style={{ width:10, height:10, borderRadius:"50%", border:"1.5px solid var(--t4)", borderTopColor:"var(--t1)" }} />}
            {s}
          </div>
          {i < steps.length - 1 && <span style={{ color:"var(--t4)", fontSize:10 }}>→</span>}
        </div>
      ))}
    </div>
  );
}

export default function ScriptView({ stories, onUpdate }) {
  const ready = stories.filter(s => s.status === "approved" || (s.status === "scripted" && s.script));
  const [selId,       setSelId]       = useState(null);
  const [loading,     setLoading]     = useState(null);
  const [streaming,   setStreaming]   = useState({});
  const [error,       setError]       = useState(null);
  const [copied,      setCopied]      = useState(false);
  const [viewLang,    setViewLang]    = useState("en");
  const [batchMode,   setBatchMode]   = useState(false);
  const [batchDone,   setBatchDone]   = useState(0);
  const [batchStep,   setBatchStep]   = useState(""); // current step label
  const [autoTranslate, setAutoTranslate] = useState(true); // auto-translate after EN

  const translateLang = async (story, lang, scriptText) => {
    const langName = LANGS.find(l=>l.key===lang)?.name||lang;
    const prompt = `Translate this Uncle Carter sports storytelling script to ${langName}. Keep the same tone: calm, warm, storytelling uncle. Translate "Forty seconds." and the closing line naturally. Same rhythm. 110-150 words.\n\nReturn ONLY the translated script.\n\nOriginal:\n${scriptText}`;
    const text = await callClaude(prompt, 600);
    return text;
  };

  const generate = async (story, withTranslate = autoTranslate) => {
    setLoading(`en-${story.id}`); setError(null);
    setStreaming(s => ({ ...s, [story.id]: "" }));
    try {
      // Step 1: Generate EN
      const prompt = `${SCRIPT_SYSTEM}\n\n---\n\nWrite an Uncle Carter episode script about:\nStory: ${story.angle||story.title}\nPlayer(s): ${story.players||"Unknown"}\nEra: ${story.era||"Unknown"}\nEmotional angle: ${story.archetype||"Pressure"}\n\n110-150 words. Pure script only.`;
      const enText = await callClaudeStream(prompt, 600, (live) => {
        setStreaming(s => ({ ...s, [story.id]: live }));
      });
      setStreaming(s => { const n = {...s}; delete n[story.id]; return n; });
      await onUpdate(story.id, { script: enText, script_version: (story.script_version||0)+1, status: "scripted" });

      // Step 2: Auto-translate all languages
      if (withTranslate) {
        for (const lang of ["fr","es","pt"]) {
          setLoading(`${lang}-${story.id}`);
          const translated = await translateLang(story, lang, enText);
          await onUpdate(story.id, { [`script_${lang}`]: translated });
          await new Promise(r => setTimeout(r, 400));
        }
      }
    } catch (err) { setError(err.message); } finally { setLoading(null); }
  };

  const generateAll = async () => {
    const queue = ready.filter(s => !s.script);
    setBatchMode(true); setBatchDone(0); setError(null);
    for (let i = 0; i < queue.length; i++) {
      const s = queue[i];
      setBatchStep(`${s.title.slice(0,30)}...`);
      await generate(s, autoTranslate);
      setBatchDone(i + 1);
      if (i < queue.length - 1) await new Promise(r => setTimeout(r, 600));
    }
    setBatchMode(false); setBatchStep("");
  };

  const translateAll = async (story) => {
    setLoading(`all-${story.id}`); setError(null);
    try {
      for (const lang of ["fr","es","pt"]) {
        if (story[`script_${lang}`]) continue;
        setLoading(`${lang}-${story.id}`);
        const translated = await translateLang(story, lang, story.script);
        await onUpdate(story.id, { [`script_${lang}`]: translated });
        await new Promise(r => setTimeout(r, 400));
      }
    } catch (err) { setError(err.message); } finally { setLoading(null); }
  };

  const getScript = (story, lang) => {
    if (lang === "en") return streaming[story.id] ?? story.script;
    return story[`script_${lang}`];
  };

  // ElevenLabs export — zip with one txt per language
  const exportVoicePack = async (story) => {
    const files = {};
    const slug  = story.title.slice(0,30).replace(/[^a-zA-Z0-9]/g,"-").toLowerCase();
    LANGS.forEach(l => {
      const sc = getScript(story, l.key);
      if (sc) files[`UC-${slug}_${l.key}.txt`] = sc;
    });

    // Simple zip using JSZip via CDN — inline approach
    const { default: JSZip } = await import("jszip");
    const zip   = new JSZip();
    Object.entries(files).forEach(([name, content]) => zip.file(name, content));
    const blob  = await zip.generateAsync({ type:"blob" });
    const a     = document.createElement("a");
    a.href      = URL.createObjectURL(blob);
    a.download  = `UC-${slug}-voice-pack.zip`;
    a.click();
  };

  const unscripted = ready.filter(s => !s.script);
  const STEPS = autoTranslate ? ["EN", "FR", "ES", "PT"] : ["EN"];

  if (!ready.length) return (
    <div style={{ textAlign:"center", padding:"80px 0", color:"var(--t4)" }} className="animate-fade-in">
      <FileText size={32} style={{ margin:"0 auto 12px", display:"block", opacity:0.25 }} />
      <div style={{ fontSize:13 }}>Approve stories to start scripting</div>
    </div>
  );

  return (
    <div className="animate-fade-in">

      {/* Options bar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:10, background:"var(--bg2)", border:"1px solid var(--border)", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:12, color:"var(--t2)" }}>Auto-translate after generate</span>
          <button onClick={() => setAutoTranslate(a => !a)} style={{
            width:36, height:20, borderRadius:10, border:"none", cursor:"pointer",
            background: autoTranslate ? "var(--t1)" : "var(--t4)",
            position:"relative", transition:"background 0.2s",
          }}>
            <div style={{
              position:"absolute", top:2, left: autoTranslate ? 18 : 2,
              width:16, height:16, borderRadius:"50%", background:"var(--bg)",
              transition:"left 0.2s",
            }} />
          </button>
        </div>
        {unscripted.length > 0 && (
          <button onClick={generateAll} disabled={!!loading || batchMode} style={{
            padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:600,
            background: batchMode ? "var(--fill2)" : "var(--t1)",
            color: batchMode ? "var(--t3)" : "var(--bg)",
            border:"none", cursor: batchMode ? "not-allowed" : "pointer",
            display:"flex", alignItems:"center", gap:5,
          }}>
            <Layers size={12} />
            {batchMode ? `${batchDone}/${unscripted.length} done` : `Generate all (${unscripted.length})`}
          </button>
        )}
      </div>

      {/* Batch progress */}
      {batchMode && batchStep && (
        <div style={{ padding:"10px 14px", borderRadius:8, background:"var(--fill2)", border:"1px solid var(--border)", marginBottom:12, fontSize:12, color:"var(--t2)" }}>
          <ProgressSteps steps={STEPS} current={
            loading?.startsWith("fr") ? 1 : loading?.startsWith("es") ? 2 : loading?.startsWith("pt") ? 3 : 0
          } />
          <div style={{ marginTop:6, color:"var(--t3)", fontSize:11 }}>{batchStep}</div>
        </div>
      )}

      {/* Story list */}
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {ready.map(s => {
          const isOpen      = selId === s.id;
          const isStreaming = s.id in streaming;
          const langCount   = LANGS.filter(l => getScript(s, l.key)).length;
          const thisLang    = isOpen ? viewLang : "en";
          const isLoadingEn = loading === `en-${s.id}`;
          const isLoadingFr = loading === `fr-${s.id}`;
          const isLoadingEs = loading === `es-${s.id}`;
          const isLoadingPt = loading === `pt-${s.id}`;
          const isLoadingAny = isLoadingEn || isLoadingFr || isLoadingEs || isLoadingPt;
          const currentStep = isLoadingEn ? 0 : isLoadingFr ? 1 : isLoadingEs ? 2 : isLoadingPt ? 3 : -1;

          return (
            <div key={s.id} style={{ borderRadius:10, overflow:"hidden", background:"var(--card)", border:"1px solid var(--border)" }}>
              <button onClick={() => setSelId(isOpen ? null : s.id)} style={{
                width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"14px 16px", background:"transparent", border:"none", cursor:"pointer", textAlign:"left",
              }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:500, color:"var(--t1)", letterSpacing:"-0.01em", marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--t3)", flexWrap:"wrap" }}>
                    <span>{s.archetype}</span>
                    {s.era && <><span style={{color:"var(--t4)"}}>·</span><span>{s.era}</span></>}
                    {s.script && <><span style={{color:"var(--t4)"}}>·</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:11}}>v{s.script_version||1} · {wc(s.script)}w</span></>}
                    {isLoadingAny && autoTranslate && (
                      <ProgressSteps steps={STEPS} current={currentStep} />
                    )}
                    {!isLoadingAny && langCount > 0 && LANGS.filter(l=>getScript(s,l.key)).map(l => (
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
                        const isLoading = loading === `${l.key}-${s.id}`;
                        return (
                          <button key={l.key} onClick={() => has && setViewLang(l.key)} style={{
                            padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:600,
                            background: viewLang===l.key && has ? "var(--t1)" : "var(--fill2)",
                            color: viewLang===l.key && has ? "var(--bg)" : has ? "var(--t2)" : "var(--t4)",
                            border:"1px solid var(--border)", cursor: has ? "pointer" : "default",
                            display:"flex", alignItems:"center", gap:4,
                          }}>
                            {isLoading
                              ? <div className="anim-spin" style={{ width:8, height:8, borderRadius:"50%", border:"1px solid var(--t4)", borderTopColor:"var(--t1)" }} />
                              : has ? <Check size={9} /> : null
                            }
                            {l.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Script text */}
                  {getScript(s, thisLang) && (
                    <div style={{ padding:"14px 16px", borderRadius:8, background:"var(--bg2)", marginBottom:10, maxHeight:240, overflowY:"auto", position:"relative" }}>
                      {isStreaming && (
                        <div style={{ position:"absolute", top:10, right:12, width:6, height:6, borderRadius:"50%", background:"var(--t1)", animation:"pulse 1s ease-in-out infinite" }} />
                      )}
                      <div style={{ fontSize:14, color:"var(--t2)", lineHeight:1.85, fontFamily:"Georgia, serif", whiteSpace:"pre-wrap" }}>
                        {getScript(s, thisLang)}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <button onClick={() => generate(s)} disabled={!!loading} style={{
                      flex:1, minWidth:120, padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                      background: isLoadingEn ? "var(--fill2)" : "var(--t1)",
                      color: isLoadingEn ? "var(--t3)" : "var(--bg)",
                      border:"none", cursor:loading?"not-allowed":"pointer",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                    }}>
                      <RefreshCw size={12} />
                      {isLoadingEn ? "Writing..." : isLoadingAny ? "Translating..." : s.script ? "Rewrite EN" : "Generate"}
                      {autoTranslate && !s.script && <span style={{fontSize:10,opacity:0.7}}>+ translate</span>}
                    </button>

                    {s.script && !autoTranslate && (
                      <button onClick={() => translateAll(s)} disabled={!!loading} style={{
                        flex:1, minWidth:100, padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                        background:"var(--fill2)", color:"var(--t1)",
                        border:"1px solid var(--border)", cursor:loading?"not-allowed":"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                      }}>
                        <Layers size={12} />
                        {loading===`all-${s.id}` ? "Translating..." : "Translate all"}
                      </button>
                    )}

                    {getScript(s, thisLang) && !isStreaming && (
                      <button onClick={() => { navigator.clipboard.writeText(getScript(s,thisLang)); setCopied(`${s.id}-${thisLang}`); setTimeout(()=>setCopied(false),2000); }} style={{
                        padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                        background:"var(--fill2)", color: copied===`${s.id}-${thisLang}` ? "var(--t1)" : "var(--t2)",
                        border:"1px solid var(--border)", cursor:"pointer",
                        display:"flex", alignItems:"center", gap:5,
                      }}>
                        <Copy size={12} />{copied===`${s.id}-${thisLang}` ? "Copied!" : `Copy ${thisLang.toUpperCase()}`}
                      </button>
                    )}

                    {/* ElevenLabs export */}
                    {langCount >= 1 && (
                      <button onClick={() => exportVoicePack(s)} style={{
                        padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
                        background:"var(--fill2)", color:"var(--t2)",
                        border:"1px solid var(--border)", cursor:"pointer",
                        display:"flex", alignItems:"center", gap:5,
                      }}
                      title="Download voice pack (txt files for ElevenLabs)">
                        <Zap size={12} /> Voice pack
                      </button>
                    )}
                  </div>

                  {/* Individual translate if auto-translate off */}
                  {s.script && !autoTranslate && LANGS.filter(l=>l.key!=="en"&&!getScript(s,l.key)).length > 0 && (
                    <div style={{ display:"flex", gap:4, marginTop:6 }}>
                      {LANGS.filter(l=>l.key!=="en"&&!getScript(s,l.key)).map(l => (
                        <button key={l.key} onClick={() => translateLang(s, l.key, s.script).then(t => onUpdate(s.id,{[`script_${l.key}`]:t}))} disabled={!!loading} style={{
                          padding:"5px 10px", borderRadius:6, fontSize:11, fontWeight:600,
                          background:"var(--fill2)", color:"var(--t3)",
                          border:"1px solid var(--border)", cursor:loading?"not-allowed":"pointer",
                        }}>
                          {loading===`${l.key}-${s.id}` ? "..." : `+ ${l.label}`}
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
    </div>
  );
}
