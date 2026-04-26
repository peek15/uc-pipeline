"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Loader2, Plus, X, Eye, EyeOff } from "lucide-react";
import { usePersistentState } from "@/lib/usePersistentState";
import { loadProviderConfig, saveProviderConfig, testProviderConnection, listProviderConfigs } from "@/lib/providers/config-loader";

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
  width: "100%",
  padding: "8px 12px",
  borderRadius: 7,
  fontSize: 13,
  background: "var(--fill2)",
  border: "1px solid var(--border-in)",
  color: "var(--t1)",
  outline: "none",
  fontFamily: "inherit",
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

// ─── Slider with number input ────────────────────────────
// Per Théo's design preference: full width, custom styled, number alongside

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, hint }) {
  return (
    <div>
      <div style={{ ...labelStyle, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>{label}</span>
        {hint && <span style={{ fontSize: 9, fontWeight: 400, color: "var(--t4)", textTransform: "none", letterSpacing: 0 }}>{hint}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            flex: 1, height: 3, background: "var(--border)",
            borderRadius: 999, appearance: "none", outline: "none",
            accentColor: "var(--t1)",
          }}
        />
        <input
          type="number"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          style={{ ...inputStyle, width: 70, padding: "5px 8px", textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 12 }}
        />
      </div>
    </div>
  );
}

// ─── Secret input — toggle to reveal, "key set" indicator ────

function SecretInput({ label, value, onChange, isSet, placeholder }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div>
      <div style={{ ...labelStyle, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>{label}</span>
        {isSet && !value && (
          <span style={{ fontSize: 9, fontWeight: 500, color: "#4A9B7F", textTransform: "none", letterSpacing: 0 }}>
            ✓ Saved — leave empty to keep
          </span>
        )}
      </div>
      <div style={{ position: "relative" }}>
        <input
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSet ? "•••••••• (saved — leave empty to keep)" : (placeholder || "")}
          style={{ ...inputStyle, paddingRight: 40, fontFamily: reveal ? "'DM Mono',monospace" : "inherit" }}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setReveal(r => !r)}
          style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            background: "transparent", border: "none", cursor: "pointer", padding: 4,
            color: "var(--t3)", display: "flex", alignItems: "center",
          }}
          tabIndex={-1}
        >
          {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─── Status pill ─────────────────────────────────────────

function StatusPill({ status }) {
  if (status === "success") {
    return (
      <span style={pillStyle("success")}>
        <CheckCircle2 size={11} /> Connected
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span style={pillStyle("fail")}>
        <AlertCircle size={11} /> Failed
      </span>
    );
  }
  if (status === "untested") {
    return <span style={pillStyle("default")}>Not tested</span>;
  }
  return <span style={pillStyle("default")}>Not configured</span>;
}

function pillStyle(kind) {
  const base = {
    fontSize: 10, fontWeight: 600, fontFamily: "'DM Mono',monospace",
    padding: "3px 9px", borderRadius: 4,
    border: "0.5px solid var(--border)",
    display: "inline-flex", alignItems: "center", gap: 4,
    whiteSpace: "nowrap",
  };
  if (kind === "success") return { ...base, background: "rgba(74,155,127,0.12)", color: "#4A9B7F", borderColor: "rgba(74,155,127,0.3)" };
  if (kind === "fail")    return { ...base, background: "rgba(192,102,106,0.12)", color: "#C0666A", borderColor: "rgba(192,102,106,0.3)" };
  return { ...base, background: "var(--fill)", color: "var(--t3)" };
}

// ─── Provider card (collapsible) ─────────────────────────

function ProviderCard({ id, title, description, defaultExpanded = false, status, children }) {
  const [expanded, setExpanded] = usePersistentState(`providers_card_${id}_open`, defaultExpanded);

  return (
    <div style={{
      background: "var(--bg)",
      border: "0.5px solid var(--border)",
      borderRadius: 10,
      marginBottom: 10,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", padding: "14px 16px",
          background: "transparent", border: "none", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          {expanded ? <ChevronDown size={14} style={{ color: "var(--t3)", flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: "var(--t3)", flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{title}</div>
            {description && (
              <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2, lineHeight: 1.4 }}>{description}</div>
            )}
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

// ─── Voice provider form ──────────────────────────────────

function VoiceProviderForm({ brandId, initial, onChange, onSaved }) {
  const [providerName, setProviderName] = useState(initial?.provider_name || "stub");
  const [config,       setConfig]       = useState(initial?.config       || {});
  const [secrets,      setSecrets]      = useState({});  // always start empty
  const [isSet,        setIsSet]        = useState({ api_key: !!initial?.has_api_key });
  const [saving,       setSaving]       = useState(false);
  const [testing,      setTesting]      = useState(false);
  const [testResult,   setTestResult]   = useState(null);
  const [error,        setError]        = useState(null);
  const [savedFlash,   setSavedFlash]   = useState(false);

  // Sync when initial changes (after parent reload)
  useEffect(() => {
    setProviderName(initial?.provider_name || "stub");
    setConfig(initial?.config || {});
    setSecrets({});
    setIsSet({ api_key: !!initial?.has_api_key });
    setTestResult(initial?.last_test_ok != null ? {
      ok: initial.last_test_ok,
      error: initial.last_test_error,
      at: initial.last_test_at,
    } : null);
  }, [initial]);

  // ── voice array helpers ────
  const voices = Array.isArray(config.voices) ? config.voices : (
    // Legacy migration: if old voice_id_<lang> fields exist, surface as array
    Object.keys(config).filter(k => k.startsWith("voice_id_")).map(k => ({
      lang: k.replace("voice_id_", ""),
      voice_id: config[k],
    }))
  );

  const updateVoice = (i, patch) => {
    const next = voices.map((v, idx) => idx === i ? { ...v, ...patch } : v);
    setConfig({ ...config, voices: next });
  };
  const addVoice = () => {
    const used = new Set(voices.map(v => v.lang));
    const next_lang = LANG_OPTIONS.find(o => !used.has(o.key))?.key || "en";
    setConfig({ ...config, voices: [...voices, { lang: next_lang, voice_id: "" }] });
  };
  const removeVoice = (i) => {
    setConfig({ ...config, voices: voices.filter((_, idx) => idx !== i) });
  };

  const updateConfig = (patch) => setConfig({ ...config, ...patch });

  const save = async () => {
    setSaving(true); setError(null);
    try {
      // Build payload — secrets only includes fields user actually entered
      const secretsPayload = {};
      if (secrets.api_key) secretsPayload.api_key = secrets.api_key;
      if (secrets.user_id) secretsPayload.user_id = secrets.user_id;

      // For non-stub providers, server keeps existing secrets if we send empty.
      // We achieve that by NOT including the field (backend merges).
      // For stub, send empty {} — clears any prior secrets.
      const payload = providerName === "stub"
        ? { secrets: {}, config: {} }
        : { secrets: secretsPayload, config };

      await saveProviderConfig({
        brand_id: brandId,
        provider_type: "voice",
        provider_name: providerName,
        ...payload,
      });

      // Update local "isSet" state
      if (secrets.api_key) setIsSet(s => ({ ...s, api_key: true }));
      setSecrets({});
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
      onSaved?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true); setError(null);
    try {
      const result = await testProviderConnection(brandId, "voice");
      setTestResult({ ok: result.ok, error: result.error, latency_ms: result.latency_ms, at: new Date().toISOString() });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <div style={labelStyle}>Provider</div>
        <select
          value={providerName}
          onChange={(e) => { setProviderName(e.target.value); setSecrets({}); }}
          style={inputStyle}
        >
          {VOICE_PROVIDERS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      {providerName === "stub" && (
        <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>
          Stub provider: no real audio is generated. Use this until you sign up for ElevenLabs.
        </div>
      )}

      {(providerName === "elevenlabs" || providerName === "playht") && (
        <>
          <SecretInput
            label="API key"
            value={secrets.api_key || ""}
            onChange={(v) => setSecrets(s => ({ ...s, api_key: v }))}
            isSet={isSet.api_key}
            placeholder={providerName === "elevenlabs" ? "sk_..." : "your PlayHT API key"}
          />

          {providerName === "playht" && (
            <SecretInput
              label="User ID"
              value={secrets.user_id || ""}
              onChange={(v) => setSecrets(s => ({ ...s, user_id: v }))}
              isSet={false}
              placeholder="your PlayHT user ID"
            />
          )}

          {/* Voice IDs per language — array-based, expandable */}
          <div>
            <div style={{ ...labelStyle, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span>Voices per language</span>
              <span style={{ fontSize: 9, fontWeight: 400, color: "var(--t4)", textTransform: "none", letterSpacing: 0 }}>
                Paste voice IDs from your provider dashboard
              </span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {voices.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--t4)", fontStyle: "italic", padding: "6px 0" }}>
                  No voices configured yet — add one below
                </div>
              )}
              {voices.map((v, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 6, alignItems: "center" }}>
                  <select
                    value={v.lang}
                    onChange={(e) => updateVoice(i, { lang: e.target.value })}
                    style={inputStyle}
                  >
                    {LANG_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  <input
                    type="text"
                    value={v.voice_id}
                    onChange={(e) => updateVoice(i, { voice_id: e.target.value })}
                    placeholder="voice ID"
                    style={{ ...inputStyle, fontFamily: "'DM Mono',monospace" }}
                  />
                  <button onClick={() => removeVoice(i)} style={{ ...btnGhost, padding: "0 10px" }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button onClick={addVoice} style={{ ...btnGhost, fontSize: 11, padding: "5px 10px", justifySelf: "start", marginTop: 4 }}>
                <Plus size={12} /> Add voice
              </button>
            </div>
          </div>

          {/* Sliders — only ElevenLabs uses these */}
          {providerName === "elevenlabs" && (
            <>
              <Slider
                label="Stability"
                value={config.stability ?? 0.5}
                onChange={(v) => updateConfig({ stability: v })}
                hint="Higher = more consistent, lower = more expressive"
              />
              <Slider
                label="Similarity boost"
                value={config.similarity_boost ?? 0.75}
                onChange={(v) => updateConfig({ similarity_boost: v })}
                hint="How closely the voice matches the original sample"
              />
              <Slider
                label="Style"
                value={config.style ?? 0}
                onChange={(v) => updateConfig({ style: v })}
                hint="Stylization vs neutrality (0 = most stable)"
              />
            </>
          )}
        </>
      )}

      {/* Action buttons */}
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

      {/* Test result */}
      {testResult && (
        <div style={{
          fontSize: 11,
          padding: "8px 12px",
          borderRadius: 6,
          background: testResult.ok ? "rgba(74,155,127,0.08)" : "rgba(192,102,106,0.08)",
          border: `0.5px solid ${testResult.ok ? "rgba(74,155,127,0.3)" : "rgba(192,102,106,0.3)"}`,
          color: testResult.ok ? "#4A9B7F" : "#C0666A",
          display: "flex", alignItems: "flex-start", gap: 6,
        }}>
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
        <div style={{ fontSize: 11, color: "#C0666A", padding: "8px 12px", borderRadius: 6, background: "rgba(192,102,106,0.08)", border: "0.5px solid rgba(192,102,106,0.3)", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ─── Storage provider form ────────────────────────────────

function StorageProviderForm({ brandId, initial, onChange, onSaved }) {
  const [providerName, setProviderName] = useState(initial?.provider_name || "supabase_storage");
  const [config,       setConfig]       = useState(initial?.config       || {});
  const [secrets,      setSecrets]      = useState({});
  const [isSet,        setIsSet]        = useState({
    access_key_id: !!initial?.has_access_key_id,
    secret_access_key: !!initial?.has_secret_access_key,
    service_account_json: !!initial?.has_service_account_json,
  });
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError]     = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setProviderName(initial?.provider_name || "supabase_storage");
    setConfig(initial?.config || {});
    setSecrets({});
    setIsSet({
      access_key_id: !!initial?.has_access_key_id,
      secret_access_key: !!initial?.has_secret_access_key,
      service_account_json: !!initial?.has_service_account_json,
    });
    setTestResult(initial?.last_test_ok != null ? {
      ok: initial.last_test_ok,
      error: initial.last_test_error,
      at: initial.last_test_at,
    } : null);
  }, [initial]);

  const updateConfig = (patch) => setConfig({ ...config, ...patch });

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const secretsPayload = {};
      if (secrets.access_key_id)        secretsPayload.access_key_id        = secrets.access_key_id;
      if (secrets.secret_access_key)    secretsPayload.secret_access_key    = secrets.secret_access_key;
      if (secrets.service_account_json) secretsPayload.service_account_json = secrets.service_account_json;

      const payload = providerName === "stub" || providerName === "supabase_storage"
        ? { secrets: {}, config }
        : { secrets: secretsPayload, config };

      await saveProviderConfig({
        brand_id: brandId,
        provider_type: "storage",
        provider_name: providerName,
        ...payload,
      });

      if (secrets.access_key_id)        setIsSet(s => ({ ...s, access_key_id: true }));
      if (secrets.secret_access_key)    setIsSet(s => ({ ...s, secret_access_key: true }));
      if (secrets.service_account_json) setIsSet(s => ({ ...s, service_account_json: true }));
      setSecrets({});
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
      onSaved?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true); setError(null);
    try {
      const result = await testProviderConnection(brandId, "storage");
      setTestResult({ ok: result.ok, error: result.error, latency_ms: result.latency_ms, at: new Date().toISOString() });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <div style={labelStyle}>Provider</div>
        <select
          value={providerName}
          onChange={(e) => { setProviderName(e.target.value); setSecrets({}); }}
          style={inputStyle}
        >
          {STORAGE_PROVIDERS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      {providerName === "stub" && (
        <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>
          Stub provider: assets stored in browser memory only. Lost on refresh.
        </div>
      )}

      {providerName === "supabase_storage" && (
        <>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>
            Uses your existing Supabase project. No API keys needed — RLS-protected automatically.
            Create the bucket in Supabase dashboard before saving.
          </div>
          <div>
            <div style={labelStyle}>Bucket name</div>
            <input
              type="text"
              value={config.bucket || ""}
              onChange={(e) => updateConfig({ bucket: e.target.value })}
              placeholder="uc-assets"
              style={{ ...inputStyle, fontFamily: "'DM Mono',monospace" }}
            />
          </div>
        </>
      )}

      {providerName === "s3" && (
        <>
          <SecretInput
            label="Access key ID"
            value={secrets.access_key_id || ""}
            onChange={(v) => setSecrets(s => ({ ...s, access_key_id: v }))}
            isSet={isSet.access_key_id}
            placeholder="AKIA..."
          />
          <SecretInput
            label="Secret access key"
            value={secrets.secret_access_key || ""}
            onChange={(v) => setSecrets(s => ({ ...s, secret_access_key: v }))}
            isSet={isSet.secret_access_key}
          />
          <div>
            <div style={labelStyle}>Region</div>
            <input
              type="text"
              value={config.region || ""}
              onChange={(e) => updateConfig({ region: e.target.value })}
              placeholder="us-east-1"
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Bucket name</div>
            <input
              type="text"
              value={config.bucket || ""}
              onChange={(e) => updateConfig({ bucket: e.target.value })}
              placeholder="my-bucket"
              style={{ ...inputStyle, fontFamily: "'DM Mono',monospace" }}
            />
          </div>
        </>
      )}

      {providerName === "gcs" && (
        <>
          <SecretInput
            label="Service account JSON"
            value={secrets.service_account_json || ""}
            onChange={(v) => setSecrets(s => ({ ...s, service_account_json: v }))}
            isSet={isSet.service_account_json}
            placeholder='{"type": "service_account", ...}'
          />
          <div>
            <div style={labelStyle}>Bucket name</div>
            <input
              type="text"
              value={config.bucket || ""}
              onChange={(e) => updateConfig({ bucket: e.target.value })}
              placeholder="my-gcs-bucket"
              style={{ ...inputStyle, fontFamily: "'DM Mono',monospace" }}
            />
          </div>
        </>
      )}

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
        <div style={{
          fontSize: 11,
          padding: "8px 12px",
          borderRadius: 6,
          background: testResult.ok ? "rgba(74,155,127,0.08)" : "rgba(192,102,106,0.08)",
          border: `0.5px solid ${testResult.ok ? "rgba(74,155,127,0.3)" : "rgba(192,102,106,0.3)"}`,
          color: testResult.ok ? "#4A9B7F" : "#C0666A",
          display: "flex", alignItems: "flex-start", gap: 6,
        }}>
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
        <div style={{ fontSize: 11, color: "#C0666A", padding: "8px 12px", borderRadius: 6, background: "rgba(192,102,106,0.08)", border: "0.5px solid rgba(192,102,106,0.3)", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────

export default function ProvidersSection() {
  const [voiceConfig, setVoiceConfig]     = useState(null);
  const [storageConfig, setStorageConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [voice, storage] = await Promise.all([
        loadProviderConfig(UNCLE_CARTER_PROFILE_ID, "voice"),
        loadProviderConfig(UNCLE_CARTER_PROFILE_ID, "storage"),
      ]);
      setVoiceConfig(voice);
      setStorageConfig(storage);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Compute status pills
  const voiceStatus = !voiceConfig ? "default" :
    voiceConfig.provider_name === "stub" ? "default" :
    voiceConfig.last_test_ok === true ? "success" :
    voiceConfig.last_test_ok === false ? "fail" : "untested";

  const storageStatus = !storageConfig ? "default" :
    storageConfig.provider_name === "stub" ? "default" :
    storageConfig.last_test_ok === true ? "success" :
    storageConfig.last_test_ok === false ? "fail" : "untested";

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--t1)", margin: "0 0 6px" }}>Providers</h2>
      <p style={{ fontSize: 12, color: "var(--t3)", margin: "0 0 18px", lineHeight: 1.5, maxWidth: 600 }}>
        External services Uncle Carter uses for voice generation and asset storage. Credentials are stored
        server-side and never exposed to your browser. Test connections fire a real API call on click.
      </p>

      {loading && (
        <div style={{ fontSize: 12, color: "var(--t3)", padding: "20px 0" }}>Loading providers…</div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "#C0666A", padding: "12px 16px", borderRadius: 7, background: "rgba(192,102,106,0.08)", border: "0.5px solid rgba(192,102,106,0.3)", marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600 }}>Couldn't load provider config</div>
            <div style={{ marginTop: 2 }}>{error}</div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          <ProviderCard
            id="voice"
            title="Voice"
            description="Text-to-speech for English, French, Spanish, Portuguese (and any language you add)."
            defaultExpanded={true}
            status={voiceStatus}
          >
            <VoiceProviderForm
              brandId={UNCLE_CARTER_PROFILE_ID}
              initial={voiceConfig}
              onSaved={reload}
            />
          </ProviderCard>

          <ProviderCard
            id="storage"
            title="Storage"
            description="Where generated audio, visuals, and asset library files are kept."
            defaultExpanded={false}
            status={storageStatus}
          >
            <StorageProviderForm
              brandId={UNCLE_CARTER_PROFILE_ID}
              initial={storageConfig}
              onSaved={reload}
            />
          </ProviderCard>
        </>
      )}
    </div>
  );
}
