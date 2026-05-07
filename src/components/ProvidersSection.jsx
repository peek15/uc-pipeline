"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Loader2, Plus, X, Eye, EyeOff, RefreshCw, Download } from "lucide-react";
import { usePersistentState } from "@/lib/usePersistentState";
import { loadProviderConfig, saveProviderConfig, testProviderConnection } from "@/lib/providers/config-loader";
import { DEFAULT_BRAND_PROFILE_ID } from "@/lib/brand";
import { getAiCalls } from "@/lib/ai/audit";
import { formatCost } from "@/lib/ai/costs";

const UNCLE_CARTER_PROFILE_ID = DEFAULT_BRAND_PROFILE_ID;

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(row => headers.map(h => csvEscape(row[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Constants ───────────────────────────────────────────

const VOICE_PROVIDERS = [
  { key: "stub",       label: "Stub (no provider)" },
  { key: "elevenlabs", label: "ElevenLabs" },
  { key: "playht",     label: "PlayHT" },
];

const STORAGE_PROVIDERS = [
  { key: "supabase_storage", label: "Supabase Storage" },
  { key: "s3",               label: "AWS S3" },
  { key: "gcs",              label: "Google Cloud Storage" },
  { key: "stub",             label: "Stub (in-memory only)" },
];

const ATMOSPHERIC_PROVIDERS = [
  { key: "flux",       label: "Flux (Replicate)" },
  { key: "midjourney", label: "MidJourney (PiAPI)" },
  { key: "dalle",      label: "DALL-E 3 (OpenAI)" },
  { key: "stub",       label: "Stub" },
];

const LICENSED_PROVIDERS = [
  { key: "pexels",       label: "Pexels (free)" },
  { key: "shutterstock", label: "Shutterstock" },
  { key: "stub",         label: "Stub" },
];

const LLM_OPENAI_PROVIDERS    = [{ key: "openai",    label: "OpenAI" }];
const LLM_ANTHROPIC_PROVIDERS = [{ key: "anthropic", label: "Anthropic" }];

const LANG_OPTIONS = [
  { key: "en", label: "English" },
  { key: "fr", label: "French" },
  { key: "es", label: "Spanish" },
  { key: "pt", label: "Portuguese" },
  { key: "de", label: "German" },
  { key: "it", label: "Italian" },
  { key: "ja", label: "Japanese" },
  { key: "zh", label: "Chinese" },
];

// ─── Shared styles ────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "8px 12px", borderRadius: 7, fontSize: 13,
  background: "var(--fill2)", border: "1px solid var(--border-in)",
  color: "var(--t1)", outline: "none", fontFamily: "inherit",
};
const btnPrimary = {
  padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
  background: "var(--t1)", color: "var(--bg)", border: "none",
  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
};
const btnSecondary = {
  padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500,
  background: "var(--fill2)", color: "var(--t1)",
  border: "1px solid var(--border)", cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};
const btnGhost = {
  padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 500,
  background: "transparent", color: "var(--t3)",
  border: "1px solid var(--border)", cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};
const labelStyle = {
  fontSize: 10, fontWeight: 600, color: "var(--t3)",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
};

// ─── Slider ──────────────────────────────────────────────

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, hint }) {
  return (
    <div>
      <div style={{ ...labelStyle, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>{label}</span>
        {hint && <span style={{ fontSize: 9, fontWeight: 400, color: "var(--t4)", textTransform: "none", letterSpacing: 0 }}>{hint}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, height: 3, background: "var(--border)", borderRadius: 999, appearance: "none", outline: "none", accentColor: "var(--t1)" }} />
        <input type="number" min={min} max={max} step={step} value={value}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v))); }}
          style={{ ...inputStyle, width: 70, padding: "5px 8px", textAlign: "right", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 12 }} />
      </div>
    </div>
  );
}

// ─── Secret input ─────────────────────────────────────────

function SecretInput({ label, value, onChange, isSet, placeholder }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div>
      <div style={{ ...labelStyle, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>{label}</span>
        {isSet && !value && <span style={{ fontSize: 9, fontWeight: 500, color: "#4A9B7F", textTransform: "none", letterSpacing: 0 }}>✓ Saved — leave empty to keep</span>}
      </div>
      <div style={{ position: "relative" }}>
        <input type={reveal ? "text" : "password"} value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSet ? "•••••••• (saved — leave empty to keep)" : (placeholder || "")}
          style={{ ...inputStyle, paddingRight: 40, fontFamily: reveal ? "ui-monospace,'SF Mono',Menlo,monospace" : "inherit" }}
          autoComplete="off" />
        <button type="button" onClick={() => setReveal(r => !r)}
          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            background: "transparent", border: "none", cursor: "pointer", padding: 4,
            color: "var(--t3)", display: "flex", alignItems: "center" }}
          tabIndex={-1}>
          {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─── Status pill ─────────────────────────────────────────

function pillStyle(kind) {
  const base = { fontSize: 10, fontWeight: 600, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
    padding: "3px 9px", borderRadius: 4, border: "0.5px solid var(--border)",
    display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };
  if (kind === "success") return { ...base, background: "rgba(74,155,127,0.12)", color: "#4A9B7F", borderColor: "rgba(74,155,127,0.3)" };
  if (kind === "fail")    return { ...base, background: "rgba(192,102,106,0.12)", color: "#C0666A", borderColor: "rgba(192,102,106,0.3)" };
  return { ...base, background: "var(--fill)", color: "var(--t3)" };
}

function StatusPill({ status }) {
  if (status === "success") return <span style={pillStyle("success")}><CheckCircle2 size={11} /> Connected</span>;
  if (status === "fail")    return <span style={pillStyle("fail")}><AlertCircle size={11} /> Failed</span>;
  if (status === "untested") return <span style={pillStyle("default")}>Not tested</span>;
  return <span style={pillStyle("default")}>Not configured</span>;
}

// ─── Provider card ───────────────────────────────────────

function ProviderCard({ id, title, description, defaultExpanded = false, status, children }) {
  const [expanded, setExpanded] = usePersistentState(`providers_card_${id}_open`, defaultExpanded);
  return (
    <div style={{ background: "var(--bg)", border: "0.5px solid var(--border)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
      <button onClick={() => setExpanded(!expanded)}
        style={{ width: "100%", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          {expanded ? <ChevronDown size={14} style={{ color: "var(--t3)", flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: "var(--t3)", flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{title}</div>
            {description && <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2, lineHeight: 1.4 }}>{description}</div>}
          </div>
        </div>
        <StatusPill status={status} />
      </button>
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "0.5px solid var(--border)", paddingTop: 14 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Generic provider form factory ───────────────────────
// Avoids 4 nearly-identical components

function ProviderForm({ brandId, providerType, providers, initial, onSaved, renderFields }) {
  const [providerName, setProviderName] = useState(initial?.provider_name || providers[0]?.key);
  const [config, setConfig]             = useState(initial?.config || {});
  const [secrets, setSecrets]           = useState({});
  const [isSet, setIsSet]               = useState({});
  const [saving, setSaving]             = useState(false);
  const [testing, setTesting]           = useState(false);
  const [testResult, setTestResult]     = useState(null);
  const [error, setError]               = useState(null);
  const [savedFlash, setSavedFlash]     = useState(false);

  useEffect(() => {
    setProviderName(initial?.provider_name || providers[0]?.key);
    setConfig(initial?.config || {});
    setSecrets({});
    // Build isSet from initial's has_<field> flags
    const flags = {};
    Object.keys(initial || {}).forEach(k => {
      if (k.startsWith("has_") && initial[k]) flags[k.replace("has_", "")] = true;
    });
    setIsSet(flags);
    setTestResult(initial?.last_test_ok != null ? {
      ok: initial.last_test_ok, error: initial.last_test_error, at: initial.last_test_at,
    } : null);
  }, [initial, providers]);

  const updateConfig = (patch) => setConfig({ ...config, ...patch });
  const updateSecret = (k, v) => setSecrets(s => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const secretsPayload = {};
      Object.entries(secrets).forEach(([k, v]) => { if (v) secretsPayload[k] = v; });

      const payload = providerName === "stub" || providerName === "supabase_storage"
        ? { secrets: {}, config }
        : { secrets: secretsPayload, config };

      await saveProviderConfig({
        brand_id: brandId,
        provider_type: providerType,
        provider_name: providerName,
        ...payload,
      });

      Object.keys(secrets).forEach(k => { if (secrets[k]) setIsSet(s => ({ ...s, [k]: true })); });
      setSecrets({});
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
      onSaved?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally    { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setError(null);
    try {
      const result = await testProviderConnection(brandId, providerType);
      setTestResult({ ok: result.ok, error: result.error, latency_ms: result.latency_ms, at: new Date().toISOString() });
    } catch (e) { setError(e?.message || String(e)); }
    finally    { setTesting(false); }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <div style={labelStyle}>Provider</div>
        <select value={providerName} onChange={(e) => { setProviderName(e.target.value); setSecrets({}); }} style={inputStyle}>
          {providers.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      {renderFields({ providerName, config, updateConfig, secrets, updateSecret, isSet })}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
        <button onClick={save} disabled={saving} style={btnPrimary}>
          {saving ? <Loader2 size={12} className="spin" /> : null}
          {saving ? "Saving…" : savedFlash ? "Saved ✓" : "Save"}
        </button>
        {providerName !== "stub" && (
          <button onClick={test} disabled={testing} style={btnSecondary}>
            {testing ? <Loader2 size={12} className="spin" /> : null}
            {testing ? "Testing…" : "Test connection"}
          </button>
        )}
      </div>

      {testResult && (
        <div style={{ fontSize: 11, padding: "8px 12px", borderRadius: 6,
          background: testResult.ok ? "rgba(74,155,127,0.08)" : "rgba(192,102,106,0.08)",
          border: `0.5px solid ${testResult.ok ? "rgba(74,155,127,0.3)" : "rgba(192,102,106,0.3)"}`,
          color: testResult.ok ? "#4A9B7F" : "#C0666A",
          display: "flex", alignItems: "flex-start", gap: 6 }}>
          {testResult.ok ? <CheckCircle2 size={12} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />}
          <div>
            <div style={{ fontWeight: 600 }}>
              {testResult.ok ? "Connection OK" : "Connection failed"}
              {testResult.latency_ms != null && testResult.ok && <span style={{ fontWeight: 400, marginLeft: 6, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>({testResult.latency_ms}ms)</span>}
            </div>
            {testResult.error && <div style={{ marginTop: 2, color: "var(--t2)" }}>{testResult.error}</div>}
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: "#C0666A", padding: "8px 12px", borderRadius: 6,
          background: "rgba(192,102,106,0.08)", border: "0.5px solid rgba(192,102,106,0.3)",
          display: "flex", gap: 6, alignItems: "flex-start" }}>
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ─── LLM fields ──────────────────────────────────────────

function LLMOpenAIFields({ secrets, updateSecret, isSet }) {
  return (
    <>
      <SecretInput label="OpenAI API key" value={secrets.api_key || ""} onChange={(v) => updateSecret("api_key", v)} isSet={isSet.api_key} placeholder="sk-..." />
      <div style={{ fontSize: 11, color: "var(--t3)" }}>Used for GPT-4o and GPT-4o mini in the agent panel. Get your key at platform.openai.com.</div>
    </>
  );
}

function LLMAnthropicFields({ secrets, updateSecret, isSet }) {
  return (
    <>
      <SecretInput label="Anthropic API key (override)" value={secrets.api_key || ""} onChange={(v) => updateSecret("api_key", v)} isSet={isSet.api_key} placeholder="sk-ant-..." />
      <div style={{ fontSize: 11, color: "var(--t3)" }}>Optional. Leave empty to use the server's environment key. Set this to use a per-tenant key instead.</div>
    </>
  );
}

// ─── Voice fields ────────────────────────────────────────

function VoiceFields({ providerName, config, updateConfig, secrets, updateSecret, isSet }) {
  const voices = Array.isArray(config.voices) ? config.voices : [];

  const updateVoice = (i, patch) => {
    const next = voices.map((v, idx) => idx === i ? { ...v, ...patch } : v);
    updateConfig({ voices: next });
  };
  const addVoice = () => {
    const used = new Set(voices.map(v => v.lang));
    const next_lang = LANG_OPTIONS.find(o => !used.has(o.key))?.key || "en";
    updateConfig({ voices: [...voices, { lang: next_lang, voice_id: "" }] });
  };
  const removeVoice = (i) => updateConfig({ voices: voices.filter((_, idx) => idx !== i) });

  if (providerName === "stub") return <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Stub provider: no real audio is generated.</div>;

  return (
    <>
      <SecretInput label="API key" value={secrets.api_key || ""} onChange={(v) => updateSecret("api_key", v)} isSet={isSet.api_key} placeholder={providerName === "elevenlabs" ? "sk_..." : "your API key"} />

      {providerName === "playht" && (
        <SecretInput label="User ID" value={secrets.user_id || ""} onChange={(v) => updateSecret("user_id", v)} isSet={isSet.user_id} placeholder="your PlayHT user ID" />
      )}

      <div>
        <div style={{ ...labelStyle, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span>Voices per language</span>
          <span style={{ fontSize: 9, fontWeight: 400, color: "var(--t4)", textTransform: "none", letterSpacing: 0 }}>Paste voice IDs from your provider dashboard</span>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {voices.length === 0 && <div style={{ fontSize: 11, color: "var(--t4)", fontStyle: "italic", padding: "6px 0" }}>No voices configured yet — add one below</div>}
          {voices.map((v, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 6, alignItems: "center" }}>
              <select value={v.lang} onChange={(e) => updateVoice(i, { lang: e.target.value })} style={inputStyle}>
                {LANG_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <input type="text" value={v.voice_id} onChange={(e) => updateVoice(i, { voice_id: e.target.value })} placeholder="voice ID"
                style={{ ...inputStyle, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }} />
              <button onClick={() => removeVoice(i)} style={{ ...btnGhost, padding: "0 10px" }}><X size={12} /></button>
            </div>
          ))}
          <button onClick={addVoice} style={{ ...btnGhost, fontSize: 11, padding: "5px 10px", justifySelf: "start", marginTop: 4 }}>
            <Plus size={12} /> Add voice
          </button>
        </div>
      </div>

      {providerName === "elevenlabs" && (
        <>
          <Slider label="Stability"        value={config.stability        ?? 0.5}  onChange={(v) => updateConfig({ stability: v })}        hint="Higher = more consistent" />
          <Slider label="Similarity boost" value={config.similarity_boost ?? 0.75} onChange={(v) => updateConfig({ similarity_boost: v })} hint="How closely the voice matches the original sample" />
          <Slider label="Style"            value={config.style            ?? 0}    onChange={(v) => updateConfig({ style: v })}            hint="Stylization vs neutrality" />
        </>
      )}
    </>
  );
}

// ─── Storage fields ──────────────────────────────────────

function StorageFields({ providerName, config, updateConfig, secrets, updateSecret, isSet }) {
  if (providerName === "stub") return <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Stub: in-memory only. Lost on refresh.</div>;
  if (providerName === "supabase_storage") return (
    <>
      <div style={{ fontSize: 11, color: "var(--t3)" }}>Uses your existing Supabase project. No API keys needed.</div>
      <div>
        <div style={labelStyle}>Bucket name</div>
        <input type="text" value={config.bucket || ""} onChange={(e) => updateConfig({ bucket: e.target.value })}
          placeholder="uc-assets" style={{ ...inputStyle, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }} />
      </div>
    </>
  );
  if (providerName === "s3") return (
    <>
      <SecretInput label="Access key ID"     value={secrets.access_key_id     || ""} onChange={(v) => updateSecret("access_key_id", v)} isSet={isSet.access_key_id} placeholder="AKIA..." />
      <SecretInput label="Secret access key" value={secrets.secret_access_key || ""} onChange={(v) => updateSecret("secret_access_key", v)} isSet={isSet.secret_access_key} />
      <div><div style={labelStyle}>Region</div><input type="text" value={config.region || ""} onChange={(e) => updateConfig({ region: e.target.value })} placeholder="us-east-1" style={inputStyle} /></div>
      <div><div style={labelStyle}>Bucket name</div><input type="text" value={config.bucket || ""} onChange={(e) => updateConfig({ bucket: e.target.value })} placeholder="my-bucket" style={{ ...inputStyle, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }} /></div>
    </>
  );
  if (providerName === "gcs") return (
    <>
      <SecretInput label="Service account JSON" value={secrets.service_account_json || ""} onChange={(v) => updateSecret("service_account_json", v)} isSet={isSet.service_account_json} placeholder='{"type":"service_account",...}' />
      <div><div style={labelStyle}>Bucket name</div><input type="text" value={config.bucket || ""} onChange={(e) => updateConfig({ bucket: e.target.value })} placeholder="my-gcs-bucket" style={{ ...inputStyle, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }} /></div>
    </>
  );
  return null;
}

// ─── Atmospheric (Flux/MJ/DALL-E) fields ──────────────────

function AtmosphericFields({ providerName, config, updateConfig, secrets, updateSecret, isSet }) {
  if (providerName === "stub") return <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Stub: returns placeholder images.</div>;
  if (providerName === "flux") return (
    <>
      <SecretInput label="Replicate API token" value={secrets.api_token || ""} onChange={(v) => updateSecret("api_token", v)} isSet={isSet.api_token} placeholder="r8_..." />
      <div>
        <div style={labelStyle}>Model</div>
        <select value={config.model_id || "black-forest-labs/flux-1.1-pro"} onChange={(e) => updateConfig({ model_id: e.target.value })} style={inputStyle}>
          <option value="black-forest-labs/flux-1.1-pro">Flux 1.1 Pro (~$0.04/img)</option>
          <option value="black-forest-labs/flux-1.1-pro-ultra">Flux 1.1 Pro Ultra (~$0.06/img)</option>
          <option value="black-forest-labs/flux-pro">Flux Pro (~$0.055/img)</option>
          <option value="black-forest-labs/flux-schnell">Flux Schnell (~$0.003/img)</option>
        </select>
      </div>
      <Slider label="Quality" value={config.quality ?? 90} onChange={(v) => updateConfig({ quality: Math.round(v) })} min={50} max={100} step={1} hint="PNG output quality 50-100" />
    </>
  );
  if (providerName === "midjourney") return (
    <>
      <SecretInput label="PiAPI key" value={secrets.api_key || ""} onChange={(v) => updateSecret("api_key", v)} isSet={isSet.api_key} placeholder="your PiAPI key" />
      <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>MidJourney via PiAPI — implementation deferred. Use Flux for v3.11.0.</div>
    </>
  );
  if (providerName === "dalle") return (
    <>
      <SecretInput label="OpenAI API key" value={secrets.api_key || ""} onChange={(v) => updateSecret("api_key", v)} isSet={isSet.api_key} placeholder="sk-..." />
      <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>DALL-E 3 implementation deferred. Use Flux for v3.11.0.</div>
    </>
  );
  return null;
}

// ─── Licensed (Pexels/Shutterstock) fields ───────────────

function LicensedFields({ providerName, config, updateConfig, secrets, updateSecret, isSet }) {
  if (providerName === "stub") return <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Stub: returns placeholder images.</div>;
  if (providerName === "pexels") return (
    <>
      <SecretInput label="Pexels API key" value={secrets.api_key || ""} onChange={(v) => updateSecret("api_key", v)} isSet={isSet.api_key} placeholder="your Pexels API key" />
      <div style={{ fontSize: 11, color: "var(--t3)" }}>Free tier: 200 requests/hour, 20,000/month. Sign up at pexels.com/api.</div>
    </>
  );
  if (providerName === "shutterstock") return (
    <>
      <SecretInput label="Shutterstock API key"    value={secrets.api_key    || ""} onChange={(v) => updateSecret("api_key", v)}    isSet={isSet.api_key} />
      <SecretInput label="Shutterstock API secret" value={secrets.api_secret || ""} onChange={(v) => updateSecret("api_secret", v)} isSet={isSet.api_secret} />
      <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Shutterstock not implemented in v3.11.0.</div>
    </>
  );
  return null;
}

function providerRows(configs) {
  return [
    { type: "llm_openai",         label: "LLM — OpenAI",            config: configs.llm_openai },
    { type: "llm_anthropic",      label: "LLM — Anthropic override", config: configs.llm_anthropic },
    { type: "voice",              label: "Voice",                    config: configs.voice },
    { type: "visual_atmospheric", label: "Visual — atmospheric",     config: configs.visual_atmospheric },
    { type: "visual_licensed",    label: "Visual — licensed",        config: configs.visual_licensed },
    { type: "storage",            label: "Storage",                  config: configs.storage },
  ];
}

function callsForProvider(calls, cfg) {
  if (!cfg?.provider_name) return [];
  return calls.filter(call => call.provider_name === cfg.provider_name);
}

function summarizeCalls(calls) {
  return calls.reduce((acc, call) => {
    acc.calls += 1;
    acc.failed += call.success ? 0 : 1;
    acc.cost += Number(call.cost_estimate) || 0;
    acc.durationTotal += Number(call.duration_ms) || 0;
    if (call.duration_ms != null) acc.durationCount += 1;
    const created = call.created_at ? new Date(call.created_at).getTime() : 0;
    if (created > acc.lastAt) acc.lastAt = created;
    return acc;
  }, { calls: 0, failed: 0, cost: 0, durationTotal: 0, durationCount: 0, lastAt: 0 });
}

function healthState(cfg) {
  if (!cfg) return "missing";
  if (cfg.last_test_ok === true) return "ok";
  if (cfg.last_test_ok === false) return "error";
  return "unknown";
}

function healthColor(state) {
  if (state === "ok") return "var(--success)";
  if (state === "error") return "var(--error)";
  if (state === "missing") return "var(--t4)";
  return "var(--warning)";
}

function ProviderOverview({ configs, calls }) {
  const rows = providerRows(configs);
  const configured = rows.filter(r => r.config).length;
  const passing = rows.filter(r => r.config?.last_test_ok === true).length;
  const total = summarizeCalls(calls);
  const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const calls30 = calls.filter(call => call.created_at && new Date(call.created_at).getTime() >= since30);
  const total30 = summarizeCalls(calls30);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        {[
          ["Configured", `${configured}/${rows.length}`],
          ["Passing", `${passing}/${configured || rows.length}`],
          ["30d cost", formatCost(total30.cost)],
          ["30d calls", total30.calls.toLocaleString()],
          ["Failures", total.failed],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: "12px 14px", borderRadius: 9, background: "var(--bg)", border: "0.5px solid var(--border)" }}>
            <div style={labelStyle}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", color: "var(--t1)" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg)", border: "0.5px solid var(--border)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 0.8fr 0.7fr 0.7fr 0.8fr", gap: 10, paddingBottom: 8, borderBottom: "0.5px solid var(--border2)" }}>
          {["Provider", "Selected", "Health", "Calls", "Failures", "30d cost"].map(h => <div key={h} style={labelStyle}>{h}</div>)}
        </div>
        {rows.map(row => {
          const cfg = row.config;
          const state = healthState(cfg);
          const providerCalls = callsForProvider(calls30, cfg);
          const stats = summarizeCalls(providerCalls);
          return (
            <div key={row.type} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 0.8fr 0.7fr 0.7fr 0.8fr", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "0.5px solid var(--border2)", fontSize: 12 }}>
              <span style={{ color: "var(--t1)", fontWeight: 600 }}>{row.label}</span>
              <span style={{ color: cfg ? "var(--t2)" : "var(--t4)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cfg?.provider_name || "missing"}</span>
              <span style={{ color: healthColor(state), fontWeight: 600 }}>{state}</span>
              <span style={{ color: "var(--t2)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>{stats.calls}</span>
              <span style={{ color: stats.failed ? "var(--error)" : "var(--t3)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>{stats.failed}</span>
              <span style={{ color: "var(--t1)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>{formatCost(stats.cost)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniBarChart({ rows, valueKey = "cost", formatValue = v => v, empty = "No data yet." }) {
  const max = Math.max(...rows.map(row => Number(row[valueKey]) || 0), 0);
  if (!rows.length || max <= 0) return <div style={{ fontSize: 12, color: "var(--t4)" }}>{empty}</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map(row => {
        const value = Number(row[valueKey]) || 0;
        return (
          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr 64px", gap: 10, alignItems: "center", fontSize: 12 }}>
            <span style={{ color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
            <div style={{ height: 7, borderRadius: 99, background: "var(--fill2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(4, (value / max) * 100)}%`, borderRadius: 99, background: row.color || "var(--t1)" }} />
            </div>
            <span style={{ color: "var(--t1)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", textAlign: "right" }}>{formatValue(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function DailyCostChart({ calls }) {
  const now = new Date();
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);
    return { key, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), cost: 0, calls: 0 };
  });
  const byDay = new Map(days.map(day => [day.key, day]));
  for (const call of calls) {
    if (!call.created_at) continue;
    const key = new Date(call.created_at).toISOString().slice(0, 10);
    const day = byDay.get(key);
    if (!day) continue;
    day.cost += Number(call.cost_estimate) || 0;
    day.calls += 1;
  }
  const max = Math.max(...days.map(day => day.cost), 0);

  return (
    <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg)", border: "0.5px solid var(--border)" }}>
      <div style={{ ...labelStyle, marginBottom: 12 }}>Spend trend · 14 days</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 6, alignItems: "end", height: 118 }}>
        {days.map(day => (
          <div key={day.key} title={`${day.label}: ${formatCost(day.cost)} · ${day.calls} calls`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0 }}>
            <div style={{ width: "100%", height: 86, display: "flex", alignItems: "end" }}>
              <div style={{ width: "100%", minHeight: day.cost > 0 ? 5 : 1, height: max > 0 ? `${Math.max(3, (day.cost / max) * 86)}px` : 1, borderRadius: "4px 4px 1px 1px", background: day.cost > 0 ? "var(--t1)" : "var(--fill2)" }} />
            </div>
            <span style={{ fontSize: 9, color: "var(--t4)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", whiteSpace: "nowrap" }}>{day.label.split(" ")[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderHealth({ configs, onReload }) {
  const [testing, setTesting] = useState(null);
  const [testingAll, setTestingAll] = useState(false);
  const rows = providerRows(configs);
  const configured = rows.filter(r => r.config).length;
  const passing = rows.filter(r => r.config?.last_test_ok === true).length;
  const failing = rows.filter(r => r.config?.last_test_ok === false).length;

  const test = async (type) => {
    setTesting(type);
    try {
      await testProviderConnection(UNCLE_CARTER_PROFILE_ID, type);
      await onReload();
    } finally {
      setTesting(null);
    }
  };

  const testAll = async () => {
    setTestingAll(true);
    try {
      for (const row of rows.filter(r => r.config)) {
        setTesting(row.type);
        await testProviderConnection(UNCLE_CARTER_PROFILE_ID, row.type).catch(() => null);
      }
      await onReload();
    } finally {
      setTesting(null);
      setTestingAll(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 12, color: "var(--t3)" }}>
          {configured} configured · {passing} passing · {failing} failing
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={testAll} disabled={!configured || testingAll} style={btnPrimary}>
            {testingAll ? <Loader2 size={12} className="spin" /> : null}
            {testingAll ? "Testing all..." : "Run all checks"}
          </button>
          <button onClick={onReload} style={btnSecondary}><RefreshCw size={12}/> Refresh</button>
        </div>
      </div>
      {rows.map(row => {
        const cfg = row.config;
        const state = !cfg ? "missing" : cfg.last_test_ok === true ? "ok" : cfg.last_test_ok === false ? "error" : "unknown";
        const color = state === "ok" ? "var(--success)" : state === "error" ? "var(--error)" : state === "missing" ? "var(--t4)" : "var(--warning)";
        return (
          <div key={row.type} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 9, background: "var(--bg)", border: "0.5px solid var(--border)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{row.label}</span>
                {cfg?.provider_name && <span style={{ fontSize: 11, color: "var(--t3)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>{cfg.provider_name}</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {!cfg ? "Not configured" : cfg.last_test_error || (cfg.last_test_at ? `Last tested ${new Date(cfg.last_test_at).toLocaleString()}` : "Not tested yet")}
              </div>
            </div>
            <button onClick={() => test(row.type)} disabled={!cfg || testing === row.type || testingAll} style={{
              ...btnPrimary,
              background: !cfg || testing === row.type || testingAll ? "var(--fill2)" : "var(--t1)",
              color: !cfg || testing === row.type || testingAll ? "var(--t3)" : "var(--bg)",
              cursor: !cfg || testing === row.type || testingAll ? "not-allowed" : "pointer",
            }}>
              {testing === row.type ? "Testing..." : "Test"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AIUsage() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCalls(await getAiCalls({ limit: 1000 })); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = calls.reduce((acc, call) => {
    acc.totalCost += Number(call.cost_estimate) || 0;
    acc.calls += 1;
    acc.failed += call.success ? 0 : 1;
    acc.tokensIn += Number(call.tokens_input) || 0;
    acc.tokensOut += Number(call.tokens_output) || 0;
    const key = call.type || "unknown";
    acc.byType[key] = acc.byType[key] || { type: key, calls: 0, cost: 0, failed: 0 };
    acc.byType[key].calls += 1;
    acc.byType[key].cost += Number(call.cost_estimate) || 0;
    if (!call.success) acc.byType[key].failed += 1;
    return acc;
  }, { calls: 0, failed: 0, totalCost: 0, tokensIn: 0, tokensOut: 0, byType: {} });
  const byType = Object.values(summary.byType).sort((a, b) => b.cost - a.cost || b.calls - a.calls);
  const byProvider = Object.values(calls.reduce((acc, call) => {
    const key = call.provider_name || "unknown";
    acc[key] = acc[key] || { provider: key, calls: 0, cost: 0, failed: 0, durationTotal: 0, durationCount: 0 };
    acc[key].calls += 1;
    acc[key].cost += Number(call.cost_estimate) || 0;
    if (!call.success) acc[key].failed += 1;
    if (call.duration_ms != null) {
      acc[key].durationTotal += Number(call.duration_ms) || 0;
      acc[key].durationCount += 1;
    }
    return acc;
  }, {})).sort((a, b) => b.cost - a.cost || b.calls - a.calls);
  const failures = calls.filter(c => !c.success).slice(0, 6);
  const costSince = (days) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return calls.reduce((sum, call) => {
      const t = call.created_at ? new Date(call.created_at).getTime() : 0;
      return t >= cutoff ? sum + (Number(call.cost_estimate) || 0) : sum;
    }, 0);
  };
  const workflowChart = byType.slice(0, 7).map((row, i) => ({
    label: row.type,
    cost: row.cost,
    color: i === 0 ? "var(--t1)" : "var(--t2)",
  }));
  const providerChart = byProvider.slice(0, 7).map((row, i) => ({
    label: row.provider,
    cost: row.cost,
    color: i === 0 ? "var(--success)" : "var(--t2)",
  }));
  const exportCalls = () => exportCsv("uc-ai-calls.csv", calls.map(call => ({
    created_at: call.created_at,
    type: call.type,
    provider_name: call.provider_name,
    model_version: call.model_version,
    tokens_input: call.tokens_input,
    tokens_output: call.tokens_output,
    cost_estimate: call.cost_estimate,
    success: call.success,
    duration_ms: call.duration_ms,
    error_type: call.error_type,
    error_message: call.error_message,
    story_id: call.story_id,
    brand_profile_id: call.brand_profile_id,
    workspace_id: call.workspace_id,
    user_email: call.user_email,
  })));
  const exportSummary = () => exportCsv("uc-ai-usage-summary.csv", [
    ...byProvider.map(row => ({
      section: "provider",
      name: row.provider,
      calls: row.calls,
      failures: row.failed,
      avg_latency_ms: row.durationCount ? Math.round(row.durationTotal / row.durationCount) : "",
      cost_estimate: row.cost,
    })),
    ...byType.map(row => ({
      section: "workflow",
      name: row.type,
      calls: row.calls,
      failures: row.failed,
      avg_latency_ms: "",
      cost_estimate: row.cost,
    })),
  ]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 12, color: "var(--t3)" }}>Recent AI calls and estimated Anthropic/provider spend.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={exportCalls} disabled={!calls.length} style={{ ...btnSecondary, opacity: calls.length ? 1 : 0.45 }}><Download size={12}/> Export calls</button>
          <button onClick={exportSummary} disabled={!calls.length} style={{ ...btnSecondary, opacity: calls.length ? 1 : 0.45 }}><Download size={12}/> Export summary</button>
          <button onClick={load} disabled={loading} style={btnSecondary}><RefreshCw size={12}/>{loading ? "Loading..." : "Refresh"}</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        {[
          ["Today", loading ? "..." : formatCost(costSince(1))],
          ["7 days", loading ? "..." : formatCost(costSince(7))],
          ["30 days", loading ? "..." : formatCost(costSince(30))],
          ["Loaded total", loading ? "..." : formatCost(summary.totalCost)],
          ["Recent calls", loading ? "..." : summary.calls],
          ["Input tokens", loading ? "..." : summary.tokensIn.toLocaleString()],
          ["Failures", loading ? "..." : summary.failed],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: "12px 14px", borderRadius: 9, background: "var(--bg)", border: "0.5px solid var(--border)" }}>
            <div style={labelStyle}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", color: "var(--t1)" }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <DailyCostChart calls={calls} />
        <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg)", border: "0.5px solid var(--border)" }}>
          <div style={{ ...labelStyle, marginBottom: 12 }}>Provider spend</div>
          <MiniBarChart rows={providerChart} valueKey="cost" formatValue={formatCost} empty="No provider spend logged yet." />
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg)", border: "0.5px solid var(--border)" }}>
          <div style={{ ...labelStyle, marginBottom: 12 }}>Workflow spend</div>
          <MiniBarChart rows={workflowChart} valueKey="cost" formatValue={formatCost} empty="No workflow spend logged yet." />
        </div>
      </div>
      <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg)", border: "0.5px solid var(--border)" }}>
        <div style={{ ...labelStyle, marginBottom: 12 }}>Cost by workflow</div>
        {byType.length ? byType.map(row => (
          <div key={row.type} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", gap: 10, alignItems: "center", padding: "5px 0", fontSize: 12 }}>
            <span style={{ color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.type}</span>
            <span style={{ color: "var(--t2)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", textAlign: "right" }}>{row.calls}</span>
            <span style={{ color: row.failed ? "var(--error)" : "var(--t3)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", textAlign: "right" }}>{row.failed}</span>
            <span style={{ color: "var(--t1)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", textAlign: "right" }}>{formatCost(row.cost)}</span>
          </div>
        )) : <div style={{ fontSize: 12, color: "var(--t4)" }}>{loading ? "Loading AI usage..." : "No AI calls logged yet. Run the ai_calls SQL if this stays empty after AI usage."}</div>}
      </div>
      <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg)", border: "0.5px solid var(--border)" }}>
        <div style={{ ...labelStyle, marginBottom: 12 }}>Cost by provider</div>
        {byProvider.length ? byProvider.map(row => {
          const avg = row.durationCount ? Math.round(row.durationTotal / row.durationCount) : null;
          return (
            <div key={row.provider} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 80px 70px", gap: 10, alignItems: "center", padding: "5px 0", fontSize: 12 }}>
              <span style={{ color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>{row.provider}</span>
              <span style={{ color: "var(--t2)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", textAlign: "right" }}>{row.calls}</span>
              <span style={{ color: row.failed ? "var(--error)" : "var(--t3)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", textAlign: "right" }}>{row.failed}</span>
              <span style={{ color: "var(--t3)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", textAlign: "right" }}>{avg != null ? `${avg}ms` : "—"}</span>
              <span style={{ color: "var(--t1)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", textAlign: "right" }}>{formatCost(row.cost)}</span>
            </div>
          );
        }) : <div style={{ fontSize: 12, color: "var(--t4)" }}>{loading ? "Loading AI usage..." : "No provider usage logged yet."}</div>}
      </div>
      <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg)", border: "0.5px solid var(--border)" }}>
        <div style={{ ...labelStyle, marginBottom: 12 }}>Recent failures</div>
        {failures.length ? failures.map(call => (
          <div key={call.id} style={{ display: "grid", gridTemplateColumns: "130px 1fr auto", gap: 10, alignItems: "center", padding: "7px 0", borderTop: "0.5px solid var(--border2)" }}>
            <span style={{ fontSize: 11, color: "var(--error)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>{call.type}</span>
            <span style={{ fontSize: 12, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{call.error_message || call.error_type || "Unknown error"}</span>
            <span style={{ fontSize: 10, color: "var(--t4)" }}>{call.created_at ? new Date(call.created_at).toLocaleDateString() : ""}</span>
          </div>
        )) : <div style={{ fontSize: 12, color: "var(--t4)" }}>No recent AI failures.</div>}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────

export default function ProvidersSection() {
  const [configs, setConfigs] = useState({});
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [tab, setTab] = usePersistentState("providers_tab", "overview");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const types = ["voice", "storage", "visual_atmospheric", "visual_licensed", "llm_openai", "llm_anthropic"];
      const [results, usage] = await Promise.all([
        Promise.all(types.map(t => loadProviderConfig(UNCLE_CARTER_PROFILE_ID, t))),
        getAiCalls({ limit: 1000 }),
      ]);
      const map = {};
      types.forEach((t, i) => { map[t] = results[i]; });
      setConfigs(map);
      setCalls(usage);
    } catch (e) { setError(e?.message || String(e)); }
    finally    { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const status = (cfg) => {
    if (!cfg) return "default";
    if (cfg.provider_name === "stub") return "default";
    if (cfg.last_test_ok === true)  return "success";
    if (cfg.last_test_ok === false) return "fail";
    return "untested";
  };

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--t1)", margin: "0 0 6px" }}>Providers</h2>
      <p style={{ fontSize: 12, color: "var(--t3)", margin: "0 0 18px", lineHeight: 1.5, maxWidth: 600 }}>
        External services for voice, atmospheric visuals, licensed visuals, and storage. Credentials are
        stored server-side and never exposed to your browser. Test buttons fire real API pings.
      </p>

      <div style={{ display: "flex", gap: 4, marginBottom: 18, flexWrap: "wrap" }}>
        {[
          ["overview", "Overview"],
          ["configure", "Configure"],
          ["health", "Health"],
          ["usage", "AI Usage"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: tab === key ? 600 : 400,
            background: tab === key ? "var(--t1)" : "transparent",
            color: tab === key ? "var(--bg)" : "var(--t3)",
            border: tab === key ? "0.5px solid var(--t1)" : "0.5px solid transparent",
            cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 12, color: "var(--t3)", padding: "20px 0" }}>Loading providers…</div>}

      {error && (
        <div style={{ fontSize: 12, color: "#C0666A", padding: "12px 16px", borderRadius: 7,
          background: "rgba(192,102,106,0.08)", border: "0.5px solid rgba(192,102,106,0.3)", marginBottom: 14,
          display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600 }}>Couldn't load provider config</div>
            <div style={{ marginTop: 2 }}>{error}</div>
          </div>
        </div>
      )}

      {!loading && tab === "overview" && <ProviderOverview configs={configs} calls={calls} />}
      {!loading && tab === "health" && <ProviderHealth configs={configs} onReload={reload} />}
      {!loading && tab === "usage" && <AIUsage />}

      {!loading && tab === "configure" && (
        <>
          <ProviderCard id="llm_openai" title="Language Model — OpenAI" defaultExpanded={true}
            description="GPT-4o and GPT-4o mini. Add your key here to enable OpenAI models in the agent panel."
            status={status(configs.llm_openai)}>
            <ProviderForm brandId={UNCLE_CARTER_PROFILE_ID} providerType="llm_openai"
              providers={LLM_OPENAI_PROVIDERS} initial={configs.llm_openai} onSaved={reload}
              renderFields={(p) => <LLMOpenAIFields {...p} />} />
          </ProviderCard>

          <ProviderCard id="llm_anthropic" title="Language Model — Anthropic (override)"
            description="Optional per-tenant Anthropic key. Leave unconfigured to use the server environment key."
            status={status(configs.llm_anthropic)}>
            <ProviderForm brandId={UNCLE_CARTER_PROFILE_ID} providerType="llm_anthropic"
              providers={LLM_ANTHROPIC_PROVIDERS} initial={configs.llm_anthropic} onSaved={reload}
              renderFields={(p) => <LLMAnthropicFields {...p} />} />
          </ProviderCard>

          <ProviderCard id="voice" title="Voice"
            description="Text-to-speech for English, French, Spanish, Portuguese (and any language you add)."
            status={status(configs.voice)}>
            <ProviderForm brandId={UNCLE_CARTER_PROFILE_ID} providerType="voice"
              providers={VOICE_PROVIDERS} initial={configs.voice} onSaved={reload}
              renderFields={(p) => <VoiceFields {...p} />} />
          </ProviderCard>

          <ProviderCard id="atmospheric" title="Visual — atmospheric"
            description="AI-generated images: scenes, moods, atmosphere. Used for cinematic shots."
            status={status(configs.visual_atmospheric)}>
            <ProviderForm brandId={UNCLE_CARTER_PROFILE_ID} providerType="visual_atmospheric"
              providers={ATMOSPHERIC_PROVIDERS} initial={configs.visual_atmospheric} onSaved={reload}
              renderFields={(p) => <AtmosphericFields {...p} />} />
          </ProviderCard>

          <ProviderCard id="licensed" title="Visual — licensed"
            description="Real photos with cleared rights. Used for player faces, real moments."
            status={status(configs.visual_licensed)}>
            <ProviderForm brandId={UNCLE_CARTER_PROFILE_ID} providerType="visual_licensed"
              providers={LICENSED_PROVIDERS} initial={configs.visual_licensed} onSaved={reload}
              renderFields={(p) => <LicensedFields {...p} />} />
          </ProviderCard>

          <ProviderCard id="storage" title="Storage"
            description="Where generated audio, visuals, and asset library files are stored."
            status={status(configs.storage)}>
            <ProviderForm brandId={UNCLE_CARTER_PROFILE_ID} providerType="storage"
              providers={STORAGE_PROVIDERS} initial={configs.storage} onSaved={reload}
              renderFields={(p) => <StorageFields {...p} />} />
          </ProviderCard>
        </>
      )}
    </div>
  );
}
