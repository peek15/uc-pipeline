"use client";

import { useState, useEffect, useRef } from "react";
import { X, Upload, Trash2, Eye, EyeOff, AlertCircle, Check, RefreshCw } from "lucide-react";
import { FORMATS } from "@/lib/constants";
import {
  uploadLibraryAsset, listLibraryAssets, deleteLibraryAsset, setAssetActive,
  ASSET_LIB_TYPES, POSITION_INTENT_OPTIONS,
} from "@/lib/assetLibrary";
import { DEFAULT_BRAND_PROFILE_ID } from "@/lib/brand";

const UNCLE_CARTER_PROFILE_ID = DEFAULT_BRAND_PROFILE_ID;

const FILE_ACCEPT = "video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,image/jpeg,image/png,image/webp";

const s = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 200,
    background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  },
  modal: {
    width: "100%", maxWidth: 780, maxHeight: "88vh",
    background: "var(--bg)", borderRadius: 12, border: "0.5px solid var(--border)",
    boxShadow: "0 12px 32px rgba(0,0,0,0.2)",
    display: "flex", flexDirection: "column", overflow: "hidden",
  },
  header: {
    padding: "18px 24px", borderBottom: "0.5px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
  },
  body: { display: "flex", flex: 1, overflow: "hidden" },
  pane: { flex: 1, overflow: "auto", padding: "16px 24px" },
  divider: { width: "0.5px", background: "var(--border)", flexShrink: 0 },
  label: { fontSize: 10, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 },
  input: { width: "100%", padding: "7px 10px", borderRadius: 6, fontSize: 12, background: "var(--fill2)", border: "0.5px solid var(--border)", color: "var(--t1)", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  select: { width: "100%", padding: "7px 10px", borderRadius: 6, fontSize: 12, background: "var(--fill2)", border: "0.5px solid var(--border)", color: "var(--t1)", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  btn: { padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, background: "var(--t1)", color: "var(--bg)", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  btnGhost: { padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: "transparent", color: "var(--t3)", border: "0.5px solid var(--border)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 },
  chip: (active) => ({
    padding: "3px 9px", borderRadius: 12, fontSize: 11, fontWeight: 500, cursor: "pointer",
    background: active ? "var(--t1)" : "var(--fill2)",
    color: active ? "var(--bg)" : "var(--t2)",
    border: "0.5px solid var(--border)", userSelect: "none",
  }),
};

function ErrorBox({ children }) {
  return (
    <div style={{ marginTop: 10, fontSize: 11, color: "#C0666A", padding: "8px 12px", borderRadius: 6, background: "rgba(192,102,106,0.08)", border: "0.5px solid rgba(192,102,106,0.3)", display: "flex", gap: 6, alignItems: "flex-start" }}>
      <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

function TypeBadge({ type }) {
  const def = ASSET_LIB_TYPES.find(t => t.key === type);
  return (
    <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", padding: "2px 7px", borderRadius: 4, background: "var(--fill2)", color: "var(--t3)", border: "0.5px solid var(--border)" }}>
      {def?.label || type}
    </span>
  );
}

function AssetRow({ asset, onToggle, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const ext = asset.file_url?.split(".").pop()?.split("?")[0]?.toLowerCase();
  const isAudio = ["mp3","m4a","wav"].includes(ext);
  const isVideo = ["mp4","mov","webm"].includes(ext);
  const isImg   = ["jpg","jpeg","png","webp"].includes(ext);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      borderRadius: 7, border: "0.5px solid var(--border)",
      background: asset.active ? "var(--bg2)" : "var(--fill)",
      opacity: asset.active ? 1 : 0.55,
    }}>
      {isImg && asset.file_url && (
        <img src={asset.file_url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
      )}
      {!isImg && (
        <div style={{ width: 40, height: 40, borderRadius: 4, background: "var(--fill2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", color: "var(--t3)", textTransform: "uppercase" }}>{ext || "?"}</span>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.name}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
          <TypeBadge type={asset.type} />
          {asset.language && <span style={{ fontSize: 10, color: "var(--t3)" }}>{asset.language.toUpperCase()}</span>}
          {(asset.format_scope || []).map(f => <span key={f} style={{ fontSize: 10, color: "var(--t3)" }}>{f}</span>)}
          {(asset.tags || []).slice(0, 3).map(t => <span key={t} style={{ fontSize: 10, color: "var(--t4)" }}>#{t}</span>)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {asset.file_url && (
          <a href={asset.file_url} target="_blank" rel="noreferrer" style={{ ...s.btnGhost, textDecoration: "none" }}>
            <Eye size={11} />
          </a>
        )}
        <button onClick={() => onToggle(asset.id, !asset.active)} style={s.btnGhost} title={asset.active ? "Deactivate" : "Activate"}>
          {asset.active ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
        {!confirming && (
          <button onClick={() => setConfirming(true)} style={{ ...s.btnGhost, color: "#C0666A" }}>
            <Trash2 size={11} />
          </button>
        )}
        {confirming && (
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => { onDelete(asset.id); setConfirming(false); }} style={{ ...s.btnGhost, color: "#C0666A", fontSize: 10 }}>
              Delete
            </button>
            <button onClick={() => setConfirming(false)} style={{ ...s.btnGhost, fontSize: 10 }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadForm({ onUploaded }) {
  const [file, setFile]     = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError]   = useState(null);
  const [done, setDone]     = useState(false);
  const fileRef             = useRef();

  const [meta, setMeta] = useState({
    name: "", type: "broll", language: "",
    format_scope: [], position_intent: ["any"], tags: "",
  });

  const set = (key, val) => setMeta(p => ({ ...p, [key]: val }));

  const toggleArr = (key, val) => {
    setMeta(p => {
      const arr = p[key] || [];
      return { ...p, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  };

  const onFile = (f) => {
    setFile(f); setError(null); setDone(false);
    if (!meta.name) set("name", f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "));
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setUploading(true); setError(null); setDone(false);
    try {
      const tags = meta.tags.split(",").map(t => t.trim()).filter(Boolean);
      await uploadLibraryAsset({
        file,
        brandProfileId: UNCLE_CARTER_PROFILE_ID,
        meta: { ...meta, tags },
      });
      setFile(null); setDone(true);
      setMeta({ name: "", type: "broll", language: "", format_scope: [], position_intent: ["any"], tags: "" });
      onUploaded?.();
      setTimeout(() => setDone(false), 2000);
    } catch (e) { setError(e?.message || String(e)); }
    finally     { setUploading(false); }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        onClick={() => fileRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        style={{
          border: "1px dashed var(--border)", borderRadius: 8, padding: "20px 16px",
          textAlign: "center", cursor: "pointer",
          background: file ? "rgba(74,155,127,0.06)" : "var(--fill)",
          transition: "background 0.15s",
        }}
      >
        <input ref={fileRef} type="file" accept={FILE_ACCEPT} style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        {file
          ? <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 500 }}>{file.name} <span style={{ color: "var(--t3)", fontWeight: 400 }}>({(file.size/1024/1024).toFixed(1)} MB)</span></div>
          : <>
              <Upload size={16} style={{ color: "var(--t3)", margin: "0 auto 6px" }} />
              <div style={{ fontSize: 12, color: "var(--t3)" }}>Click or drag a video, audio, or image file</div>
              <div style={{ fontSize: 10, color: "var(--t4)", marginTop: 3 }}>MP4 · MOV · MP3 · M4A · WAV · JPG · PNG · max 100 MB</div>
            </>
        }
      </div>

      <div>
        <label style={s.label}>Name</label>
        <input value={meta.name} onChange={e => set("name", e.target.value)} style={s.input} placeholder="e.g. Uncle Carter outro v1" />
      </div>

      <div>
        <label style={s.label}>Type</label>
        <select value={meta.type} onChange={e => set("type", e.target.value)} style={s.select}>
          {ASSET_LIB_TYPES.map(t => <option key={t.key} value={t.key}>{t.label} — {t.desc}</option>)}
        </select>
      </div>

      <div>
        <label style={s.label}>Position</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {POSITION_INTENT_OPTIONS.map(p => (
            <span key={p.key} style={s.chip(meta.position_intent.includes(p.key))}
              onClick={() => toggleArr("position_intent", p.key)}>{p.label}</span>
          ))}
        </div>
      </div>

      <div>
        <label style={s.label}>Formats (leave empty = all)</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FORMATS.map(f => (
            <span key={f.key} style={s.chip(meta.format_scope.includes(f.key))}
              onClick={() => toggleArr("format_scope", f.key)}>{f.label}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={s.label}>Language (optional)</label>
          <select value={meta.language} onChange={e => set("language", e.target.value)} style={s.select}>
            <option value="">Any</option>
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
            <option value="pt">Portuguese</option>
          </select>
        </div>
        <div>
          <label style={s.label}>Tags (comma-separated)</label>
          <input value={meta.tags} onChange={e => set("tags", e.target.value)} style={s.input} placeholder="clockwatch, logo, slam" />
        </div>
      </div>

      <button onClick={submit} disabled={!file || uploading} style={s.btn}>
        {uploading ? <RefreshCw size={12} className="spin" /> : done ? <Check size={12} /> : <Upload size={12} />}
        {uploading ? "Uploading…" : done ? "Uploaded!" : "Upload to library"}
      </button>

      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}

export default function AssetLibraryModal({ isOpen, onClose }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]  = useState("all");

  useEffect(() => {
    if (!isOpen) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listLibraryAssets(UNCLE_CARTER_PROFILE_ID);
      setAssets(data);
    } catch {}
    finally { setLoading(false); }
  };

  const handleToggle = async (id, active) => {
    await setAssetActive(id, active).catch(() => {});
    setAssets(p => p.map(a => a.id === id ? { ...a, active } : a));
  };

  const handleDelete = async (id) => {
    await deleteLibraryAsset(id).catch(() => {});
    setAssets(p => p.filter(a => a.id !== id));
  };

  if (!isOpen) return null;

  const displayed = filter === "all" ? assets : assets.filter(a => a.type === filter);
  const activeCount = assets.filter(a => a.active).length;

  return (
    <div onClick={onClose} style={s.overlay}>
      <div onClick={e => e.stopPropagation()} style={s.modal}>
        <div style={s.header}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--t1)", letterSpacing: "-0.01em" }}>Asset library</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>
              {activeCount} active asset{activeCount !== 1 ? "s" : ""} — used by asset-curator agent
            </div>
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 6, background: "transparent", border: "0.5px solid var(--border)", cursor: "pointer", color: "var(--t3)", display: "flex", alignItems: "center" }}>
            <X size={14} />
          </button>
        </div>

        <div style={s.body}>
          {/* Left: library list */}
          <div style={{ ...s.pane, width: "55%" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {[{ key: "all", label: "All" }, ...ASSET_LIB_TYPES].map(t => (
                <span key={t.key} style={s.chip(filter === t.key)} onClick={() => setFilter(t.key)}>
                  {t.label}
                </span>
              ))}
            </div>

            {loading && <div style={{ fontSize: 12, color: "var(--t3)", padding: "20px 0", textAlign: "center" }}>Loading…</div>}

            {!loading && displayed.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--t3)", padding: "20px 0", textAlign: "center" }}>
                {filter === "all" ? "No assets yet — upload your first one →" : `No ${filter} assets yet`}
              </div>
            )}

            <div style={{ display: "grid", gap: 6 }}>
              {displayed.map(asset => (
                <AssetRow key={asset.id} asset={asset} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </div>
          </div>

          <div style={s.divider} />

          {/* Right: upload form */}
          <div style={{ ...s.pane, width: "45%" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", marginBottom: 14 }}>Upload new asset</div>
            <UploadForm onUploaded={load} />
          </div>
        </div>
      </div>
    </div>
  );
}
