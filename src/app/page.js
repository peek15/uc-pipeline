"use client";
import { useState, useEffect, useCallback } from "react";
import { Layers, Search, FileText, Clock, BarChart3, Download, Upload, LogOut, User, ChevronDown } from "lucide-react";
import { STAGES } from "@/lib/constants";
import { supabase, getStories, upsertStory, deleteStory as dbDelete, bulkUpsertStories, syncToAirtable } from "@/lib/db";
import { signInWithGoogle, signOut, isEmailAllowed } from "@/lib/auth";
import PipelineView from "@/components/PipelineView";
import ResearchView from "@/components/ResearchView";
import ScriptView from "@/components/ScriptView";
import CalendarView from "@/components/CalendarView";
import AnalyzeView from "@/components/AnalyzeView";
import DetailModal from "@/components/DetailModal";
import LoginScreen from "@/components/LoginScreen";
import { ToastContainer, toast } from "@/components/Toast";
import SettingsModal from "@/components/SettingsModal";
import { Settings } from "lucide-react";
import ProductionAlert from "@/components/ProductionAlert";

const VERSION = "3.5.6";

const TABS = [
  { key: "pipeline", label: "Pipeline", Icon: Layers },
  { key: "research", label: "Research", Icon: Search },
  { key: "script",   label: "Script",   Icon: FileText },
  { key: "calendar", label: "Calendar", Icon: Clock },
  { key: "analyze",  label: "Analyze",  Icon: BarChart3 },
];

export default function Home() {
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError]     = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(null); // "actions" | "user" | null
  const [stories, setStories]         = useState([]);
  const [tab, setTab]                 = useState("pipeline");
  const [selected, setSelected]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [undoStack,       setUndoStack]       = useState([]);
  const [researchState,   setResearchState]   = useState(null);
  const [appSettings,     setAppSettings]     = useState(null);
  const [showSettings,    setShowSettings]    = useState(false); // persisted across tab switches
  const [researchPrefill, setResearchPrefill] = useState(null); // from ProductionAlert
  const [showCmdK,        setShowCmdK]        = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && isEmailAllowed(session.user.email)) setUser(session.user);
      else setUser(null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (isEmailAllowed(session.user.email)) { setUser(session.user); setAuthError(null); }
        else { await supabase.auth.signOut(); setUser(null); setAuthError(`Access restricted to @${process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "peekmedia.cc"} accounts.`); }
      } else { setUser(null); }
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      setLoading(true);
      // Load stories
      getStories().then(d => { setStories(d); setLoading(false); }).catch(() => setLoading(false));
      // Load saved settings from brand profile
// Load appearance from localStorage immediately (fast, no network)
      try {
        const cached = localStorage.getItem("uc_settings");
        if (cached) {
          const parsed = JSON.parse(cached);
          setAppSettings(parsed);
          applyTheme(parsed?.appearance?.theme || "system");
          if (parsed?.appearance?.default_tab) setTab(parsed.appearance.default_tab);
        }
      } catch {}
      // Then sync from Supabase (source of truth)
      supabase.from("brand_profiles").select("brief_doc").eq("id","00000000-0000-0000-0000-000000000001").single()
        .then(({ data, error }) => {
          if (data?.brief_doc) {
            setAppSettings(data.brief_doc);
            localStorage.setItem("uc_settings", JSON.stringify(data.brief_doc));
            applyTheme(data.brief_doc?.appearance?.theme || "system");
            if (data.brief_doc?.appearance?.default_tab) setTab(data.brief_doc.appearance.default_tab);
          }
        }).catch(() => {});
    }
    else setLoading(false);
  }, [user]);

  const handleSignIn  = async () => { setAuthLoading(true); setAuthError(null); try { await signInWithGoogle(); } catch (err) { setAuthError(err.message); setAuthLoading(false); } };
  const handleSignOut = async () => { await signOut(); setUser(null); setStories([]); setShowUserMenu(false); };

  const addStories = useCallback(async (n) => {
    const saved = await bulkUpsertStories(n);
    if (saved) {
      setStories(p => [...saved, ...p]);
      for (const s of saved) syncToAirtable(s).catch(() => {});
      toast(`${saved.length} ${saved.length === 1 ? "story" : "stories"} added to Pipeline`);
    }
  }, []);

  const updateStory = useCallback(async (id, c) => {
    const story = stories.find(s => s.id === id);
    if (!story) return;
    const saved = await upsertStory({ ...story, ...c });
    if (saved) { setStories(p => p.map(s => s.id === id ? saved : s)); syncToAirtable(saved).catch(() => {}); }
  }, [stories]);

  const stageChange = useCallback(async (id, st) => {
    const story = stories.find(s => s.id === id);
    if (!story) return;
    setUndoStack(u => [...u.slice(-9), { type:"stage", id, prev: story.status }]);
    await updateStory(id, { status: st });
    toast(`Moved to ${STAGES[st].label}`);
  }, [updateStory, stories]);

  const bulkAction = useCallback(async (from, to) => {
    const up = stories.filter(s => s.status === from).map(s => ({ ...s, status: to }));
    const saved = await bulkUpsertStories(up);
    if (saved) {
      const ids = new Set(saved.map(s => s.id));
      setStories(p => p.map(s => ids.has(s.id) ? saved.find(x => x.id === s.id) : s));
      toast(`${saved.length} stories approved`);
    }
  }, [stories]);

  const bulkReject = useCallback(async (ids) => {
    const prev = ids.map(id => ({ id, status: stories.find(s=>s.id===id)?.status }));
    setUndoStack(u => [...u.slice(-9), { type:"bulkStage", prev }]);
    await Promise.all(ids.map(id => updateStory(id, { status: "rejected" })));
    toast(`${ids.length} ${ids.length===1?"story":"stories"} rejected`);
  }, [updateStory, stories]);

  const bulkDelete = useCallback(async (ids) => {
    await Promise.all(ids.map(id => dbDelete(id)));
    setStories(p => p.filter(s => !ids.includes(s.id)));
    toast(`${ids.length} ${ids.length===1?"story":"stories"} deleted`, "error");
  }, []);

  const handleDelete = useCallback(async (id) => {
    await dbDelete(id);
    setStories(p => p.filter(s => s.id !== id));
    toast("Story deleted", "error");
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoStack.length) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(u => u.slice(0, -1));
    if (last.type === "stage") {
      await updateStory(last.id, { status: last.prev });
      toast("Undone");
    } else if (last.type === "bulkStage") {
      await Promise.all(last.prev.map(({ id, status }) => status ? updateStory(id, { status }) : null));
      toast("Undone");
    }
  }, [undoStack, updateStory]);

  // Apply theme to document
  const applyTheme = (theme) => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    } else if (theme === "light") {
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    } else {
      root.removeAttribute("data-theme");
      root.style.colorScheme = "light dark";
    }
  };

  // Apply theme whenever settings change
  useEffect(() => {
    if (appSettings?.appearance?.theme) {
      applyTheme(appSettings.appearance.theme);
    }
  }, [appSettings?.appearance?.theme]);

  // Production shortcut — Cmd+J: jump to research with top recommendation
  const handleProductionShortcut = useCallback(() => {
    const ready = stories.filter(s => ["approved","scripted","produced"].includes(s.status));
    const published = stories.filter(s => s.status === "published" && s.metrics_completion);

    // Find best performing combo
    if (published.length >= 5) {
      const combos = {};
      for (const s of published) {
        const key = `${s.archetype}|${s.era}`;
        if (!combos[key]) combos[key] = { archetype: s.archetype, era: s.era, completions: [], format: s.format };
        combos[key].completions.push(parseFloat(s.metrics_completion)||0);
      }
      const best = Object.values(combos)
        .filter(c => c.completions.length >= 2)
        .map(c => ({ ...c, avg: c.completions.reduce((a,b)=>a+b,0)/c.completions.length }))
        .sort((a,b) => b.avg - a.avg)[0];
      if (best) {
        const ready = stories.filter(s => ["approved","scripted","produced"].includes(s.status));
        const gap = Math.max(0, 20 - ready.length);
        const smartCount = Math.min(30, Math.ceil(gap * 1.2) || 8);
        setResearchPrefill({ archetype: best.archetype, era: best.era, format: best.format, count: smartCount });
        setTab("research");
        toast(`↗ Researching ${best.archetype} ${best.era} — avg ${Math.round(best.avg)}% completion`);
        return;
      }
    }

    // Fallback: find underrepresented format
    const FORMATS_ORDER = ["standard","classics","performance_special"];
    for (const fmt of FORMATS_ORDER) {
      const count = ready.filter(s => s.format === fmt).length;
      if (count < 3) {
        const ready2 = stories.filter(s => ["approved","scripted","produced"].includes(s.status));
        const gap2 = Math.max(0, 20 - ready2.length);
        const smartCount2 = Math.min(30, Math.ceil(gap2 * 1.2) || 8);
        setResearchPrefill({ format: fmt, count: smartCount2 });
        setTab("research");
        toast(`↗ Low on ${fmt.replace("_"," ")} stories — researching more`);
        return;
      }
    }

    // Fallback: just go to research
    setTab("research");
    toast("↗ Jumped to Research");
  }, [stories, setTab, setResearchPrefill]);

  // Auto-produce: generate script for a story by ID
  // ScriptView handles the actual generation — we trigger it via a shared ref or
  // by moving the story to scripted status after calling the API directly
  const handleProduce = useCallback(async (storyId) => {
    const story = stories.find(s => s.id === storyId);
    if (!story || story.script) return;
    const { callClaude, callClaudeStream } = await import("@/lib/db");
    const { SCRIPT_SYSTEM } = await import("@/lib/constants");
    const prompt = `${SCRIPT_SYSTEM}\n\n---\n\nWrite an Uncle Carter episode script about:\nStory: ${story.angle||story.title}\nPlayer(s): ${story.players||"Unknown"}\nEra: ${story.era||"Unknown"}\nEmotional angle: ${story.archetype||"Pressure"}\n\n110-150 words. Pure script only.`;
    const enText = await callClaude(prompt, 600);
    await updateStory(storyId, { script: enText, script_version: 1, status: "scripted" });
    // Auto-translate
    for (const lang of ["fr","es","pt"]) {
      const tPrompt = `Translate this Uncle Carter NBA story script to ${lang==="fr"?"French":lang==="es"?"Spanish":"Portuguese"}. Keep the warm, storytelling tone. Same length. End with the exact translated equivalent of "Because the score is never the whole story."\n\n${enText}`;
      const translated = await callClaude(tPrompt, 600);
      await updateStory(storyId, { [`script_${lang}`]: translated });
    }
  }, [stories, updateStory]);

  // Global keyboard shortcuts
  useEffect(() => {
    const TAB_KEYS = ["pipeline","research","script","calendar","analyze"];
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (["INPUT","TEXTAREA","SELECT"].includes(tag)) return;
      if (e.metaKey && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (e.metaKey && e.key === "j") { e.preventDefault(); handleProductionShortcut(); }
      if (e.metaKey && e.key === ",") { e.preventDefault(); setShowSettings(s=>!s); }
      if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        setTab(prev => {
          const idx = TAB_KEYS.indexOf(prev);
          if (e.key === "ArrowRight") return TAB_KEYS[Math.min(idx+1, TAB_KEYS.length-1)];
          return TAB_KEYS[Math.max(idx-1, 0)];
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo]);

  const exportCSV = () => {
    const hdr = ["Title","Status","Archetype","Era","Players","Angle","Hook","Script","Script FR","Script ES","Script PT","Score","Views","Completion%","Saves"];
    const esc = v => `"${(v||"").toString().replace(/"/g,'""')}"`;
    const rows = stories.map(s => [esc(s.title),s.status,esc(s.archetype),esc(s.era),esc(s.players),esc(s.angle),esc(s.hook),esc(s.script),esc(s.script_fr),esc(s.script_es),esc(s.script_pt),s.score_total,s.metrics_views,s.metrics_completion,s.metrics_saves]);
    const blob = new Blob([[hdr.join(","),...rows.map(r=>r.join(","))].join("\n")],{type:"text/csv"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `UC_pipeline_${new Date().toISOString().split("T")[0]}.csv`; a.click();
  };

  const importCSV = () => {
    const input = document.createElement("input"); input.type="file"; input.accept=".csv";
    input.onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const text = await file.text(); const lines = text.split("\n").slice(1).filter(l=>l.trim());
      const existing = new Set(stories.map(s=>s.title?.toLowerCase())); const n = [];
      for (const line of lines) { const p = line.match(/(\".*?\"|[^,]+)/g)?.map(x=>x.replace(/^\"|\"$/g,"").trim())||[]; if (p[0]&&!existing.has(p[0].toLowerCase())) n.push({id:crypto.randomUUID(),title:p[0],archetype:p[1]||"",obscurity:parseInt(p[3])||3,players:p[4]||"",era:p[5]||"",angle:p[7]||"",hook:p[8]||"",status:"accepted",created_at:new Date().toISOString()}); }
      if (n.length>0) await addStories(n);
    }; input.click();
  };

  const counts   = {};
  for (const s of stories) counts[s.status] = (counts[s.status]||0)+1;
  const bankSize = stories.filter(s=>["approved","scripted","produced"].includes(s.status)).length;

  const Spinner = () => (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:20, height:20, borderRadius:"50%", border:"1.5px solid var(--t4)", borderTopColor:"var(--t1)" }} className="anim-spin" />
    </div>
  );

  if (authLoading) return <Spinner />;
  if (!user) return <LoginScreen onSignIn={handleSignIn} loading={authLoading} error={authError} />;
  if (loading) return <Spinner />;

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--t1)" }}>

      {/* ── Header ── */}
      <header style={{ position:"sticky", top:0, zIndex:20, background:"var(--nav)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", borderBottom:"1px solid var(--border)" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 24px", height:52, display:"flex", alignItems:"center", justifyContent:"space-between" }}>

          {/* Left — brand + stage pills */}
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
<span className="font-display" style={{ fontSize:15, fontWeight:600, letterSpacing:"-0.02em", color:"var(--t1)" }}>Uncle Carter</span>
            <span style={{ fontSize:9, fontWeight:600, fontFamily:"'DM Mono',monospace", color:"var(--t4)", padding:"1px 5px", borderRadius:3, border:"0.5px solid var(--border)", background:"var(--fill2)" }}>v{VERSION}</span>
            <div style={{ width:"1px", height:16, background:"var(--border)" }}/>
            <div style={{ display:"flex", gap:2 }}>
              {[
                {k:"accepted",  dot:"var(--t4)"},
                {k:"approved",  dot:"#5B8FB9"},
                {k:"scripted",  dot:"#8B7EC8"},
                {k:"produced",  dot:"#C49A3C"},
                {k:"published", dot:"#4A9B7F"},
              ].map(({k, dot}) => (counts[k]||0) > 0 ? (
                <div key={k} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:99, background:"var(--fill2)", border:"0.5px solid var(--border2)" }}>
                  <span style={{ width:5, height:5, borderRadius:"50%", background:dot, flexShrink:0, display:"inline-block" }} />
                  <span style={{ fontSize:11, color:"var(--t2)", fontFamily:"'DM Mono',monospace" }}>{counts[k]}</span>
                  <span style={{ fontSize:10, color:"var(--t3)" }}>{STAGES[k].label}</span>
                </div>
              ) : null)}
              {bankSize > 0 && (
                <div style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:99, background:"rgba(74,155,127,0.08)", border:"0.5px solid rgba(74,155,127,0.2)" }}>
                  <span style={{ width:5, height:5, borderRadius:"50%", background:"#4A9B7F", display:"inline-block" }} />
                  <span style={{ fontSize:10, fontWeight:500, color:"#4A9B7F" }}>{bankSize} ready</span>
                </div>
              )}
            </div>
          </div>

          {/* Right — actions + user */}
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            {/* Collapsed actions menu */}
            <div style={{ position:"relative" }}>
              <button onClick={()=>setShowUserMenu(m=>m==="actions"?null:"actions")} style={{ width:32, height:32, borderRadius:8, background:"transparent", border:"0.5px solid var(--border)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--t3)" }}>
                <span style={{ fontSize:16, lineHeight:1, letterSpacing:1 }}>···</span>
              </button>
              {showUserMenu==="actions" && (
                <div style={{ position:"absolute", right:0, top:38, width:160, zIndex:40, background:"var(--sheet)", borderRadius:10, padding:4, border:"0.5px solid var(--border)", boxShadow:"var(--shadow-lg)" }}>
                  <button onClick={()=>{importCSV();setShowUserMenu(null);}} style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, border:"none", background:"transparent", cursor:"pointer", color:"var(--t2)", fontSize:12, fontFamily:"inherit" }}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--fill2)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <Upload size={12}/> Import CSV
                  </button>
                  <button onClick={()=>{exportCSV();setShowUserMenu(null);}} style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, border:"none", background:"transparent", cursor:"pointer", color:"var(--t2)", fontSize:12, fontFamily:"inherit" }}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--fill2)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <Download size={12}/> Export CSV
                  </button>
                </div>
              )}
            </div>

            {/* User menu */}
            <div style={{ position:"relative" }}>
              <button onClick={()=>setShowUserMenu(m=>m==="user"?null:"user")} style={{ height:32, padding:"0 8px 0 4px", borderRadius:8, display:"flex", alignItems:"center", gap:6, background:"transparent", border:"0.5px solid var(--border)", cursor:"pointer" }}>
                {user.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="" style={{ width:22, height:22, borderRadius:99, objectFit:"cover" }} />
                  : <div style={{ width:22, height:22, borderRadius:99, background:"var(--bg3)", display:"flex", alignItems:"center", justifyContent:"center" }}><User size={11} color="var(--t3)" /></div>
                }
                <span onClick={e=>{e.stopPropagation();setShowSettings(s=>!s);}} style={{ fontSize:12, color:"var(--t2)", maxWidth:110, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", cursor:"pointer" }} title="Open settings">{user.user_metadata?.full_name || user.email}</span>
                <ChevronDown size={11} color="var(--t4)" />
              </button>
              {showUserMenu==="user" && (
                <div style={{ position:"absolute", right:0, top:38, width:200, zIndex:40, background:"var(--sheet)", borderRadius:10, padding:4, border:"0.5px solid var(--border)", boxShadow:"var(--shadow-lg)" }}>
                  <div style={{ padding:"8px 10px", marginBottom:2 }}>
                    <div style={{ fontSize:12, fontWeight:500, color:"var(--t1)" }}>{user.user_metadata?.full_name||"User"}</div>
                    <div style={{ fontSize:11, color:"var(--t3)", marginTop:1 }}>{user.email}</div>
                    <div style={{ fontSize:10, color:"var(--t4)", marginTop:2, fontFamily:"'DM Mono',monospace" }}>v{VERSION}</div>
                  </div>
                  <div style={{ height:"0.5px", background:"var(--border2)", margin:"0 4px 4px" }}/>
                  <button onClick={()=>{setShowSettings(true);setShowUserMenu(null);}} style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, border:"none", background:"transparent", cursor:"pointer", color:"var(--t2)", fontSize:12, fontFamily:"inherit" }}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--fill2)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <Settings size={12}/> Settings
                  </button>
                  <button onClick={handleSignOut} style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, border:"none", background:"transparent", cursor:"pointer", color:"var(--t2)", fontSize:12, fontFamily:"inherit" }}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--fill2)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <LogOut size={12}/> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar - full width */}
        <div style={{ borderTop:"1px solid var(--border2)", display:"flex" }}>
          {TABS.map((t, i) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"10px 0",
              fontSize:13, fontWeight: tab===t.key ? 600 : 400,
              color: tab===t.key ? "var(--t1)" : "var(--t3)",
              background:"transparent", border:"none", cursor:"pointer",
              borderBottom: tab===t.key ? "1.5px solid var(--t1)" : "1.5px solid transparent",
              marginBottom:-1, transition:"color 0.15s",
            }}>
              <t.Icon size={14} strokeWidth={tab===t.key ? 2.5 : 1.8} />
              {t.label}
              {i === 0 && <span style={{ fontSize:9, color:"var(--t4)", fontFamily:"'DM Mono',monospace" }}>⌥←→</span>}
            </button>
          ))}
        </div>
      </header>

      {/* ── Content ── */}
      <main style={{ maxWidth:1200, margin:"0 auto", padding:"28px 24px 80px" }}>

        {/* ProductionAlert — always visible on all tabs */}
        <ProductionAlert
          stories={stories}
          onNavigate={(t) => setTab(t)}
          onPrefillResearch={(pf) => { setResearchPrefill(pf); setTab("research"); }}
          forceExpanded={showCmdK}
          onToggle={() => setShowCmdK(s=>!s)}
        />

        {/* All tabs mounted always — CSS hides inactive ones to preserve state */}
        <div style={{ display: tab==="pipeline" ? "block" : "none" }}>
          <PipelineView stories={stories} onSelect={setSelected} onStageChange={stageChange} onBulkAction={bulkAction} onBulkReject={bulkReject} onBulkDelete={bulkDelete} setActiveTab={setTab} />
        </div>
        <div style={{ display: tab==="research" ? "block" : "none" }}>
          <ResearchView
            stories={stories}
            onAddStories={addStories}
            onStateChange={setResearchState}
            prefill={researchPrefill}
            onPrefillUsed={() => setResearchPrefill(null)}
          />
        </div>
        <div style={{ display: tab==="script"   ? "block" : "none" }}><ScriptView   stories={stories} onUpdate={updateStory} /></div>
        <div style={{ display: tab==="calendar" ? "block" : "none" }}><CalendarView  stories={stories} onUpdate={updateStory} onProduce={handleProduce} settings={appSettings} /></div>
        <div style={{ display: tab==="analyze"  ? "block" : "none" }}><AnalyzeView   stories={stories} onUpdate={updateStory} /></div>

      </main>

      {showUserMenu && <div onClick={() => setShowUserMenu(null)} style={{ position:"fixed", inset:0, zIndex:30 }} />}
      {selected && <DetailModal story={selected} stories={stories.filter(s=>!["rejected","archived"].includes(s.status))} onClose={() => setSelected(null)} onUpdate={updateStory} onDelete={handleDelete} onStageChange={stageChange} />}
      <SettingsModal isOpen={showSettings} onClose={()=>setShowSettings(false)} stories={stories} onSettingsChange={(s) => { setAppSettings(s); applyTheme(s?.appearance?.theme || "system"); if (s?.appearance?.default_tab) setTab(s.appearance.default_tab); try { localStorage.setItem("uc_settings", JSON.stringify(s)); } catch {} }} initialSettings={appSettings} version={VERSION} />
      <ToastContainer />
    </div>
  );
}
