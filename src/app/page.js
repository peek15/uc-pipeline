"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import { Download, Upload, LogOut, ChevronDown } from "lucide-react";
import { IconHome, IconStrategy, IconIdeas, IconCreate, IconPipeline, IconCalendar, IconAnalyze, IconSearch, IconSettings, IconCampaigns } from "@/components/CEIcons";
import { STAGES } from "@/lib/constants";
import { supabase, getStories, upsertStory, deleteStory as dbDelete, bulkUpsertStories, syncToAirtable, getBrandProfiles, createBrandProfile, getCampaigns, upsertCampaign, deleteCampaign as dbDeleteCampaign, getWorkspaces, createWorkspace, linkInvites } from "@/lib/db";
import { batchPredict } from "@/lib/prediction";
import { signInWithGoogle, signOut } from "@/lib/auth";
import PipelineView from "@/components/PipelineView";
import CampaignsView from "@/components/CampaignsView";
import ResearchView from "@/components/ResearchView";
import CalendarView from "@/components/CalendarView";
import CreateView from "@/components/CreateView";
import AnalyzeView from "@/components/AnalyzeView";
import HomeView from "@/components/HomeView";
import StrategyView from "@/components/StrategyView";
import DetailModal from "@/components/DetailModal";
import LoginScreen from "@/components/LoginScreen";
import { ToastContainer, toast } from "@/components/Toast";
import SettingsModal from "@/components/SettingsModal";
import ProductionAlert from "@/components/ProductionAlert";
import ShortcutsCheatSheet from "@/components/ShortcutsCheatSheet";
import AgentPanel from "@/components/AgentPanel";
import { AssistantContext } from "@/lib/agent/AssistantContext";
import { matches, shouldIgnoreFromInput, SHORTCUTS } from "@/lib/shortcuts";
import { defaultTenant, normalizeTenant, tenantStorageKey } from "@/lib/brand";
import { shouldPromptOnboarding } from "@/lib/onboarding";
import { brandConfigForPrompt, contentAudience, contentChannel, contentObjective, getBrandName, getBrandLanguages, getStoryScript, storyScriptPatch, subjectText } from "@/lib/brandConfig";
import { CEMark as CEMarkInline } from "@/components/CEMark";

const VERSION = "3.58.0";
const PIPELINE_DISPLAY_STORAGE_KEY = "ce_pipeline_display_mode";

const PRIMARY_TABS = [
  { key: "home",       label: "Home",      Icon: IconHome },
  { key: "strategy",   label: "Strategy",  Icon: IconStrategy },
  { key: "research",   label: "Ideas",     Icon: IconIdeas },
  { key: "pipeline",   label: "Pipeline",  Icon: IconPipeline },
  { key: "create",     label: "Create",    Icon: IconCreate },
  { key: "calendar",   label: "Calendar",  Icon: IconCalendar },
  { key: "analyze",    label: "Analyze",   Icon: IconAnalyze },
];
const SECONDARY_TABS = [
  { key: "campaigns",  label: "Campaigns", Icon: IconCampaigns },
];
const TABS = [...PRIMARY_TABS, ...SECONDARY_TABS];
const TAB_KEYS = TABS.map(t => t.key);

function WorkspaceSetupScreen({ onSignOut, userEmail }) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "Creative Engine";
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true); setError(null);
    try {
      const ws = await createWorkspace(name.trim());
      window.location.href = `/onboarding?workspace_id=${encodeURIComponent(ws.id)}&mode=brand_setup`;
    } catch (e) {
      setError(e.message);
      setCreating(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        <div style={{ marginBottom:32 }}>
          <h1 className="font-display" style={{ fontSize:28, fontWeight:700, color:"var(--t1)", lineHeight:1.1, marginBottom:8 }}>
            {appName}
          </h1>
          <p style={{ fontSize:14, color:"var(--t3)", lineHeight:1.5 }}>
            Create a workspace to get started.
          </p>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
          <label style={{ fontSize:12, fontWeight:500, color:"var(--t2)" }}>Workspace name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Acme Studio"
            style={{
              padding:"11px 14px", borderRadius:9, fontSize:14,
              border:"0.5px solid var(--border)", background:"var(--fill2)",
              color:"var(--t1)", outline:"none", fontFamily:"inherit",
              width:"100%", boxSizing:"border-box",
            }}
          />
          {error && <p style={{ fontSize:12, color:"var(--error)", margin:0 }}>{error}</p>}
        </div>

        <button
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          style={{
            width:"100%", padding:"13px 20px", borderRadius:10,
            background: (!name.trim() || creating) ? "var(--fill2)" : "var(--t1)",
            color: (!name.trim() || creating) ? "var(--t3)" : "var(--bg)",
            fontSize:14, fontWeight:600, fontFamily:"inherit",
            border: "0.5px solid var(--border)",
            cursor: (!name.trim() || creating) ? "not-allowed" : "pointer",
          }}
        >
          {creating ? "Creating…" : "Create workspace"}
        </button>

        <div style={{ marginTop:28, padding:"14px 16px", borderRadius:9, border:"0.5px solid var(--border)", background:"var(--fill2)" }}>
          <p style={{ fontSize:12, color:"var(--t3)", margin:0, lineHeight:1.6 }}>
            Joining an existing workspace? Ask the workspace owner to add{" "}
            <span style={{ color:"var(--t2)", fontWeight:500 }}>{userEmail}</span>{" "}
            as a member — you'll see their workspace next time you sign in.
          </p>
        </div>

        <button onClick={onSignOut} style={{ display:"block", margin:"16px auto 0", background:"none", border:"none", color:"var(--t4)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [tenant, setTenant] = usePersistentState("active_tenant", defaultTenant());
  const activeTenant = useMemo(() => normalizeTenant(tenant), [tenant]);
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError]     = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(null); // "actions" | "user" | null
  const [stories, setStories]         = useState([]);
  const storiesRef = useRef([]);
  useEffect(() => { storiesRef.current = stories; }, [stories]);
  const [tab, setTab]                 = usePersistentState("tab", "home");
  const [createMode, setCreateMode]   = usePersistentState("create_mode", "write");
  const [pipelineDisplayMode, setPipelineDisplayMode] = useState("essential");
  const [sidebarOpen, setSidebarOpen] = usePersistentState("sidebar_open", true);
  const [selected, setSelected]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [undoStack,       setUndoStack]       = useState([]);
  const [researchState,   setResearchState]   = useState(null);
  const [appSettings,     setAppSettings]     = useState(null);
  const [brandProfiles,   setBrandProfiles]   = useState([]);
  const [campaigns,       setCampaigns]       = useState([]);
  const [showSettings,       setShowSettings]       = useState(false);
  const [showShortcuts,      setShowShortcuts]      = useState(false);
  const [runningPredictions, setRunningPredictions] = useState(false);
  const [researchPrefill, setResearchPrefill] = useState(null); // from ProductionAlert
  const [showCmdK,        setShowCmdK]        = useState(false);
  const [agentOpen,       setAgentOpen]       = useState(false);
  const [agentContext,    setAgentContext]    = useState(null);
  const [newBrand,        setNewBrand]        = useState({ show: false, name: "", cloneSettings: true, openSettings: false });
  const [workspaces,       setWorkspaces]       = useState([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);

  useEffect(() => {
    if (tab === "script") { setCreateMode("write"); setTab("create"); }
    if (tab === "production") { setCreateMode("produce"); setTab("create"); }
  }, [tab, setCreateMode, setTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (requestedTab && TAB_KEYS.includes(requestedTab)) {
      setTab(requestedTab);
    }
    if (params.get("settings") === "1") setShowSettings(true);
  }, [setTab]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PIPELINE_DISPLAY_STORAGE_KEY);
      if (saved === "essential" || saved === "detailed") setPipelineDisplayMode(saved);
    } catch {}
  }, []);

  const updatePipelineDisplayMode = useCallback((mode) => {
    const next = mode === "detailed" ? "detailed" : "essential";
    setPipelineDisplayMode(next);
    try { localStorage.setItem(PIPELINE_DISPLAY_STORAGE_KEY, next); } catch {}
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // TOKEN_REFRESHED fires periodically and does not change the user — skip to avoid
      // reloading stories on every background token rotation when the tab regains focus.
      if (event === "TOKEN_REFRESHED") return;
      if (session?.user) {
        setUser(prev => prev?.id === session.user.id ? prev : session.user);
        setAuthError(null);
      } else { setUser(null); }
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      setLoading(true);
      setSelected(null);
      setStories([]);
      // Load stories
      getStories(activeTenant).then(d => { setStories(d); setLoading(false); }).catch(() => setLoading(false));
      getBrandProfiles(activeTenant).then(rows => {
        setBrandProfiles(rows);
        // When workspace switches, brand_profile_id may not belong to the new workspace — reset to first.
        if (rows.length && !rows.some(bp => bp.id === activeTenant.brand_profile_id)) {
          setTenant(prev => ({ ...prev, brand_profile_id: rows[0].id }));
        }
      }).catch(() => setBrandProfiles([]));
      getCampaigns(activeTenant).then(rows => setCampaigns(rows)).catch(() => setCampaigns([]));
      // Load saved settings from brand profile
// Load appearance from localStorage immediately (fast, no network)
      // NOTE: default_tab from settings is no longer applied here — last-used
      // tab is persisted via usePersistentState("tab") and wins on reload.
      try {
        const cached = localStorage.getItem(tenantStorageKey("settings", activeTenant));
        if (cached) {
          const parsed = JSON.parse(cached);
          setAppSettings(parsed);
          applyTheme(parsed?.appearance?.theme || "system");
        }
      } catch {}
      // Then sync from Supabase (source of truth)
      supabase.from("brand_profiles").select("brief_doc,settings").eq("id", activeTenant.brand_profile_id).single()
        .then(({ data, error }) => {
          const rawSettings = data?.settings && Object.keys(data.settings || {}).length ? data.settings : data?.brief_doc;
          const loadedSettings = typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;
          if (loadedSettings) {
            setAppSettings(loadedSettings);
            localStorage.setItem(tenantStorageKey("settings", activeTenant), JSON.stringify(loadedSettings));
            applyTheme(loadedSettings?.appearance?.theme || "system");
          }
        }).catch(() => {});
    }
    else setLoading(false);
  }, [user, activeTenant]);

  // Load workspaces once per login — drives workspace switcher + no-access guard.
  // linkInvites runs first to backfill user_id on any email-pre-invited membership rows.
  useEffect(() => {
    if (!user) { setWorkspaces([]); setWorkspacesLoaded(false); return; }
    linkInvites().catch(() => {}).finally(() => {
      getWorkspaces()
        .then(ws => { setWorkspaces(ws); setWorkspacesLoaded(true); })
        .catch(() => { setWorkspaces([]); setWorkspacesLoaded(true); });
    });
  }, [user]);

  const handleSignIn  = async () => { setAuthLoading(true); setAuthError(null); try { await signInWithGoogle(); } catch (err) { setAuthError(err.message); setAuthLoading(false); } };
  const handleSignOut = async () => { await signOut(); setUser(null); setStories([]); setShowUserMenu(false); };

  const createBrand = useCallback(() => {
    setNewBrand({ show: true, name: "", cloneSettings: true, openSettings: false });
  }, []);

  const submitNewBrand = useCallback(async () => {
    if (!newBrand.name.trim()) return;
    const settings = newBrand.cloneSettings ? (appSettings || {}) : {};
    const profile = await createBrandProfile({ name: newBrand.name.trim(), settings }, activeTenant);
    setBrandProfiles(prev => [...prev.filter(p => p.id !== profile.id), profile]);
    const nextTenant = { workspace_id: profile.workspace_id || activeTenant.workspace_id, brand_profile_id: profile.id };
    setTenant(nextTenant);
    setAppSettings(profile.settings || { ...(appSettings || {}), brand: { ...(appSettings?.brand || {}), name: newBrand.name.trim() } });
    setNewBrand({ show: false, name: "", cloneSettings: true, openSettings: false });
    toast(`Created ${newBrand.name.trim()}`);
    if (newBrand.openSettings) setShowSettings(true);
  }, [activeTenant, appSettings, newBrand, setTenant]);

  const addStories = useCallback(async (n) => {
    const saved = await bulkUpsertStories(n, activeTenant);
    if (saved) {
      setStories(p => [...saved, ...p]);
      for (const s of saved) syncToAirtable(s).catch(() => {});
      toast(`${saved.length} ${saved.length === 1 ? "content item" : "content items"} added to Pipeline`);
    }
  }, [activeTenant]);

  const updateStory = useCallback(async (id, c) => {
    const story = storiesRef.current.find(s => s.id === id);
    if (!story) return;
    const saved = await upsertStory({ ...story, ...c }, activeTenant);
    if (saved) { setStories(p => p.map(s => s.id === id ? saved : s)); syncToAirtable(saved).catch(() => {}); }
  }, [activeTenant]);

  const stageChange = useCallback(async (id, st) => {
    const story = storiesRef.current.find(s => s.id === id);
    if (!story) return;
    setUndoStack(u => [...u.slice(-9), { type:"stage", id, prev: story.status }]);
    await updateStory(id, { status: st });
    toast(`Moved to ${STAGES[st].label}`);
  }, [updateStory]);

  const bulkAction = useCallback(async (from, to) => {
    const up = stories.filter(s => s.status === from).map(s => ({ ...s, status: to }));
    const saved = await bulkUpsertStories(up, activeTenant);
    if (saved) {
      const ids = new Set(saved.map(s => s.id));
      setStories(p => p.map(s => ids.has(s.id) ? saved.find(x => x.id === s.id) : s));
      toast(`${saved.length} content items approved`);
    }
  }, [stories, activeTenant]);

  const bulkReject = useCallback(async (ids) => {
    const prev = ids.map(id => ({ id, status: storiesRef.current.find(s=>s.id===id)?.status }));
    setUndoStack(u => [...u.slice(-9), { type:"bulkStage", prev }]);
    await Promise.all(ids.map(id => updateStory(id, { status: "rejected" })));
    toast(`${ids.length} ${ids.length===1?"content item":"content items"} rejected`);
  }, [updateStory]);

  const bulkDelete = useCallback(async (ids) => {
    await Promise.all(ids.map(id => dbDelete(id, activeTenant)));
    setStories(p => p.filter(s => !ids.includes(s.id)));
    toast(`${ids.length} ${ids.length===1?"content item":"content items"} deleted`, "error");
  }, [activeTenant]);

  const handleDelete = useCallback(async (id) => {
    await dbDelete(id, activeTenant);
    setStories(p => p.filter(s => s.id !== id));
    toast("Content item deleted", "error");
  }, [activeTenant]);

  const createCampaign = useCallback(async () => {
    const id = crypto.randomUUID();
    const fresh = {
      id,
      name: "New campaign",
      status: "planning",
      color: "#4A9B7F",
      deliverables: [],
      brand_profile_id: activeTenant.brand_profile_id,
      workspace_id: activeTenant.workspace_id,
    };
    const saved = await upsertCampaign(fresh, activeTenant);
    setCampaigns(prev => [saved, ...prev]);
    return saved;
  }, [activeTenant]);

  const saveCampaign = useCallback(async (campaign) => {
    const saved = await upsertCampaign(campaign, activeTenant);
    setCampaigns(prev => prev.map(c => c.id === saved.id ? saved : c));
  }, [activeTenant]);

  const runPredictions = useCallback(async () => {
    setRunningPredictions(true);
    try {
      const { data: snapshots } = await supabase
        .from("performance_snapshots")
        .select("story_id,content_template_id,content_type,channel,views,completion_rate")
        .eq("workspace_id", activeTenant.workspace_id)
        .order("captured_at", { ascending: false })
        .limit(500);
      const toPredict = stories.filter(s => !["rejected","archived"].includes(s.status));
      const predicted = batchPredict(toPredict, snapshots || []);
      const saved = await bulkUpsertStories(predicted, activeTenant);
      if (saved?.length) {
        const map = Object.fromEntries(saved.map(s => [s.id, s]));
        setStories(p => p.map(s => map[s.id] || s));
      }
      toast(`Predicted ${predicted.length} stories`);
    } catch (e) {
      toast("Prediction failed: " + e.message);
    } finally {
      setRunningPredictions(false);
    }
  }, [stories, activeTenant]);

  const researchForCampaign = useCallback((campaign) => {
    setResearchPrefill({
      campaign_id:   campaign.id,
      campaign_name: campaign.name,
      topic:         campaign.objective || campaign.name,
      audience:      campaign.audience  || "",
    });
    setTab("research");
    toast(`↗ Researching for "${campaign.name}"`);
  }, [setTab]);

  const removeCampaign = useCallback(async (id) => {
    await dbDeleteCampaign(id);
    setCampaigns(prev => prev.filter(c => c.id !== id));
    toast("Campaign deleted");
  }, []);

  const openAssistant = useCallback((ctx = null) => {
    if (ctx) setAgentContext(ctx);
    setAgentOpen(true);
  }, []);

  const runOnboarding = useCallback((refresh = false) => {
    window.location.href = `/onboarding?workspace_id=${encodeURIComponent(activeTenant.workspace_id || "")}&brand_profile_id=${encodeURIComponent(activeTenant.brand_profile_id || "")}&mode=${refresh ? "strategy_refresh" : "brand_setup"}`;
  }, [activeTenant]);

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
        toast(`↗ Low on ${fmt.replace("_"," ")} content — researching more`);
        return;
      }
    }

    // Fallback: just go to research
    setTab("research");
    toast("↗ Jumped to Research");
  }, [stories, setTab, setResearchPrefill]);

  // Auto-produce: generate and translate a story directly from calendar/alerts.
  const handleProduce = useCallback(async (storyId) => {
    const story = stories.find(s => s.id === storyId);
    if (!story || getStoryScript(story, "en")) return;
    const { runPrompt } = await import("@/lib/ai/runner");

    // English script
    const { text: enText } = await runPrompt({
      type:    "generate-script",
      params:  { story, brand_config: brandConfigForPrompt(appSettings) },
      context: { story_id: storyId, workspace_id: activeTenant?.workspace_id, brand_profile_id: activeTenant?.brand_profile_id, task_type: "rewrite_script" },
      parse:   false,
    });
    await updateStory(storyId, { ...storyScriptPatch("en", enText, story), script_version: 1, status: "scripted" });

    // Auto-translate to configured secondary languages.
    const secondaryLanguages = getBrandLanguages(appSettings).filter(lang => lang.key !== "en");
    let storySnapshot = { ...story, ...storyScriptPatch("en", enText, story) };
    for (const lang of secondaryLanguages) {
      const { text: translated } = await runPrompt({
        type:    "translate-script",
        params:  { script: enText, lang_key: lang.key, brand_config: brandConfigForPrompt(appSettings) },
        context: { story_id: storyId, workspace_id: activeTenant?.workspace_id, brand_profile_id: activeTenant?.brand_profile_id, task_type: "rewrite_script" },
        parse:   false,
      });
      const patch = storyScriptPatch(lang.key, translated, storySnapshot);
      storySnapshot = { ...storySnapshot, ...patch };
      await updateStory(storyId, patch);
    }
  }, [stories, updateStory, appSettings]);

 // v3.11.4 — Global keyboard shortcuts driven by SHORTCUTS registry.
  // Cross-platform (metaKey || ctrlKey).
  useEffect(() => {
    const navKeys = TAB_KEYS;
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
          const idx = navKeys.indexOf(prev);
          const safe = idx === -1 ? 0 : idx;
          if (e.key === "ArrowRight") return navKeys[Math.min(safe + 1, navKeys.length - 1)];
          return navKeys[Math.max(safe - 1, 0)];
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleProductionShortcut]);

  const exportCSV = () => {
    const languages = getBrandLanguages(appSettings);
    const hdr = ["Title","Status","Content Type","Content Template","Programme","Objective","Audience","Channel","Campaign","Deliverable","Archetype","Era","Subjects","Angle","Hook",...languages.map(l => `Script ${l.key.toUpperCase()}`),"Score","Views","Completion%","Saves"];
    const esc = v => `"${(v||"").toString().replace(/"/g,'""')}"`;
    const rows = stories.map(s => [
      esc(s.title), s.status, s.content_type || "narrative", esc(s.content_template_id), esc(s.format), esc(contentObjective(s)), esc(contentAudience(s)), esc(contentChannel(s)), esc(s.campaign_name), esc(s.deliverable_type),
      esc(s.archetype), esc(s.era), esc(subjectText(s)), esc(s.angle), esc(s.hook),
      ...languages.map(l => esc(getStoryScript(s, l.key))),
      s.score_total, s.metrics_views, s.metrics_completion, s.metrics_saves,
    ]);
    const blob = new Blob([[hdr.join(","),...rows.map(r=>r.join(","))].join("\n")],{type:"text/csv"});
    const slug = getBrandName(appSettings).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "pipeline";
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${slug}_pipeline_${new Date().toISOString().split("T")[0]}.csv`; a.click();
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
      const findIdx = (...names) => names.map(idx).find(i => i >= 0) ?? -1;
      const languages = getBrandLanguages(appSettings);
      const existing = new Set(stories.map(s=>s.title?.toLowerCase())); const n = [];
      for (const line of lines) {
        const p = parseCSVLine(line);
        const title = p[findIdx("Title")] || p[0];
        if (!title || existing.has(title.toLowerCase())) continue;
        const base = {
          id: crypto.randomUUID(),
          title,
          status: p[findIdx("Status")] || "accepted",
          content_type: p[findIdx("Content Type", "Content type", "Type")] || "narrative",
          content_template_id: p[findIdx("Content Template", "Template", "Template ID")] || "",
          format: p[findIdx("Programme", "Program", "Format")] || "",
          objective: p[findIdx("Objective", "Goal")] || "",
          audience: p[findIdx("Audience", "Target Audience")] || "",
          channel: p[findIdx("Channel", "Platform", "Platform Target")] || "",
          platform_target: p[findIdx("Channel", "Platform", "Platform Target")] || "",
          campaign_name: p[findIdx("Campaign", "Campaign Name")] || "",
          deliverable_type: p[findIdx("Deliverable", "Deliverable Type", "Asset Type")] || "",
          archetype: p[findIdx("Archetype")] || "",
          era: p[findIdx("Era")] || "",
          players: p[findIdx("Subjects", "Players", "Player(s)")] || "",
          angle: p[findIdx("Angle")] || "",
          hook: p[findIdx("Hook")] || "",
          score_total: parseInt(p[findIdx("Score")]) || null,
          metrics_views: parseInt(p[findIdx("Views")]) || null,
          metrics_completion: parseFloat(p[findIdx("Completion%")]) || null,
          metrics_saves: parseInt(p[findIdx("Saves")]) || null,
          created_at: new Date().toISOString(),
        };
        let storyWithScripts = base;
        for (const lang of languages) {
          const value = p[findIdx(`Script ${lang.key.toUpperCase()}`, lang.key === "en" ? "Script" : "")] || "";
          if (value) storyWithScripts = { ...storyWithScripts, ...storyScriptPatch(lang.key, value, storyWithScripts) };
        }
        n.push(storyWithScripts);
      }
      if (n.length>0) await addStories(n);
    }; input.click();
  };

  const currentBrandLabel = brandProfiles.find(p => p.id === activeTenant.brand_profile_id)?.name || getBrandName(appSettings) || "Creative Engine";
  const showOnboardingPrompt = shouldPromptOnboarding(appSettings);
  const onboardingUrl = `/onboarding?workspace_id=${encodeURIComponent(activeTenant.workspace_id || "")}&brand_profile_id=${encodeURIComponent(activeTenant.brand_profile_id || "")}&mode=${brandProfiles.length <= 1 ? "workspace_setup" : "brand_setup"}`;

  const Spinner = () => (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:20, height:20, borderRadius:"50%", border:"1.5px solid var(--t4)", borderTopColor:"var(--t1)" }} className="anim-spin" />
    </div>
  );

  if (authLoading) return <Spinner />;
  if (!user) return <LoginScreen onSignIn={handleSignIn} loading={authLoading} error={authError} />;
  if (workspacesLoaded && workspaces.length === 0) return (
    <WorkspaceSetupScreen onSignOut={handleSignOut} userEmail={user?.email} />
  );
  if (loading) return <Spinner />;

  const menuBtn = { width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, border:"none", background:"transparent", cursor:"pointer", color:"var(--t2)", fontSize:12, fontFamily:"inherit" };

  return (
    <AssistantContext.Provider value={{ openAssistant }}>
    <div style={{ height:"100vh", background:"var(--bg)", color:"var(--t1)", display:"flex", overflow:"hidden" }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: sidebarOpen ? 220 : 52,
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 200ms var(--ce-ease)",
        background: "var(--ce-bg-2)",
        borderRight: "0.5px solid var(--ce-line)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 15,
      }}>
        <div style={{ width: sidebarOpen ? 220 : 52, display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", transition:"width 200ms var(--ce-ease)" }}>

          {/* Workspace block / logo — click to toggle */}
          <button onClick={() => setSidebarOpen(s=>!s)} style={{
            display:"flex", alignItems:"center", gap: sidebarOpen ? 9 : 0,
            padding: sidebarOpen ? "14px 10px 10px" : "14px 0 10px",
            justifyContent: sidebarOpen ? "flex-start" : "center",
            background:"transparent", border:"none", cursor:"pointer",
            color:"var(--ce-text)", flexShrink:0, width:"100%",
            transition:"padding 200ms var(--ce-ease)",
          }}>
            <div style={{
              width:22, height:22, borderRadius:6, flexShrink:0,
              background:"var(--ce-fill-3)",
              border:"0.5px solid var(--ce-line-2)",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              <CEMarkInline size={12} />
            </div>
            {sidebarOpen && (
              <div style={{ flex:1, minWidth:0, textAlign:"left" }}>
                <div style={{ fontSize:12, fontWeight:600, letterSpacing:"-0.01em", color:"var(--ce-text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentBrandLabel}</div>
                <div style={{ fontSize:10, color:"var(--ce-text-4)", fontFamily:"var(--font-mono)", marginTop:1 }}>workspace</div>
              </div>
            )}
          </button>

          {/* Brand/workspace selectors — expanded only */}
          {sidebarOpen && (
            <div style={{ padding:"0 10px 10px", flexShrink:0, display:"flex", flexDirection:"column", gap:5 }}>
              {workspaces.length > 1 && (
                <select className="ce-select-control" value={activeTenant.workspace_id}
                  onChange={(e) => setTenant({ workspace_id: e.target.value, brand_profile_id: e.target.value })}
                  style={{ width:"100%", height:26, borderRadius:6, border:"0.5px solid var(--ce-line-2)", background:"var(--ce-fill)", color:"var(--ce-text-2)", fontSize:11, fontFamily:"inherit", padding:"0 6px", outline:"none" }}>
                  {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
                </select>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 26px", gap:5 }}>
                <select className="ce-select-control" value={activeTenant.brand_profile_id}
                  onChange={(e) => setTenant({ ...activeTenant, brand_profile_id: e.target.value })}
                  style={{ minWidth:0, width:"100%", height:26, borderRadius:6, border:"0.5px solid var(--ce-line-2)", background:"var(--ce-fill)", color:"var(--ce-text-2)", fontSize:11, fontFamily:"inherit", padding:"0 6px", outline:"none" }}>
                  {brandProfiles.length === 0 && <option value={activeTenant.brand_profile_id}>{currentBrandLabel}</option>}
                  {brandProfiles.map(p => <option key={p.id} value={p.id}>{p.name || "Untitled brand"}</option>)}
                </select>
                <button className="ce-icon-button" onClick={createBrand} title="New brand"
                  style={{ height:26, borderRadius:6, border:"0.5px solid var(--ce-line-2)", background:"var(--ce-fill)", color:"var(--ce-text-3)", cursor:"pointer", fontSize:16, lineHeight:"20px", padding:0, display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
              </div>
            </div>
          )}

          {/* ⌘K Search bar — expanded only */}
          {sidebarOpen && (
            <div style={{ padding:"0 10px 8px", flexShrink:0 }}>
              <button onClick={() => {}} title="Search or command (⌘K)" style={{
                display:"flex", alignItems:"center", gap:8,
                width:"100%", padding:"6px 9px", borderRadius:6,
                background:"var(--ce-fill)", border:"0.5px solid var(--ce-line)",
                color:"var(--ce-text-4)", cursor:"pointer", fontFamily:"inherit", fontSize:12,
                transition:"border-color var(--ce-dur-1) var(--ce-ease)",
              }}>
                <IconSearch size={12} style={{ flexShrink:0 }} />
                <span style={{ flex:1, textAlign:"left" }}>Search or command</span>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ce-text-5)", letterSpacing:0 }}>⌘K</span>
              </button>
            </div>
          )}

          {/* Nav items */}
          <nav style={{ flex:1, padding: sidebarOpen ? "0 10px" : "0", overflowY:"auto", display:"flex", flexDirection:"column", gap:1, alignItems: sidebarOpen ? "stretch" : "center" }}>
            {PRIMARY_TABS.map(t => {
              const active = tab === t.key;
              return (
                <button key={t.key} className={`ce-sidebar-item${active ? " is-active" : ""}`} onClick={() => setTab(t.key)} title={t.label} style={{
                  width: sidebarOpen ? "100%" : 32,
                  height: sidebarOpen ? "auto" : 32,
                  display:"flex", alignItems:"center",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  gap: sidebarOpen ? 10 : 0,
                  padding: sidebarOpen ? "6.5px 9px" : 0,
                  borderRadius: sidebarOpen ? 6 : 7,
                  border: "0.5px solid " + (active ? "var(--ce-line-2)" : "transparent"),
                  cursor:"pointer",
                  background: active ? "var(--ce-fill-2)" : "transparent",
                  color: active ? "var(--ce-text)" : "var(--ce-text-2)",
                  fontSize:12.5, fontWeight: active ? 550 : 400,
                  transition:"background var(--ce-dur-1) var(--ce-ease), color var(--ce-dur-1) var(--ce-ease)",
                }}>
                  <t.Icon size={14} style={{ flexShrink:0 }} />
                  {sidebarOpen && <span style={{ flex:1 }}>{t.label}</span>}
                </button>
              );
            })}

            <div style={{ height:"0.5px", background:"var(--ce-line)", margin: sidebarOpen ? "8px 0" : "8px 8px" }} />

            {sidebarOpen && <div style={{ fontSize:10, color:"var(--ce-text-5)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600, padding:"0 9px 4px", fontFamily:"var(--font-mono)" }}>Planning</div>}
            {SECONDARY_TABS.map(t => {
              const active = tab === t.key;
              return (
                <button key={t.key} className={`ce-sidebar-item${active ? " is-active" : ""}`} onClick={() => setTab(t.key)} title={t.label} style={{
                  width: sidebarOpen ? "100%" : 32,
                  height: sidebarOpen ? "auto" : 32,
                  display:"flex", alignItems:"center",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  gap: sidebarOpen ? 10 : 0,
                  padding: sidebarOpen ? "6px 9px" : 0,
                  borderRadius: sidebarOpen ? 6 : 7,
                  border: "0.5px solid " + (active ? "var(--ce-line-2)" : "transparent"),
                  cursor:"pointer",
                  background: active ? "var(--ce-fill-2)" : "transparent",
                  color: active ? "var(--ce-text)" : "var(--ce-text-3)",
                  fontSize:12, fontWeight: active ? 550 : 400,
                  transition:"background var(--ce-dur-1) var(--ce-ease), color var(--ce-dur-1) var(--ce-ease)",
                }}>
                  <t.Icon size={13} style={{ flexShrink:0 }} />
                  {sidebarOpen && <span style={{ flex:1 }}>{t.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Bottom — task status + settings + user */}
          <div style={{ padding: sidebarOpen ? "8px 10px" : "8px 0", flexShrink:0, borderTop:"0.5px solid var(--ce-line)", display:"flex", flexDirection:"column", gap:1, alignItems: sidebarOpen ? "stretch" : "center" }}>

            {/* Live task status — visible when engine is working */}
            {runningPredictions && sidebarOpen && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 9px", borderRadius:6, background:"var(--ce-fill)", border:"0.5px solid var(--ce-line)", marginBottom:4 }}>
                <CEMarkInline size={12} strokeWidth={1.1} color="var(--ce-live)" breathe />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, color:"var(--ce-text-2)", fontWeight:550 }}>Running predictions…</div>
                </div>
              </div>
            )}

            <button className={`ce-sidebar-item${showSettings ? " is-active" : ""}`} onClick={() => setShowSettings(s=>!s)} title="Settings" style={{
              width: sidebarOpen ? "100%" : 32, height: sidebarOpen ? "auto" : 32,
              display:"flex", alignItems:"center",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              gap: sidebarOpen ? 10 : 0,
              padding: sidebarOpen ? "6.5px 9px" : 0,
              borderRadius: sidebarOpen ? 6 : 7,
              border:"0.5px solid transparent",
              cursor:"pointer",
              background: showSettings ? "var(--ce-fill-2)" : "transparent",
              color:"var(--ce-text-3)", fontSize:12,
            }}>
              <IconSettings size={14} style={{ flexShrink:0 }} />
              {sidebarOpen && <span style={{ flex:1 }}>Settings</span>}
            </button>

            {/* User row */}
            <div style={{ position:"relative" }}>
              <button className={`ce-sidebar-item${showUserMenu==="user" ? " is-active" : ""}`} onClick={() => setShowUserMenu(m=>m==="user"?null:"user")} title={user.user_metadata?.full_name || user.email} style={{
                width: sidebarOpen ? "100%" : 32, height: sidebarOpen ? "auto" : 32,
                display:"flex", alignItems:"center",
                justifyContent: sidebarOpen ? "flex-start" : "center",
                gap: sidebarOpen ? 8 : 0,
                padding: sidebarOpen ? "6px 9px" : 0,
                borderRadius: sidebarOpen ? 6 : 999,
                border:"0.5px solid transparent",
                cursor:"pointer",
                background:"transparent", color:"var(--ce-text-2)", fontSize:12,
              }}>
                {user.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="" style={{ width:20, height:20, borderRadius:999, objectFit:"cover", flexShrink:0, border:"0.5px solid var(--ce-line-2)" }} />
                  : <div style={{ width:20, height:20, borderRadius:999, background:"var(--ce-fill-3)", border:"0.5px solid var(--ce-line-2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:600, color:"var(--ce-text-2)", flexShrink:0 }}>
                      {(user.user_metadata?.full_name || user.email || "?").slice(0,2).toUpperCase()}
                    </div>
                }
                {sidebarOpen && <>
                  <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"left", fontSize:12 }}>{user.user_metadata?.full_name || user.email}</span>
                  <IconSettings size={12} style={{ flexShrink:0, color:"var(--ce-text-4)" }} />
                </>}
              </button>
              {showUserMenu==="user" && (
                <div style={{ position:"absolute", bottom:"100%", left:0, right:0, zIndex:40, background:"var(--ce-elevated)", borderRadius:10, padding:4, border:"0.5px solid var(--ce-line-2)", boxShadow:"var(--ce-shadow-3)", marginBottom:4 }}>
                  <div style={{ padding:"8px 10px 6px" }}>
                    <div style={{ fontSize:12, fontWeight:500, color:"var(--ce-text)" }}>{user.user_metadata?.full_name||"User"}</div>
                    <div style={{ fontSize:11, color:"var(--ce-text-3)", marginTop:1 }}>{user.email}</div>
                  </div>
                  <div style={{ height:"0.5px", background:"var(--ce-line)", margin:"0 4px 4px" }}/>
                  <button className="ce-menu-item" onClick={()=>{setShowSettings(true);setShowUserMenu(null);}} style={menuBtn}><IconSettings size={12}/> Settings</button>
                  <button className="ce-menu-item" onClick={()=>{importCSV();setShowUserMenu(null);}} style={menuBtn}><Upload size={12}/> Import CSV</button>
                  <button className="ce-menu-item" onClick={()=>{exportCSV();setShowUserMenu(null);}} style={menuBtn}><Download size={12}/> Export CSV</button>
                  <div style={{ height:"0.5px", background:"var(--ce-line)", margin:"4px 4px" }}/>
                  <button className="ce-menu-item" onClick={handleSignOut} style={menuBtn}><LogOut size={12}/> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>

        {/* Topbar — CE design, breadcrumb + agent toggle */}
        <header style={{ flexShrink:0, height:44, display:"flex", alignItems:"center", gap:12, padding:"0 18px", background:"var(--ce-bg)", borderBottom:"0.5px solid var(--ce-line)", zIndex:20, position:"sticky", top:0 }}>
          {/* Breadcrumb */}
          <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5, color:"var(--ce-text-3)" }}>
            <span style={{ color:"var(--ce-text)", fontWeight:550 }}>
              {TABS.find(t=>t.key===tab)?.label}
            </span>
          </div>
          <div style={{ flex:1 }} />
          {/* Agent toggle — CEMark breathes when open */}
          <button onClick={() => setAgentOpen(s=>!s)} title="Engine (⌘⌥A)" style={{
            width:30, height:30, borderRadius:7,
            border:`0.5px solid ${agentOpen ? "var(--ce-live-2)" : "var(--ce-line)"}`,
            background: agentOpen ? "var(--ce-live-3)" : "transparent",
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
            flexShrink:0, transition:"border-color var(--ce-dur-1) var(--ce-ease), background var(--ce-dur-1) var(--ce-ease)",
          }}>
            <CEMarkInline size={13} strokeWidth={1.1}
              color={agentOpen ? "var(--ce-live)" : "var(--ce-text-3)"}
              breathe={agentOpen} />
          </button>
        </header>

        {/* ── Content ── */}
        {tab === "campaigns" ? (
          <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <CampaignsView
              stories={stories}
              campaigns={campaigns}
              onCreateCampaign={createCampaign}
              onUpdateCampaign={saveCampaign}
              onDeleteCampaign={removeCampaign}
              onUpdateStory={updateStory}
              onResearchForCampaign={researchForCampaign}
              settings={appSettings}
              tenant={activeTenant}
            />
          </div>
        ) : (
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

              {showOnboardingPrompt && (
                <div style={{ marginBottom:18, padding:"14px 16px", borderRadius:8, border:"0.5px solid rgba(196,154,60,0.30)", background:"rgba(196,154,60,0.08)", display:"flex", justifyContent:"space-between", gap:14, alignItems:"center", flexWrap:"wrap" }}>
                  <div style={{ minWidth:240 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)", marginBottom:3 }}>Strategy setup is incomplete</div>
                    <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.5 }}>Run Smart Onboarding to draft Brand Profile, Content Strategy, Programmes, risks, and first content ideas before saving them to workspace settings.</div>
                  </div>
                  <button onClick={() => { window.location.href = onboardingUrl; }} style={{ padding:"8px 14px", borderRadius:8, border:"none", background:"var(--t1)", color:"var(--bg)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                    Run onboarding
                  </button>
                </div>
              )}

              {/* All views mounted always — CSS visibility preserves state */}
              <div style={{ display: tab==="home" ? "block" : "none" }}>
                <HomeView stories={stories} settings={appSettings} tenant={activeTenant} onNavigate={setTab} onOpenSettings={() => setShowSettings(true)} onRunOnboarding={runOnboarding} />
              </div>
              <div style={{ display: tab==="strategy" ? "block" : "none" }}>
                <StrategyView
                  settings={appSettings}
                  tenant={activeTenant}
                  onRunOnboarding={runOnboarding}
                  onOpenAssistant={openAssistant}
                  onSettingsChange={(s) => {
                    setAppSettings(s);
                    setBrandProfiles(prev => prev.map(p => p.id === activeTenant.brand_profile_id ? { ...p, name: s?.brand?.name || p.name, settings: s } : p));
                    try { localStorage.setItem(tenantStorageKey("settings", activeTenant), JSON.stringify(s)); } catch {}
                  }}
                />
              </div>
              <div style={{ display: tab==="pipeline"   ? "block" : "none" }}>
                <PipelineView stories={stories} onSelect={setSelected} onStageChange={stageChange} onBulkAction={bulkAction} onBulkReject={bulkReject} onBulkDelete={bulkDelete} onUpdate={updateStory} setActiveTab={setTab} settings={appSettings} campaigns={campaigns} displayMode={pipelineDisplayMode} />
              </div>
              <div style={{ display: tab==="research"   ? "block" : "none" }}>
                <ResearchView stories={stories} onAddStories={addStories} onStateChange={setResearchState} prefill={researchPrefill} onPrefillUsed={() => setResearchPrefill(null)} settings={appSettings} tenant={activeTenant} />
              </div>
              <div style={{ display: tab==="create" || tab==="script" || tab==="production" ? "block" : "none" }}>
                <CreateView stories={stories} onUpdate={updateStory} mode={createMode} onModeChange={setCreateMode} tenant={activeTenant} settings={appSettings} campaigns={campaigns} onNavigate={setTab} />
              </div>
              <div style={{ display: tab==="calendar"   ? "block" : "none" }}><CalendarView   stories={stories} onUpdate={updateStory} onProduce={handleProduce} settings={appSettings} campaigns={campaigns} /></div>
              <div style={{ display: tab==="analyze"    ? "block" : "none" }}><AnalyzeView    stories={stories} onUpdate={updateStory} tenant={activeTenant} settings={appSettings} /></div>

            </div>
          </main>
        )}
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
        tenant={activeTenant}
        settings={appSettings}
        agent_context={agentContext}
        onClearContext={() => setAgentContext(null)}
      />

      {showUserMenu && <div onClick={() => setShowUserMenu(null)} style={{ position:"fixed", inset:0, zIndex:30 }} />}
      {selected && <DetailModal story={selected} stories={stories.filter(s=>!["rejected","archived"].includes(s.status))} onClose={() => setSelected(null)} onUpdate={updateStory} onDelete={handleDelete} onStageChange={stageChange} settings={appSettings} tenant={activeTenant} onOpenAssistant={openAssistant} />}
      <SettingsModal isOpen={showSettings} onClose={()=>setShowSettings(false)} stories={stories} onSettingsChange={(s) => { setAppSettings(s); setBrandProfiles(prev => prev.map(p => p.id === activeTenant.brand_profile_id ? { ...p, name: s?.brand?.name || p.name, settings: s } : p)); applyTheme(s?.appearance?.theme || "system"); if (s?.appearance?.default_tab) setTab(s.appearance.default_tab); try { localStorage.setItem(tenantStorageKey("settings", activeTenant), JSON.stringify(s)); } catch {} }} initialSettings={appSettings} version={VERSION} tenant={activeTenant} onRunPredictions={runPredictions} runningPredictions={runningPredictions} onRunOnboarding={runOnboarding} pipelineDisplayMode={pipelineDisplayMode} onPipelineDisplayModeChange={updatePipelineDisplayMode} />
      <ShortcutsCheatSheet isOpen={showShortcuts} onClose={()=>setShowShortcuts(false)} />

      {newBrand.show && (
        <div onClick={() => setNewBrand(s => ({ ...s, show: false }))} style={{ position:"fixed", inset:0, zIndex:100, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"var(--bg2)", border:"0.5px solid var(--border)", borderRadius:12, padding:24, width:320, display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"var(--t1)" }}>New brand</div>
            <input
              autoFocus
              placeholder="Brand name"
              value={newBrand.name}
              onChange={e => setNewBrand(s => ({ ...s, name: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") submitNewBrand(); if (e.key === "Escape") setNewBrand(s => ({ ...s, show: false })); }}
              style={{ height:32, borderRadius:7, border:"0.5px solid var(--border)", background:"var(--fill2)", color:"var(--t1)", fontSize:13, padding:"0 10px", outline:"none", fontFamily:"inherit", width:"100%", boxSizing:"border-box" }}
            />
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"var(--t2)", cursor:"pointer" }}>
              <input type="checkbox" checked={newBrand.cloneSettings} onChange={e => setNewBrand(s => ({ ...s, cloneSettings: e.target.checked }))} />
              Clone current brand settings
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"var(--t2)", cursor:"pointer" }}>
              <input type="checkbox" checked={newBrand.openSettings} onChange={e => setNewBrand(s => ({ ...s, openSettings: e.target.checked }))} />
              Open settings after creation
            </label>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={() => setNewBrand(s => ({ ...s, show: false }))} style={{ padding:"6px 14px", borderRadius:7, border:"0.5px solid var(--border)", background:"transparent", color:"var(--t2)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
              <button onClick={submitNewBrand} disabled={!newBrand.name.trim()} style={{ padding:"6px 14px", borderRadius:7, border:"none", background:"var(--ce-text)", color:"var(--ce-bg)", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", opacity: newBrand.name.trim() ? 1 : 0.4 }}>Create</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
    </AssistantContext.Provider>
  );
}
