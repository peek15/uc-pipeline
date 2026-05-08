"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, FileText, Image as ImageIcon, Library, Mic2, PackageCheck, RefreshCw, Search, Sparkles, Video, Wand2 } from "lucide-react";
import { isInProductionQueue } from "@/lib/constants";
import { runPrompt, runPromptStream } from "@/lib/ai/runner";
import { DEFAULT_BRAND_PROFILE_ID } from "@/lib/brand";
import { usePersistentState } from "@/lib/usePersistentState";
import { SHORTCUTS, matches, shouldIgnoreFromInput, renderCombo } from "@/lib/shortcuts";
import { PageHeader, Panel, Pill, buttonStyle } from "@/components/OperationalUI";
import AssetLibraryModal from "@/components/AssetLibraryModal";
import { brandConfigForPrompt, getBrandLanguages, getBrandProgrammeMap, getContentTemplate, getContentTypeLabel, getStoryScript, hasAllConfiguredScripts, storyScriptPatch } from "@/lib/brandConfig";
import { auditStoryQuality, qualityGatePatch } from "@/lib/qualityGate";
import {
  AssetMatchesSection,
  AssemblySection,
  BriefSection,
  ReadinessStrip,
  VisualSection,
  VoiceSection,
  matchesProductionFilter,
} from "@/components/ProductionView";

const STEP_DEFS = {
  script: { key: "script", label: "Script", icon: FileText, mode: "write" },
  translations: { key: "translations", label: "Translations", icon: Wand2, mode: "write" },
  brief: { key: "brief", label: "Brief", icon: Search, mode: "produce" },
  assets: { key: "assets", label: "Assets", icon: Library, mode: "produce" },
  visuals: { key: "visuals", label: "Visuals", icon: ImageIcon, mode: "produce" },
  voice: { key: "voice", label: "Voice", icon: Mic2, mode: "produce" },
  assembly: { key: "assembly", label: "Assembly", icon: Video, mode: "produce" },
  review: { key: "review", label: "Review", icon: PackageCheck, mode: "produce" },
};

const COPY_STEP_WORDS = new Set(["copy", "caption", "captions", "outline", "press", "email", "landing", "ad", "cta", "concept"]);
const STEP_ALIASES = {
  research: null,
  ideation: null,
  idea: null,
  script: "script",
  write: "script",
  draft: "script",
  translation: "translations",
  translations: "translations",
  language: "translations",
  languages: "translations",
  brief: "brief",
  production_brief: "brief",
  visual_brief: "brief",
  asset: "assets",
  assets: "assets",
  library: "assets",
  visual: "visuals",
  visuals: "visuals",
  image: "visuals",
  images: "visuals",
  voice: "voice",
  audio: "voice",
  vo: "voice",
  assembly: "assembly",
  assemble: "assembly",
  export: "assembly",
  handoff: "assembly",
  review: "review",
  qa: "review",
  approval: "review",
};

function wc(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function getScript(story, lang, localLangs, streaming) {
  if (!story) return "";
  if (lang === "en") return streaming[story.id] !== undefined ? streaming[story.id] : getStoryScript(story, "en") || "";
  return localLangs[story.id]?.[lang] ?? getStoryScript(story, lang) ?? "";
}

function normalizeStepToken(token) {
  const raw = String(token || "").trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!key) return null;
  if (COPY_STEP_WORDS.has(key) || [...COPY_STEP_WORDS].some(word => key.includes(word))) {
    return { ...STEP_DEFS.script, key: "script", label: raw.replace(/\b\w/g, c => c.toUpperCase()) };
  }
  const alias = STEP_ALIASES[key];
  if (alias === null) return null;
  if (alias && STEP_DEFS[alias]) return STEP_DEFS[alias];
  return { key, label: raw.replace(/\b\w/g, c => c.toUpperCase()), icon: FileText, mode: "produce", custom: true };
}

function stepsForStory(story, settings) {
  const template = getContentTemplate(settings, story?.content_template_id);
  const rawSteps = Array.isArray(template?.workflow_steps) && template.workflow_steps.length
    ? template.workflow_steps
    : ["script", "translations", "brief", "assets", "voice", "visuals", "assembly", "review"];
  const seen = new Set();
  const steps = rawSteps
    .map(normalizeStepToken)
    .filter(Boolean)
    .filter(step => {
      if (seen.has(step.key)) return false;
      seen.add(step.key);
      return true;
    });
  if (!steps.some(step => step.key === "review")) steps.push(STEP_DEFS.review);
  return steps.length ? steps : [STEP_DEFS.script, STEP_DEFS.review];
}

function stepDone(story, step, settings) {
  if (!story || !step) return false;
  if (step.key === "script") return !!getStoryScript(story, "en");
  if (step.key === "translations") return hasAllConfiguredScripts(story, settings);
  if (step.key === "brief") return !!story.visual_brief;
  if (step.key === "assets") return !!story.visual_refs?.selected?.length;
  if (step.key === "visuals") return !!story.visual_refs?.selected?.length;
  if (step.key === "voice") return !!(story.audio_refs && Object.keys(story.audio_refs || {}).length);
  if (step.key === "assembly") return !!story.assembly_brief;
  if (step.key === "review") return false;
  return !!story.metadata?.template_progress?.[step.key]?.done;
}

function createProgress(story, settings) {
  const checks = stepsForStory(story, settings)
    .filter(step => step.key !== "review")
    .map(step => ({ key: step.key, label: step.label, done: stepDone(story, step, settings) }));
  const done = checks.filter(c => c.done).length;
  const total = checks.length || 1;
  return { checks, done, total, percent: Math.round((done / total) * 100) };
}

function nextAction(story, settings) {
  const next = stepsForStory(story, settings).find(step => step.key !== "review" && !stepDone(story, step, settings));
  if (next) return next.key === "script" ? `Write ${next.label.toLowerCase()}` : next.label;
  return "Review";
}

function queueFilterMatch(story, filter, settings) {
  if (filter === "all") return true;
  const hasScript = !!getStoryScript(story, "en");
  const steps = stepsForStory(story, settings);
  const hasStep = key => steps.some(step => step.key === key);
  if (filter === "needs_script") return hasStep("script") && !hasScript;
  if (filter === "needs_translation") return hasStep("translations") && hasScript && !hasAllConfiguredScripts(story, settings);
  if (filter === "needs_brief") return hasStep("brief") && hasScript && !story.visual_brief;
  if (filter === "needs_visuals") return hasStep("visuals") && matchesProductionFilter(story, "needs_assets");
  if (filter === "needs_voice") return hasStep("voice") && matchesProductionFilter(story, "needs_voice");
  if (filter === "ready_review") return createProgress(story, settings).done >= createProgress(story, settings).total;
  return true;
}

function stepForMode(mode, current, steps = null) {
  const available = steps?.length ? steps : [STEP_DEFS.script, STEP_DEFS.translations, STEP_DEFS.brief, STEP_DEFS.assets, STEP_DEFS.voice, STEP_DEFS.visuals, STEP_DEFS.assembly, STEP_DEFS.review];
  const currentStep = available.find(step => step.key === current);
  if (currentStep?.mode === mode) return current;
  const next = available.find(step => step.mode === mode) || available[0];
  if (next) return next.key;
  return current;
}

function programmeColor(story, settings) {
  const programme = getBrandProgrammeMap(settings)[story?.format];
  return programme?.color || "var(--border)";
}

function TemplateStrip({ story, settings }) {
  const template = getContentTemplate(settings, story?.content_template_id);
  if (!template) return null;
  const chips = [
    template.content_type,
    story?.objective || template.objective,
    story?.deliverable_type || template.deliverable_type,
    story?.channel || story?.platform_target || template.channels?.[0],
  ].filter(Boolean);
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--fill2)", border: "0.5px solid var(--border)", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 7 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Template</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{template.name}</div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {chips.map(chip => <span key={chip} style={{ fontSize: 10, color: "var(--t2)", padding: "2px 7px", borderRadius: 99, background: "var(--card)", border: "0.5px solid var(--border)" }}>{chip}</span>)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5 }}>
          <span style={{ color: "var(--t2)", fontWeight: 600 }}>Fields:</span> {(template.required_fields || []).join(", ") || "default"}
        </div>
        <div style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5 }}>
          <span style={{ color: "var(--t2)", fontWeight: 600 }}>Workflow:</span> {(template.workflow_steps || []).join(" > ") || "default"}
        </div>
      </div>
    </div>
  );
}

function TemplateTaskSection({ story, step, onUpdate }) {
  const progress = story.metadata?.template_progress?.[step.key] || {};
  const [notes, setNotes] = useState(progress.notes || "");
  useEffect(() => {
    setNotes(story.metadata?.template_progress?.[step.key]?.notes || "");
  }, [story.id, step.key]);

  const save = async (done) => {
    const metadata = {
      ...(story.metadata && typeof story.metadata === "object" ? story.metadata : {}),
      template_progress: {
        ...(story.metadata?.template_progress || {}),
        [step.key]: {
          done,
          notes,
          updated_at: new Date().toISOString(),
        },
      },
    };
    await onUpdate?.(story.id, { metadata });
  };

  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>{step.label}</div>
          <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5 }}>Template-specific step. Track notes here and mark it ready when this deliverable has what it needs.</div>
        </div>
        <Pill active={!!progress.done}>{progress.done ? "ready" : "open"}</Pill>
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5}
        placeholder="Notes, requirements, approval comments, links, or handoff details..."
        style={{ width: "100%", padding: "12px 14px", borderRadius: 8, background: "var(--bg2)", border: "0.5px solid var(--border)", color: "var(--t1)", fontSize: 13, lineHeight: 1.6, resize: "vertical", outline: "none", fontFamily: "inherit", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => save(true)} style={buttonStyle("primary", { padding: "7px 12px" })}><Check size={12} /> Mark ready</button>
        {progress.done && <button onClick={() => save(false)} style={buttonStyle("ghost", { padding: "7px 12px" })}>Reopen</button>}
      </div>
    </Panel>
  );
}

function ScriptWorkspace({ story, onUpdate, onSaved, localLangs, setLocalLangs, streaming, setStreaming, settings, stepLabel = "Script" }) {
  const languages = getBrandLanguages(settings);
  const secondaryLanguages = languages.filter(l => l.key !== "en");
  const template = getContentTemplate(settings, story?.content_template_id);
  const [viewLang, setViewLang] = usePersistentState("create_script_lang", "en");
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [localScript, setLocalScript] = useState(null); // tracks unsaved EN edits
  const [instruction, setInstruction] = useState("");   // revision instruction

  useEffect(() => {
    setError(null);
    setLocalScript(null);
    setInstruction("");
    if (!getScript(story, viewLang, localLangs, streaming)) setViewLang("en");
  }, [story.id]);

  const translateLang = async (lang, scriptText) => {
    const { text } = await runPrompt({
      type: "translate-script",
      params: { script: scriptText, lang_key: lang, brand_config: brandConfigForPrompt(settings) },
      context: { story_id: story.id },
      parse: false,
    });
    return text;
  };

  const generate = async (withTranslate = true, reviseInstruction = null) => {
    const currentForRevision = reviseInstruction
      ? (localScript !== null ? localScript : getStoryScript(story, "en") || null)
      : null;
    setLoading(`en-${story.id}`);
    setError(null);
    setStreaming(prev => ({ ...prev, [story.id]: "" }));
    try {
      const { text: enText } = await runPromptStream({
        type: "generate-script",
        params: {
          story,
          brand_config: brandConfigForPrompt(settings),
          content_template: template,
          instruction: reviseInstruction || null,
          current_script: currentForRevision,
        },
        context: { story_id: story.id },
        onChunk: (live) => setStreaming(prev => ({ ...prev, [story.id]: live })),
      });
      setStreaming(prev => { const next = { ...prev }; delete next[story.id]; return next; });
      setLocalScript(null);
      if (reviseInstruction) setInstruction("");
      const enPatch = storyScriptPatch("en", enText, story);
      let storySnapshot = { ...story, ...enPatch };
      await onUpdate(story.id, { ...enPatch, script_version: (story.script_version || 0) + 1, status: "scripted" });

      if (withTranslate && !reviseInstruction) {
        for (const lang of secondaryLanguages.map(l => l.key)) {
          setLoading(`${lang}-${story.id}`);
          const translated = await translateLang(lang, enText);
          setLocalLangs(prev => ({ ...prev, [story.id]: { ...(prev[story.id] || {}), [lang]: translated } }));
          const patch = storyScriptPatch(lang, translated, storySnapshot);
          storySnapshot = { ...storySnapshot, ...patch };
          await onUpdate(story.id, patch);
        }
      }
      onSaved?.(story.id, storySnapshot);
    } catch (err) {
      setError(err?.message || String(err));
      setStreaming(prev => { const next = { ...prev }; delete next[story.id]; return next; });
    } finally {
      setLoading(null);
    }
  };

  const saveEdits = async () => {
    if (localScript === null) return;
    try {
      const patch = storyScriptPatch("en", localScript, story);
      await onUpdate(story.id, patch);
      setLocalScript(null);
      onSaved?.(story.id, { ...story, ...patch });
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const translateMissing = async () => {
    const script = getScript(story, "en", localLangs, streaming);
    if (!script) return;
    setError(null);
    let storySnapshot = story;
    try {
      for (const lang of secondaryLanguages.map(l => l.key)) {
        if (getScript(storySnapshot, lang, localLangs, streaming)) continue;
        setLoading(`${lang}-${story.id}`);
        const translated = await translateLang(lang, script);
        setLocalLangs(prev => ({ ...prev, [story.id]: { ...(prev[story.id] || {}), [lang]: translated } }));
        const patch = storyScriptPatch(lang, translated, storySnapshot);
        storySnapshot = { ...storySnapshot, ...patch };
        await onUpdate(story.id, patch);
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(null);
    }
  };

  const exportVoicePack = async () => {
    const slug = (story.title || "story").slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    languages.forEach(lang => {
      const text = getScript(story, lang.key, localLangs, streaming);
      if (text) zip.file(`${slug}_${lang.key}.txt`, text);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-voice-pack.zip`;
    a.click();
  };

  const savedEnScript = getStoryScript(story, "en") || "";
  const displayEn    = localScript !== null ? localScript : savedEnScript;
  const scriptText   = viewLang === "en" ? displayEn : (getScript(story, viewLang, localLangs, streaming) || "");
  const available    = languages.filter(lang => getScript(story, lang.key, localLangs, streaming));
  const isStreaming  = story.id in streaming;
  const isBusy       = !!loading;
  const isDirty      = localScript !== null && localScript !== savedEnScript;
  const displayWc    = wc(viewLang === "en" ? displayEn : scriptText);

  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>Script workspace</div>
          <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5 }}>Generate the primary {stepLabel.toLowerCase()} first, then keep translations attached to the same content record.</div>
        </div>
        <Pill active={!!savedEnScript}>
          {savedEnScript ? `v${story.script_version || 1} · ${displayWc}w${isDirty ? " · edited" : ""}` : "no script"}
        </Pill>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {languages.map(lang => {
          const has  = lang.key === "en" ? !!displayEn : !!getScript(story, lang.key, localLangs, streaming);
          const busy = loading === `${lang.key}-${story.id}`;
          return (
            <button key={lang.key} onClick={() => has && setViewLang(lang.key)} disabled={!has}
              style={buttonStyle(viewLang === lang.key && has ? "primary" : "ghost", { padding: "5px 10px", opacity: has ? 1 : 0.45 })}>
              {busy ? <RefreshCw size={11} className="spin" /> : has ? <Check size={11} /> : null}
              {lang.label}
            </button>
          );
        })}
      </div>

      {scriptText || isStreaming ? (
        <div style={{ position: "relative", marginBottom: 12 }}>
          {isStreaming && <span style={{ position: "absolute", top: 12, right: 14, width: 7, height: 7, borderRadius: "50%", background: "var(--t1)", animation: "pulse 1s ease infinite", zIndex: 1 }} />}
          {viewLang === "en" && !isStreaming ? (
            <textarea
              className="type-script"
              value={displayEn}
              onChange={e => setLocalScript(e.target.value)}
              rows={10}
              style={{
                width: "100%", padding: "16px 18px", borderRadius: 8,
                background: "var(--bg2)", border: `0.5px solid ${isDirty ? "var(--gold)" : "var(--border)"}`,
                color: "var(--t2)", fontSize: 14, lineHeight: 1.85,
                fontFamily: "inherit", resize: "vertical", outline: "none",
                boxSizing: "border-box",
              }}
            />
          ) : (
            <div style={{ padding: "16px 18px", borderRadius: 8, background: "var(--bg2)", border: "0.5px solid var(--border)", maxHeight: 360, overflowY: "auto" }}>
              <div className="type-script" style={{ fontSize: 14, lineHeight: 1.85, color: "var(--t2)", whiteSpace: "pre-wrap" }}>{scriptText}</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: "36px 18px", borderRadius: 8, background: "var(--bg2)", border: "0.5px solid var(--border)", textAlign: "center", color: "var(--t4)", fontSize: 12, marginBottom: 12 }}>
          This content item is ready for its first {stepLabel.toLowerCase()} pass.
        </div>
      )}

      {/* Revision row — shown when a script exists */}
      {(savedEnScript || displayEn) && viewLang === "en" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <input
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && instruction.trim() && !isBusy) generate(false, instruction); }}
            placeholder="Revision instruction — e.g. make it shorter, more urgent, cut the opener…"
            style={{
              flex: 1, padding: "7px 10px", borderRadius: 7,
              border: "0.5px solid var(--border-in)", background: "var(--bg)",
              color: "var(--t1)", fontSize: 12, outline: "none", fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => instruction.trim() && generate(false, instruction)}
            disabled={!instruction.trim() || isBusy}
            style={buttonStyle("secondary", { padding: "7px 12px", flexShrink: 0 })}
          >
            <Wand2 size={12} /> Revise
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isDirty && (
          <button onClick={saveEdits} disabled={isBusy} style={buttonStyle("primary", { padding: "7px 12px" })}>
            <Check size={12} /> Save edits
          </button>
        )}
        <button onClick={() => generate(true)} disabled={isBusy} style={buttonStyle(isDirty ? "ghost" : "primary", { padding: "7px 12px" })}>
          <Sparkles size={12} /> {savedEnScript ? `Rewrite ${stepLabel.toLowerCase()} + translate` : `Generate ${stepLabel.toLowerCase()}`}
        </button>
        {savedEnScript && available.length < languages.length && (
          <button onClick={translateMissing} disabled={isBusy} style={buttonStyle("secondary", { padding: "7px 12px" })}>
            <Wand2 size={12} /> Translate missing
          </button>
        )}
        {scriptText && (
          <button onClick={async () => { await navigator.clipboard.writeText(scriptText); setCopied(true); setTimeout(() => setCopied(false), 1600); }} style={buttonStyle("ghost", { padding: "7px 12px" })}>
            <Copy size={12} /> {copied ? "Copied" : `Copy ${viewLang.toUpperCase()}`}
          </button>
        )}
        {available.length > 0 && (
          <button onClick={exportVoicePack} style={buttonStyle("ghost", { padding: "7px 12px" })}>
            <Download size={12} /> Voice pack
          </button>
        )}
      </div>
      {error && <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 7, color: "var(--error)", background: "var(--error-bg)", border: "0.5px solid var(--error-border)", fontSize: 11 }}>{error}</div>}
    </Panel>
  );
}

function TranslationWorkspace({ story, onUpdate, onSaved, localLangs, setLocalLangs, settings }) {
  const languages          = getBrandLanguages(settings);
  const secondaryLanguages = languages.filter(l => l.key !== "en");
  const enScript           = getStoryScript(story, "en") || "";

  const [localEdits,   setLocalEdits]   = useState({});
  const [loading,      setLoading]      = useState({});
  const [instructions, setInstructions] = useState({});
  const [errors,       setErrors]       = useState({});
  const [copied,       setCopied]       = useState({});

  useEffect(() => {
    setLocalEdits({}); setLoading({}); setInstructions({}); setErrors({}); setCopied({});
  }, [story.id]);

  const getTranslation = (langKey) => {
    if (langKey in localEdits) return localEdits[langKey];
    return localLangs[story.id]?.[langKey] ?? getStoryScript(story, langKey) ?? "";
  };

  const persistTranslation = async (langKey, text) => {
    setLocalLangs(prev => ({ ...prev, [story.id]: { ...(prev[story.id] || {}), [langKey]: text } }));
    const patch = storyScriptPatch(langKey, text, story);
    await onUpdate(story.id, patch);
    onSaved?.(story.id, { ...story, ...patch });
  };

  const retranslate = async (langKey) => {
    if (!enScript) return;
    setLoading(p => ({ ...p, [langKey]: "translating" }));
    setErrors(p => ({ ...p, [langKey]: null }));
    try {
      const { text } = await runPrompt({
        type: "translate-script",
        params: { script: enScript, lang_key: langKey, brand_config: brandConfigForPrompt(settings) },
        context: { story_id: story.id },
        parse: false,
      });
      await persistTranslation(langKey, text);
      setLocalEdits(p => { const n = { ...p }; delete n[langKey]; return n; });
    } catch (err) {
      setErrors(p => ({ ...p, [langKey]: err?.message || String(err) }));
    } finally {
      setLoading(p => ({ ...p, [langKey]: null }));
    }
  };

  const revise = async (langKey) => {
    const instr   = instructions[langKey];
    const current = getTranslation(langKey);
    if (!instr || !current) return;
    setLoading(p => ({ ...p, [langKey]: "revising" }));
    setErrors(p => ({ ...p, [langKey]: null }));
    try {
      const { text } = await runPrompt({
        type: "translate-script",
        params: { script: enScript, lang_key: langKey, brand_config: brandConfigForPrompt(settings), instruction: instr, current_translation: current },
        context: { story_id: story.id },
        parse: false,
      });
      setLocalEdits(p => ({ ...p, [langKey]: text }));
      setInstructions(p => ({ ...p, [langKey]: "" }));
    } catch (err) {
      setErrors(p => ({ ...p, [langKey]: err?.message || String(err) }));
    } finally {
      setLoading(p => ({ ...p, [langKey]: null }));
    }
  };

  const saveEdits = async (langKey) => {
    const text = localEdits[langKey];
    if (text === undefined) return;
    setLoading(p => ({ ...p, [langKey]: "saving" }));
    try {
      await persistTranslation(langKey, text);
      setLocalEdits(p => { const n = { ...p }; delete n[langKey]; return n; });
    } catch (err) {
      setErrors(p => ({ ...p, [langKey]: err?.message || String(err) }));
    } finally {
      setLoading(p => ({ ...p, [langKey]: null }));
    }
  };

  const translateMissing = async () => {
    for (const lang of secondaryLanguages) {
      if (!getTranslation(lang.key)) await retranslate(lang.key);
    }
  };

  const copyText = async (langKey) => {
    const text = getTranslation(langKey);
    if (!text) return;
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(p => ({ ...p, [langKey]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [langKey]: false })), 1600);
  };

  const doneCount = secondaryLanguages.filter(l => !!getTranslation(l.key)).length;

  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>Translations</div>
          <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5 }}>Edit translations directly, revise with an instruction, or retranslate from source.</div>
        </div>
        <Pill active={doneCount === secondaryLanguages.length && secondaryLanguages.length > 0}>
          {doneCount} / {secondaryLanguages.length}
        </Pill>
      </div>

      {!enScript ? (
        <div style={{ padding: "10px 12px", borderRadius: 7, background: "var(--fill2)", border: "0.5px solid var(--border)", color: "var(--t3)", fontSize: 12 }}>
          Generate the primary script first, then come back to translate.
        </div>
      ) : (
        <>
          {/* EN source reference */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Source — EN</div>
            <div style={{ padding: "10px 14px", borderRadius: 7, background: "var(--fill)", border: "0.5px solid var(--border)", fontSize: 12, lineHeight: 1.75, color: "var(--t3)", whiteSpace: "pre-wrap", maxHeight: 90, overflowY: "auto" }}>
              {enScript}
            </div>
          </div>

          {secondaryLanguages.some(l => !getTranslation(l.key)) && (
            <div style={{ marginBottom: 14 }}>
              <button onClick={translateMissing} style={buttonStyle("secondary", { padding: "7px 12px" })}>
                <Wand2 size={12} /> Translate all missing
              </button>
            </div>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            {secondaryLanguages.map(lang => {
              const text      = getTranslation(lang.key);
              const savedText = localLangs[story.id]?.[lang.key] ?? getStoryScript(story, lang.key) ?? "";
              const isDirty   = (lang.key in localEdits) && localEdits[lang.key] !== savedText;
              const isBusy    = !!loading[lang.key];
              const instr     = instructions[lang.key] || "";
              const err       = errors[lang.key];

              return (
                <div key={lang.key} style={{ borderRadius: 8, border: `0.5px solid ${isDirty ? "var(--gold)" : "var(--border)"}`, overflow: "hidden" }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", background: "var(--fill)", borderBottom: "0.5px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)" }}>{lang.label}</span>
                      {isDirty  && <span style={{ fontSize: 10, color: "var(--gold)" }}>edited</span>}
                      {isBusy   && <span style={{ fontSize: 10, color: "var(--t3)" }}>{loading[lang.key]}…</span>}
                      {!text && !isBusy && <span style={{ fontSize: 10, color: "var(--t4)" }}>not translated</span>}
                      {text && !isDirty && !isBusy && wc(text) > 0 && <span style={{ fontSize: 10, color: "var(--t4)", fontFamily: "var(--font-mono)" }}>{wc(text)}w</span>}
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {text && (
                        <button onClick={() => copyText(lang.key)} style={buttonStyle("ghost", { padding: "3px 8px", fontSize: 10 })}>
                          <Copy size={10} /> {copied[lang.key] ? "Copied" : "Copy"}
                        </button>
                      )}
                      <button onClick={() => retranslate(lang.key)} disabled={isBusy} style={buttonStyle("ghost", { padding: "3px 8px", fontSize: 10 })}>
                        <RefreshCw size={10} className={loading[lang.key] === "translating" ? "spin" : ""} />
                        {text ? "Retranslate" : "Translate"}
                      </button>
                    </div>
                  </div>

                  {/* Editable textarea */}
                  <div style={{ padding: "10px 12px", background: "var(--bg2)" }}>
                    <textarea
                      className="type-script"
                      value={text}
                      onChange={e => setLocalEdits(p => ({ ...p, [lang.key]: e.target.value }))}
                      placeholder={`${lang.label} translation…`}
                      rows={6}
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: 6,
                        background: "var(--bg)", border: "0.5px solid transparent",
                        color: "var(--t2)", fontSize: 13, lineHeight: 1.75,
                        fontFamily: "inherit", resize: "vertical", outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  {/* Revision row */}
                  <div style={{ padding: "7px 12px", background: "var(--fill)", borderTop: "0.5px solid var(--border)", display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={instr}
                        onChange={e => setInstructions(p => ({ ...p, [lang.key]: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter" && instr.trim() && text && !isBusy) revise(lang.key); }}
                        placeholder="Revision instruction — e.g. more formal, shorten, fix rhythm…"
                        style={{
                          flex: 1, padding: "5px 9px", borderRadius: 6,
                          border: "0.5px solid var(--border-in)", background: "var(--bg)",
                          color: "var(--t1)", fontSize: 11, outline: "none", fontFamily: "inherit",
                        }}
                      />
                      <button onClick={() => revise(lang.key)} disabled={!instr.trim() || !text || isBusy}
                        style={buttonStyle("secondary", { padding: "5px 10px", fontSize: 11, flexShrink: 0 })}>
                        <Wand2 size={11} /> Revise
                      </button>
                      {isDirty && (
                        <button onClick={() => saveEdits(lang.key)} disabled={isBusy}
                          style={buttonStyle("primary", { padding: "5px 10px", fontSize: 11, flexShrink: 0 })}>
                          <Check size={11} /> Save
                        </button>
                      )}
                    </div>
                    {err && <div style={{ fontSize: 11, color: "var(--error)", padding: "4px 8px", borderRadius: 5, background: "var(--error-bg)", border: "0.5px solid var(--error-border)" }}>{err}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}

export default function CreateView({ stories, onUpdate, mode, onModeChange, tenant, settings }) {
  const brandProfileId = tenant?.brand_profile_id || DEFAULT_BRAND_PROFILE_ID;
  const workspaceId = tenant?.workspace_id;
  const [selectedId, setSelectedId] = usePersistentState("create_selected_story", null);
  const [activeStep, setActiveStep] = usePersistentState("create_active_step", stepForMode(mode, "script"));
  const [queueFilter, setQueueFilter] = usePersistentState("create_queue_filter", "all");
  const [localLangs, setLocalLangs] = useState({});
  const [streaming, setStreaming] = useState({});
  const [showLibrary, setShowLibrary] = useState(false);
  const [autoTriggerVisual, setAutoTriggerVisual] = useState(false);

  const queue = useMemo(() => (stories || []).filter(story =>
    ["approved", "scripted", "produced"].includes(story.status) || isInProductionQueue(story)
  ), [stories]);

  const filteredQueue = useMemo(() => queue.filter(story => queueFilterMatch(story, queueFilter, settings)), [queue, queueFilter, settings]);
  const selected = queue.find(story => story.id === selectedId) || filteredQueue[0] || queue[0] || null;
  const selectedSteps = useMemo(() => stepsForStory(selected, settings), [selected, settings]);
  const selectedProgress = useMemo(() => createProgress(selected, settings), [selected, settings]);

  const steps = useMemo(() => selectedSteps.map(step => ({
    ...step,
    done: step.key === "review" ? selectedProgress.done >= selectedProgress.total : stepDone(selected, step, settings),
  })), [selectedSteps, selected, settings, selectedProgress]);

  useEffect(() => {
    if (!selectedId && queue.length) setSelectedId(queue[0].id);
    if (selectedId && !queue.find(story => story.id === selectedId) && queue.length) setSelectedId(queue[0].id);
  }, [queue, selectedId, setSelectedId]);

  useEffect(() => {
    setActiveStep(current => stepForMode(mode, current, steps));
  }, [mode, setActiveStep, steps]);

  useEffect(() => {
    if (steps.length && !steps.some(step => step.key === activeStep)) setActiveStep(steps[0].key);
  }, [activeStep, steps, setActiveStep]);

  useEffect(() => {
    const current = steps.find(step => step.key === activeStep);
    if (current?.mode && current.mode !== mode) onModeChange?.(current.mode);
  }, [activeStep, mode, onModeChange, steps]);

  useEffect(() => {
    const handler = (e) => {
      if (shouldIgnoreFromInput()) return;
      if (!selected) return;

      if (matches(e, SHORTCUTS.createModePrev.combo) || matches(e, SHORTCUTS.createModeNext.combo)) {
        e.preventDefault();
        const idx = Math.max(0, steps.findIndex(step => step.key === activeStep));
        const next = matches(e, SHORTCUTS.createModeNext.combo)
          ? Math.min(idx + 1, steps.length - 1)
          : Math.max(idx - 1, 0);
        setActiveStep(steps[next].key);
        return;
      }

      if (matches(e, SHORTCUTS.productionDown.combo) || matches(e, SHORTCUTS.productionUp.combo)) {
        e.preventDefault();
        const idx = filteredQueue.findIndex(story => story.id === selected.id);
        const safe = idx === -1 ? 0 : idx;
        const next = e.key === "ArrowDown"
          ? Math.min(safe + 1, filteredQueue.length - 1)
          : Math.max(safe - 1, 0);
        if (filteredQueue[next]) setSelectedId(filteredQueue[next].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeStep, filteredQueue, selected, setActiveStep, setSelectedId, steps]);

  const filterOptions = [
    { key: "all", label: "All", count: queue.length },
    { key: "needs_script", label: "Needs script", count: queue.filter(story => queueFilterMatch(story, "needs_script", settings)).length },
    { key: "needs_translation", label: "Needs translation", count: queue.filter(story => queueFilterMatch(story, "needs_translation", settings)).length },
    { key: "needs_brief", label: "Needs brief", count: queue.filter(story => queueFilterMatch(story, "needs_brief", settings)).length },
    { key: "needs_visuals", label: "Needs visuals", count: queue.filter(story => queueFilterMatch(story, "needs_visuals", settings)).length },
    { key: "needs_voice", label: "Needs voice", count: queue.filter(story => queueFilterMatch(story, "needs_voice", settings)).length },
    { key: "ready_review", label: "Ready review", count: queue.filter(story => queueFilterMatch(story, "ready_review", settings)).length },
  ];

  const saveProductionUpdate = (updates) => selected && onUpdate?.(selected.id, updates || {});

  const handleBriefApproved = useCallback(() => {
    if (selectedSteps.some(s => s.key === "visuals")) {
      setActiveStep("visuals");
      setAutoTriggerVisual(true);
    }
  }, [selectedSteps, setActiveStep]);

  // Re-run the quality gate after any script or translation save
  const rerunGate = useCallback(async (storyId, patch) => {
    const base = stories.find(s => s.id === storyId);
    if (!base) return;
    const updated = { ...base, ...patch };
    const gate = auditStoryQuality(updated, stories, settings);
    await onUpdate(storyId, qualityGatePatch(gate));
  }, [stories, settings, onUpdate]);

  return (
    <div className="animate-fade-in">
      <AssetLibraryModal isOpen={showLibrary} onClose={() => setShowLibrary(false)} brandProfileId={brandProfileId} workspaceId={workspaceId} />
      <PageHeader
        title="Create"
        description="One selected content item moves through the workflow defined by its template."
        meta={selected ? `${selectedProgress.done}/${selectedProgress.total} complete` : `${queue.length} items`}
        action={
          <button onClick={() => setShowLibrary(true)} style={buttonStyle("secondary", { padding: "5px 12px" })}>
            <Library size={12} /> Asset library
          </button>
        }
      />

      {queue.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--t4)" }}>
          <FileText size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.25 }} />
          <div style={{ fontSize: 13 }}>Approve content to start creating.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
          <Panel style={{ padding: 8, position: "sticky", top: 16 }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {filterOptions.map(option => (
                <button key={option.key} onClick={() => setQueueFilter(option.key)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
                  <Pill active={queueFilter === option.key}>{option.label} · {option.count}</Pill>
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gap: 5 }}>
              {filteredQueue.length ? filteredQueue.map(story => {
                const isSelected = selected?.id === story.id;
                const progress = createProgress(story, settings);
                const ac = programmeColor(story, settings);
                return (
                  <button key={story.id} onClick={() => setSelectedId(story.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid transparent",
                      borderLeft: `3px solid ${ac}`,
                      background: isSelected ? "var(--bg)" : "transparent",
                      boxShadow: isSelected ? "var(--shadow-sm)" : "none",
                      cursor: "pointer",
                    }}>
                    <div style={{ fontSize: 13, fontWeight: isSelected ? 700 : 600, color: "var(--t1)", lineHeight: 1.3, marginBottom: 5 }}>{story.title || "(untitled)"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--t3)", fontSize: 11, marginBottom: 8, flexWrap: "wrap" }}>
                      <span>{getContentTypeLabel(story, settings)}</span>
                      {story.archetype && <><span style={{ color: "var(--t4)" }}>·</span><span>{story.archetype}</span></>}
                      {story.era && <><span style={{ color: "var(--t4)" }}>·</span><span>{story.era}</span></>}
                      <span style={{ color: "var(--t4)" }}>·</span>
                      <span>{nextAction(story, settings)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 999, overflow: "hidden", background: "var(--bg3)" }}>
                        <div style={{ width: `${progress.percent}%`, height: "100%", background: progress.done >= 5 ? "var(--success)" : "var(--t2)" }} />
                      </div>
                      <span style={{ fontSize: 10, color: progress.done >= 5 ? "var(--success)" : "var(--t3)", fontFamily: "var(--font-mono)" }}>{progress.done}/{progress.total}</span>
                    </div>
                  </button>
                );
              }) : (
                <div style={{ padding: "28px 8px", textAlign: "center", color: "var(--t4)", fontSize: 12 }}>No content matches this filter.</div>
              )}
            </div>
          </Panel>

          <div style={{ minWidth: 0 }}>
            {selected && (
              <Panel style={{ padding: "18px 20px" }}>
                <div style={{ paddingBottom: 14, borderBottom: "0.5px solid var(--border)", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--t1)", lineHeight: 1.25 }}>{selected.title}</div>
                      <div style={{ display: "flex", gap: 9, marginTop: 6, fontSize: 11, color: "var(--t3)", fontFamily: "var(--font-mono)", flexWrap: "wrap" }}>
                        <span>{getContentTypeLabel(selected, settings)}</span><span>·</span><span>{selected.format || "standard"}</span><span>·</span><span>{selected.archetype || "—"}</span>
                        {selected.reach_score != null && <><span>·</span><span>reach {selected.reach_score}</span></>}
                        {selected.status && <><span>·</span><span>{selected.status}</span></>}
                      </div>
                    </div>
                    <Pill active>{nextAction(selected, settings)}</Pill>
                  </div>
                  <div style={{ height: 4, borderRadius: 999, background: "var(--bg3)", overflow: "hidden", margin: "12px 0" }}>
                    <div style={{ width: `${selectedProgress.percent}%`, height: "100%", background: selectedProgress.done >= selectedProgress.total ? "var(--success)" : "var(--t2)" }} />
                  </div>
                  <TemplateStrip story={selected} settings={settings} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 6 }}>
                    {steps.map(step => {
                      const Icon = step.icon;
                      const active = activeStep === step.key;
                      return (
                        <button key={step.key} onClick={() => setActiveStep(step.key)}
                          style={buttonStyle(active ? "primary" : "ghost", {
                            justifyContent: "flex-start",
                            padding: "7px 10px",
                            border: active ? "0.5px solid var(--t1)" : "0.5px solid var(--border)",
                          })}>
                          <Icon size={12} />
                          <span>{step.label}</span>
                          {step.done && <Check size={11} style={{ marginLeft: "auto" }} />}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 10, color: "var(--t4)", fontSize: 10, flexWrap: "wrap" }}>
                    <span>Same content item, same workspace. Step through the whole creation chain without changing tabs.</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{renderCombo(SHORTCUTS.createModePrev.combo)} / {renderCombo(SHORTCUTS.createModeNext.combo)} steps · {renderCombo(SHORTCUTS.productionUp.combo)} / {renderCombo(SHORTCUTS.productionDown.combo)} items</span>
                  </div>
                </div>

                {["brief", "assets", "voice", "visuals", "assembly"].includes(activeStep) && <ReadinessStrip story={selected} />}
                {activeStep === "script" && <ScriptWorkspace story={selected} onUpdate={onUpdate} onSaved={rerunGate} localLangs={localLangs} setLocalLangs={setLocalLangs} streaming={streaming} setStreaming={setStreaming} settings={settings} stepLabel={steps.find(step => step.key === "script")?.label || "Script"} />}
                {activeStep === "translations" && <TranslationWorkspace story={selected} onUpdate={onUpdate} onSaved={rerunGate} localLangs={localLangs} setLocalLangs={setLocalLangs} settings={settings} />}
                {activeStep === "brief" && <BriefSection story={selected} brand_profile_id={brandProfileId} onSaved={saveProductionUpdate} onApproved={handleBriefApproved} />}
                {activeStep === "assets" && <AssetMatchesSection story={selected} brand_profile_id={brandProfileId} />}
                {activeStep === "voice" && <VoiceSection story={selected} brand_profile_id={brandProfileId} languages={getBrandLanguages(settings)} onSaved={saveProductionUpdate} />}
                {activeStep === "visuals" && <VisualSection story={selected} brand_profile_id={brandProfileId} onSaved={saveProductionUpdate} autoStart={autoTriggerVisual} onAutoStartConsumed={() => setAutoTriggerVisual(false)} />}
                {activeStep === "assembly" && <AssemblySection story={selected} brand_profile_id={brandProfileId} onSaved={saveProductionUpdate} />}
                {steps.find(step => step.key === activeStep)?.custom && (
                  <TemplateTaskSection story={selected} step={steps.find(step => step.key === activeStep)} onUpdate={onUpdate} />
                )}
                {activeStep === "review" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <Panel style={{ background: "var(--card)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 8 }}>Template review</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                        {selectedProgress.checks.map(check => (
                          <div key={check.key} style={{ padding: "10px 12px", borderRadius: 8, background: check.done ? "var(--success-bg)" : "var(--fill2)", border: "0.5px solid var(--border)" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: check.done ? "var(--success)" : "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{check.label}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: check.done ? "var(--success)" : "var(--t3)" }}>{check.done ? "Ready" : "Open"}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 12, fontSize: 12, color: "var(--t3)", lineHeight: 1.5 }}>
                        Review is now based on the selected template workflow, so non-video deliverables only need the steps that template asks for.
                      </div>
                    </Panel>
                  </div>
                )}
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
