"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import { Layers, Search, Clock, BarChart3, Download, Upload, LogOut, User, ChevronDown, Wrench, PanelLeft, Settings, Bot } from "lucide-react";
import { STAGES } from "@/lib/constants";
import { supabase, getStories, upsertStory, deleteStory as dbDelete, bulkUpsertStories, syncToAirtable } from "@/lib/db";
import { signInWithGoogle, signOut, isEmailAllowed } from "@/lib/auth";
import PipelineView from "@/components/PipelineView";
import ResearchView from "@/components/ResearchView";
import CalendarView from "@/components/CalendarView";
import CreateView from "@/components/CreateView";
import AnalyzeView from "@/components/AnalyzeView";
import DetailModal from "@/components/DetailModal";
import LoginScreen from "@/components/LoginScreen";
import { ToastContainer, toast } from "@/components/Toast";
import SettingsModal from "@/components/SettingsModal";
import ProductionAlert from "@/components/ProductionAlert";
import ShortcutsCheatSheet from "@/components/ShortcutsCheatSheet";
import AgentPanel from "@/components/AgentPanel";
import { matches, shouldIgnoreFromInput, SHORTCUTS } from "@/lib/shortcuts";
import { DEFAULT_BRAND_PROFILE_ID } from "@/lib/brand";

const VERSION = "3.16.8";

const TABS = [
  { key: "pipeline",   label: "Stories",  Icon: Layers },
  { key: "research",   label: "Research", Icon: Search },
  { key: "create",     label: "Create",   Icon: Wrench },
  { key: "calendar",   label: "Schedule", Icon: Clock },
  { key: "analyze",    label: "Insights", Icon: BarChart3 },
];

export default function Home() {
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError]     = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(null); // "actions" | "user" | null
  const [stories, setStories]         = useState([]);
  const storiesRef = useRef([]);
  useEffect(() => { storiesRef.current = stories; }, [stories]);
  const [tab, setTab]                 = usePersistentState("tab", "pipeline");
  const [createMode, setCreateMode]   = usePersistentState("create_mode", "write");
  const [sidebarOpen, setSidebarOpen] = usePersistentState("sidebar_open", true);
  const [selected, setSelected]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [undoStack,       setUndoStack]       = useState([]);
  const [researchState,   setResearchState]   = useState(null);
  const [appSettings,     setAppSettings]     = useState(null);
  const [showSettings,    setShowSettings]    = useState(false); // persisted across tab switches
  const [showShortcuts,   setShowShortcuts]   = useState(false); // v3.11.4
  const [researchPrefill, setResearchPrefill] = useState(null); // from ProductionAlert
  const [showCmdK,        setShowCmdK]        = useState(false);
  const [agentOpen,       setAgentOpen]       = useState(false);

  useEffect(() => {
    if (tab === "script") { setCreateMode("write"); setTab("create"); }
    if (tab === "production") { setCreateMode("produce"); setTab("create"); }
  }, [tab, setCreateMode, setTab]);

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
      // NOTE: default_tab from settings is no longer applied here — last-used
      // tab is persisted via usePersistentState("tab") and wins on reload.
      try {
        const cached = localStorage.getItem("uc_settings");
        if (cached) {
          const parsed = JSON.parse(cached);
          setAppSettings(parsed);
          applyTheme(parsed?.appearance?.theme || "system");
        }
      } catch {}
      // Then sync from Supabase (source of truth)
      supabase.from("brand_profiles").select("brief_doc").eq("id", DEFAULT_BRAND_PROFILE_ID).single()
        .then(({ data, error }) => {
          if (data?.brief_doc) {
            setAppSettings(data.brief_doc);
            localStorage.setItem("uc_settings", JSON.stringify(data.brief_doc));
            applyTheme(data.brief_doc?.appearance?.theme || "system");
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
    const story = storiesRef.current.find(s => s.id === id);
    if (!story) return;
    const saved = await upsertStory({ ...story, ...c });
    if (saved) { setStories(p => p.map(s => s.id === id ? saved : s)); syncToAirtable(saved).catch(() => {}); }
  }, []);

  const stageChange = useCallback(async (id, st) => {
    const story = storiesRef.current.find(s => s.id === id);
    if (!story) return;
    setUndoStack(u => [...u.slice(-9), { type:"stage", id, prev: story.status }]);
    await updateStory(id, { status: st });
    toast(`Moved to ${STAGES[st].label}`);
  }, [updateStory]);

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
    const prev = ids.map(id => ({ id, status: storiesRef.current.find(s=>s.id===id)?.status }));
    setUndoStack(u => [...u.slice(-9), { type:"bulkStage", prev }]);
    await Promise.all(ids.map(id => updateStory(id, { status: "rejected" })));
    toast(`${ids.length} ${ids.length===1?"story":"stories"} rejected`);
  }, [updateStory]);

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
    const { runPrompt } = await import("@/lib/ai/runner");

    // English script
    const { text: enText } = await runPrompt({
      type:    "generate-script",
      params:  { story },
      context: { story_id: storyId },
      parse:   false,
    });
    await updateStory(storyId, { script: enText, script_version: 1, status: "scripted" });

    // Auto-translate to FR / ES / PT
    for (const lang of ["fr","es","pt"]) {
      const { text: translated } = await runPrompt({
        type:    "translate-script",
        params:  { script: enText, lang_key: lang },
        context: { story_id: storyId },
        parse:   false,
      });
      await updateStory(storyId, { [`script_${lang}`]: translated });
    }
  }, [stories, updateStory]);

 // v3.11.4 — Global keyboard shortcuts driven by SHORTCUTS registry.
  // Cross-platform (metaKey || ctrlKey).
  useEffect(() => {
    const TAB_KEYS = ["pipeline","research","create","calendar","analyze"];
    const handler = (e) => {
      if (shouldIgnoreFromInput()) return;

      // Cheat sheet
      if (matches(e, SHORTCUTS.showShortcuts.combo)) { e.preventDefault(); setShowShortcuts(s => !s); return; }

      // Global commands
      if (matches(e, SHORTCUTS.toggleSettings.combo))     { e.preventDefault(); setShowSettings(s=>!s);             return; }
      if (matches(e, SHORTCUTS.sidebarToggle.combo))      { e.preventDefault(); setSidebarOpen(s=>!s);              return; }
      if (matches(e, SHORTCUTS.agentToggle.combo))        { e.preventDefault(); setAgentOpen(s=>!s);               return; }
      if (matches(e, SHORTCUTS.undo.combo))               { e.preventDefault(); handleUndo();                       return; }
      if (matches(e, SHORTCUTS.productionShortcut.combo)) { e.preventDefault(); handleProductionShortcut();         return; }

      // Tab jumps Cmd+1..5
      if (matches(e, SHORTCUTS.tabPipeline.combo))   { e.preventDefault(); setTab("pipeline");   return; }
      if (matches(e, SHORTCUTS.tabResearch.combo))   { e.preventDefault(); setTab("research");   return; }
      if (matches(e, SHORTCUTS.tabCreate.combo))     { e.preventDefault(); setTab("create");     return; }
      if (matches(e, SHORTCUTS.tabCalendar.combo))   { e.preventDefault(); setTab("calendar");   return; }
      if (matches(e, SHORTCUTS.tabAnalyze.combo))    { e.preventDefault(); setTab("analyze");    return; }

      // Tab cycling
      if (matches(e, SHORTCUTS.tabPrev.combo) || matches(e, SHORTCUTS.tabNext.combo)) {
        e.preventDefault();
        setTab(prev => {
          const idx = TAB_KEYS.indexOf(prev);
          const safe = idx === -1 ? 0 : idx;
          if (e.key === "ArrowRight") return TAB_KEYS[Math.min(safe + 1, TAB_KEYS.length - 1)];
          return TAB_KEYS[Math.max(safe - 1, 0)];
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleProductionShortcut]);

  const exportCSV = () => {
    const hdr = ["Title","Status","Archetype","Era","Players","Angle","Hook","Script","Script FR","Script ES","Script PT","Score","Views","Completion%","Saves"];
    const esc = v => `"${(v||"").toString().replace(/"/g,'""')}"`;
    const rows = stories.map(s => [esc(s.title),s.status,esc(s.archetype),esc(s.era),esc(s.players),esc(s.angle),esc(s.hook),esc(s.script),esc(s.script_fr),esc(s.script_es),esc(s.script_pt),s.score_total,s.metrics_views,s.metrics_completion,s.metrics_saves]);
    const blob = new Blob([[hdr.join(","),...rows.map(r=>r.join(","))].join("\n")],{type:"text/csv"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `UC_pipeline_${new Date().toISOString().split("T")[0]}.csv`; a.click();
  };

  const parseCSVLine = (line) => {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === "\"" && quoted && next === "\"") { cell += "\""; i++; continue; }
      if (ch === "\"") { quoted = !quoted; continue; }
      if (ch === "," && !quoted) { cells.push(cell.trim()); cell = ""; continue; }
      cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  };

  const importCSV = () => {
    const input = document.createElement("input"); input.type="file"; input.accept=".csv";
    input.onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l=>l.trim());
      const header = parseCSVLine(lines.shift() || "").map(h=>h.toLowerCase());
      const idx = (name) => header.indexOf(name.toLowerCase());
      const existing = new Set(stories.map(s=>s.title?.toLowerCase())); const n = [];
      for (const line of lines) {
        const p = parseCSVLine(line);
        const title = p[idx("Title")] || p[0];
        if (!title || existing.has(title.toLowerCase())) continue;
        n.push({
          id: crypto.randomUUID(),
          title,
          status: p[idx("Status")] || "accepted",
          archetype: p[idx("Archetype")] || "",
          era: p[idx("Era")] || "",
          players: p[idx("Players")] || "",
          angle: p[idx("Angle")] || "",
          hook: p[idx("Hook")] || "",
          script: p[idx("Script")] || "",
          script_fr: p[idx("Script FR")] || "",
          script_es: p[idx("Script ES")] || "",
          script_pt: p[idx("Script PT")] || "",
          score_total: parseInt(p[idx("Score")]) || null,
          metrics_views: parseInt(p[idx("Views")]) || null,
          metrics_completion: parseFloat(p[idx("Completion%")]) || null,
          metrics_saves: parseInt(p[idx("Saves")]) || null,
          created_at: new Date().toISOString(),
        });
      }
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

  const menuBtn = { width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, border:"none", background:"transparent", cursor:"pointer", color:"var(--t2)", fontSize:12, fontFamily:"inherit" };

  return (
    <div style={{ height:"100vh", background:"var(--bg)", color:"var(--t1)", display:"flex", overflow:"hidden" }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: sidebarOpen ? 200 : 44,
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
        background: "var(--bg2)",
        borderRight: "0.5px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 15,
      }}>
        {/* Inner wrapper — full width so content adapts to collapsed/expanded */}
        <div style={{ width:"100%", display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

          {/* Brand — hidden in icon-only mode */}
          {sidebarOpen
            ? <div style={{ padding:"18px 14px 12px", flexShrink:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span className="font-display" style={{ fontSize:14, fontWeight:700, letterSpacing:0, color:"var(--t1)" }}>Uncle Carter</span>
                  <span style={{ fontSize:9, fontWeight:600, fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", color:"var(--t4)", padding:"1px 4px", borderRadius:3, border:"0.5px solid var(--border)", background:"var(--fill2)", flexShrink:0 }}>v{VERSION}</span>
                </div>
              </div>
            : <div style={{ height:16, flexShrink:0 }} />
          }

          {/* Nav items */}
          <nav style={{ flex:1, padding: sidebarOpen ? "0 8px" : "0 4px", overflowY:"auto" }}>
            {TABS.map(t => {
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)} title={t.label} style={{
                  width:"100%", display:"flex", alignItems:"center",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  gap: sidebarOpen ? 10 : 0,
                  padding: sidebarOpen ? "8px 10px" : "9px 0",
                  borderRadius:8, border:"none", cursor:"pointer",
                  background: active ? "var(--fill2)" : "transparent",
                  color: active ? "var(--t1)" : "var(--t3)",
                  fontSize:13, fontWeight: active ? 600 : 400,
                  marginBottom:2,
                  boxShadow: sidebarOpen ? (active ? "inset 2px 0 0 var(--gold)" : "inset 2px 0 0 transparent") : "none",
                  transition:"background 0.12s, color 0.12s",
                }}>
                  <t.Icon size={sidebarOpen ? 15 : 16} strokeWidth={active ? 2.5 : 1.8} style={{ flexShrink:0 }} />
                  {sidebarOpen && t.label}
                </button>
              );
            })}
          </nav>

          {/* Bottom — settings + user */}
          <div style={{ padding: sidebarOpen ? "8px" : "8px 4px", flexShrink:0, borderTop:"0.5px solid var(--border2)" }}>
            <button onClick={() => setShowSettings(s=>!s)} title="Settings" style={{
              width:"100%", display:"flex", alignItems:"center",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              gap: sidebarOpen ? 10 : 0,
              padding: sidebarOpen ? "8px 10px" : "9px 0",
              borderRadius:8, border:"none", cursor:"pointer",
              background: showSettings ? "var(--fill2)" : "transparent",
              color:"var(--t3)", fontSize:13, marginBottom:4,
            }}>
              <Settings size={sidebarOpen ? 15 : 16} strokeWidth={1.8} style={{ flexShrink:0 }} />
              {sidebarOpen && "Settings"}
            </button>

            {/* User row */}
            <div style={{ position:"relative" }}>
              <button onClick={() => setShowUserMenu(m=>m==="user"?null:"user")} title={user.user_metadata?.full_name || user.email} style={{
                width:"100%", display:"flex", alignItems:"center",
                justifyContent: sidebarOpen ? "flex-start" : "center",
                gap: sidebarOpen ? 8 : 0,
                padding: sidebarOpen ? "7px 10px" : "7px 0",
                borderRadius:8, border:"none", cursor:"pointer",
                background:"transparent", color:"var(--t2)", fontSize:12,
              }}>
                {user.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="" style={{ width:22, height:22, borderRadius:99, objectFit:"cover", flexShrink:0 }} />
                  : <div style={{ width:22, height:22, borderRadius:99, background:"var(--bg3)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><User size={11} color="var(--t3)" /></div>
                }
                {sidebarOpen && <>
                  <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"left" }}>{user.user_metadata?.full_name || user.email}</span>
                  <ChevronDown size={11} color="var(--t4)" style={{ flexShrink:0 }} />
                </>}
              </button>
              {showUserMenu==="user" && (
                <div style={{ position:"absolute", bottom:"100%", left:0, right:0, zIndex:40, background:"var(--sheet)", borderRadius:10, padding:4, border:"0.5px solid var(--border)", boxShadow:"var(--shadow-lg)", marginBottom:4 }}>
                  <div style={{ padding:"8px 10px 6px" }}>
                    <div style={{ fontSize:12, fontWeight:500, color:"var(--t1)" }}>{user.user_metadata?.full_name||"User"}</div>
                    <div style={{ fontSize:11, color:"var(--t3)", marginTop:1 }}>{user.email}</div>
                  </div>
                  <div style={{ height:"0.5px", background:"var(--border2)", margin:"0 4px 4px" }}/>
                  <button onClick={()=>{setShowSettings(true);setShowUserMenu(null);}} style={menuBtn}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--fill2)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <Settings size={12}/> Settings
                  </button>
                  <button onClick={()=>{importCSV();setShowUserMenu(null);}} style={menuBtn}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--fill2)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <Upload size={12}/> Import CSV
                  </button>
                  <button onClick={()=>{exportCSV();setShowUserMenu(null);}} style={menuBtn}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--fill2)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <Download size={12}/> Export CSV
                  </button>
                  <div style={{ height:"0.5px", background:"var(--border2)", margin:"4px 4px" }}/>
                  <button onClick={handleSignOut} style={menuBtn}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--fill2)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <LogOut size={12}/> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>

        {/* Header — slim strip */}
        <header style={{ flexShrink:0, height:48, display:"flex", alignItems:"center", gap:10, padding:"0 16px", background:"var(--nav)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", borderBottom:"0.5px solid var(--border)", zIndex:20, position:"sticky", top:0 }}>

          {/* Sidebar toggle */}
          <button onClick={()=>setSidebarOpen(s=>!s)} title="Toggle sidebar (⌘\\)" style={{ width:30, height:30, borderRadius:7, border:"0.5px solid var(--border)", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--t3)", flexShrink:0 }}>
            <PanelLeft size={14} />
          </button>

          <div style={{ width:"0.5px", height:16, background:"var(--border)", flexShrink:0 }} />

          {/* Stage pills */}
          <div style={{ display:"flex", gap:4, flex:1, overflow:"hidden" }}>
            {[
              {k:"accepted",  dot:"var(--t4)"},
              {k:"approved",  dot:"#5B8FB9"},
              {k:"scripted",  dot:"#8B7EC8"},
              {k:"produced",  dot:"#C49A3C"},
              {k:"published", dot:"#4A9B7F"},
            ].map(({k, dot}) => (counts[k]||0) > 0 ? (
              <div key={k} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:99, background:"var(--fill2)", border:"0.5px solid var(--border2)", flexShrink:0 }}>
                <span style={{ width:5, height:5, borderRadius:"50%", background:dot, flexShrink:0, display:"inline-block" }} />
                <span style={{ fontSize:11, color:"var(--t2)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" }}>{counts[k]}</span>
                <span style={{ fontSize:10, color:"var(--t3)" }}>{STAGES[k].label}</span>
              </div>
            ) : null)}
            {bankSize > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:99, background:"rgba(74,155,127,0.08)", border:"0.5px solid rgba(74,155,127,0.2)", flexShrink:0 }}>
                <span style={{ width:5, height:5, borderRadius:"50%", background:"#4A9B7F", display:"inline-block" }} />
                <span style={{ fontSize:10, fontWeight:500, color:"#4A9B7F" }}>{bankSize} ready</span>
              </div>
            )}
          </div>

          {/* Current section label */}
          <span style={{ fontSize:12, fontWeight:500, color:"var(--t3)", flexShrink:0 }}>
            {TABS.find(t=>t.key===tab)?.label}
          </span>

          {/* Agent toggle */}
          <button onClick={() => setAgentOpen(s=>!s)} title="Agent (⌘⌥A)" style={{ width:30, height:30, borderRadius:7, border:`0.5px solid ${agentOpen ? "var(--gold)" : "var(--border)"}`, background: agentOpen ? "rgba(196,154,60,0.10)" : "transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color: agentOpen ? "var(--gold)" : "var(--t3)", flexShrink:0, transition:"border-color 0.12s, background 0.12s, color 0.12s" }}>
            <Bot size={14} />
          </button>
        </header>

        {/* ── Content ── */}
        <main style={{ flex:1, overflowY:"auto", padding:"28px 24px 80px" }}>
          <div style={{ maxWidth:1200, margin:"0 auto" }}>

        <ProductionAlert
          stories={stories}
          onNavigate={(t) => setTab(t)}
          onPrefillResearch={(pf) => { setResearchPrefill(pf); setTab("research"); }}
          forceExpanded={showCmdK}
          onToggle={() => setShowCmdK(s=>!s)}
          settings={appSettings}
        />

            {/* All views mounted always — CSS visibility preserves state */}
            <div style={{ display: tab==="pipeline"   ? "block" : "none" }}>
              <PipelineView stories={stories} onSelect={setSelected} onStageChange={stageChange} onBulkAction={bulkAction} onBulkReject={bulkReject} onBulkDelete={bulkDelete} onUpdate={updateStory} setActiveTab={setTab} />
            </div>
            <div style={{ display: tab==="research"   ? "block" : "none" }}>
              <ResearchView stories={stories} onAddStories={addStories} onStateChange={setResearchState} prefill={researchPrefill} onPrefillUsed={() => setResearchPrefill(null)} />
            </div>
            <div style={{ display: tab==="create" || tab==="script" || tab==="production" ? "block" : "none" }}>
              <CreateView stories={stories} onUpdate={updateStory} mode={createMode} onModeChange={setCreateMode} />
            </div>
            <div style={{ display: tab==="calendar"   ? "block" : "none" }}><CalendarView   stories={stories} onUpdate={updateStory} onProduce={handleProduce} settings={appSettings} /></div>
            <div style={{ display: tab==="analyze"    ? "block" : "none" }}><AnalyzeView    stories={stories} onUpdate={updateStory} /></div>

          </div>
        </main>
      </div>

      <AgentPanel
        isOpen={agentOpen}
        onClose={() => setAgentOpen(false)}
        stories={stories}
        tab={tab}
        onNavigate={(next) => {
          if (next === "script" || next === "write") { setCreateMode("write"); setTab("create"); return; }
          if (next === "production" || next === "produce") { setCreateMode("produce"); setTab("create"); return; }
          setTab(next);
        }}
        onOpenStory={setSelected}
        onUpdateStory={updateStory}
      />

      {showUserMenu && <div onClick={() => setShowUserMenu(null)} style={{ position:"fixed", inset:0, zIndex:30 }} />}
      {selected && <DetailModal story={selected} stories={stories.filter(s=>!["rejected","archived"].includes(s.status))} onClose={() => setSelected(null)} onUpdate={updateStory} onDelete={handleDelete} onStageChange={stageChange} />}
      <SettingsModal isOpen={showSettings} onClose={()=>setShowSettings(false)} stories={stories} onSettingsChange={(s) => { setAppSettings(s); applyTheme(s?.appearance?.theme || "system"); if (s?.appearance?.default_tab) setTab(s.appearance.default_tab); try { localStorage.setItem("uc_settings", JSON.stringify(s)); } catch {} }} initialSettings={appSettings} version={VERSION} />
      <ShortcutsCheatSheet isOpen={showShortcuts} onClose={()=>setShowShortcuts(false)} />
      <ToastContainer />
    </div>
  );
}
