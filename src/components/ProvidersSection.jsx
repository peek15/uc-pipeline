"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Loader2, Plus, X, Eye, EyeOff } from "lucide-react";
import { usePersistentState } from "@/lib/usePersistentState";
import { loadProviderConfig, saveProviderConfig, testProviderConnection } from "@/lib/providers/config-loader";

const UNCLE_CARTER_PROFILE_ID = "00000000-0000-0000-0000-000000000001";

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
          style={{ ...inputStyle, width: 70, padding: "5px 8px", textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 12 }} />
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
          style={{ ...inputStyle, paddingRight: 40, fontFamily: reveal ? "'DM Mono',monospace" : "inherit" }}
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
  const base = { fontSize: 10, fontWeight: 600, fontFamily: "'DM Mono',monospace",
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
              {testResult.latency_ms != null && testResult.ok && <span style={{ fontWeight: 400, marginLeft: 6, fontFamily: "'DM Mono',monospace" }}>({testResult.latency_ms}ms)</span>}
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
                style={{ ...inputStyle, fontFamily: "'DM Mono',monospace" }} />
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
          placeholder="uc-assets" style={{ ...inputStyle, fontFamily: "'DM Mono',monospace" }} />
      </div>
    </>
  );
  if (providerName === "s3") return (
    <>
      <SecretInput label="Access key ID"     value={secrets.access_key_id     || ""} onChange={(v) => updateSecret("access_key_id", v)} isSet={isSet.access_key_id} placeholder="AKIA..." />
      <SecretInput label="Secret access key" value={secrets.secret_access_key || ""} onChange={(v) => updateSecret("secret_access_key", v)} isSet={isSet.secret_access_key} />
      <div><div style={labelStyle}>Region</div><input type="text" value={config.region || ""} onChange={(e) => updateConfig({ region: e.target.value })} placeholder="us-east-1" style={inputStyle} /></div>
      <div><div style={labelStyle}>Bucket name</div><input type="text" value={config.bucket || ""} onChange={(e) => updateConfig({ bucket: e.target.value })} placeholder="my-bucket" style={{ ...inputStyle, fontFamily: "'DM Mono',monospace" }} /></div>
    </>
  );
  if (providerName === "gcs") return (
    <>
      <SecretInput label="Service account JSON" value={secrets.service_account_json || ""} onChange={(v) => updateSecret("service_account_json", v)} isSet={isSet.service_account_json} placeholder='{"type":"service_account",...}' />
      <div><div style={labelStyle}>Bucket name</div><input type="text" value={config.bucket || ""} onChange={(e) => updateConfig({ bucket: e.target.value })} placeholder="my-gcs-bucket" style={{ ...inputStyle, fontFamily: "'DM Mono',monospace" }} /></div>
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

// ─── Main ────────────────────────────────────────────────

export default function ProvidersSection() {
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const types = ["voice", "storage", "visual_atmospheric", "visual_licensed"];
      const results = await Promise.all(types.map(t => loadProviderConfig(UNCLE_CARTER_PROFILE_ID, t)));
      const map = {};
      types.forEach((t, i) => { map[t] = results[i]; });
      setConfigs(map);
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

      {!loading && (
        <>
          <ProviderCard id="voice" title="Voice" defaultExpanded={true}
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
