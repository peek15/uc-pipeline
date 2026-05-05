"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { getGroupedShortcuts } from "@/lib/shortcuts";

export default function ShortcutsCheatSheet({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const h = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const groups = getGroupedShortcuts();

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 720, maxHeight: "85vh",
          background: "var(--bg)", borderRadius: 12,
          border: "0.5px solid var(--border)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "20px 24px",
          borderBottom: "0.5px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--t1)", letterSpacing: "-0.01em" }}>
              Keyboard shortcuts
            </div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>
              Press Esc or click outside to close.
            </div>
          </div>
          <button onClick={onClose} style={{
            padding: 6, borderRadius: 6, background: "transparent",
            border: "0.5px solid var(--border)", cursor: "pointer",
            color: "var(--t3)", display: "flex", alignItems: "center",
          }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ overflow: "auto", padding: "8px 0" }}>
          {groups.map(({ group, items }) => (
            <div key={group} style={{ padding: "12px 24px" }}>
              <div style={{
                fontSize: 10, fontWeight: 600, color: "var(--t3)",
                textTransform: "uppercase", letterSpacing: "0.06em",
                marginBottom: 8,
              }}>
                {group}
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                {items.map(({ key, label, description }) => (
                  <div key={key} style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 16, alignItems: "center",
                    padding: "6px 0",
                    fontSize: 13, color: "var(--t1)",
                  }}>
                    <span style={{ lineHeight: 1.4 }}>{description}</span>
                    <kbd style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 11, fontWeight: 600,
                      padding: "3px 8px", borderRadius: 5,
                      background: "var(--fill2)",
                      border: "0.5px solid var(--border)",
                      color: "var(--t2)",
                      minWidth: 36, textAlign: "center",
                      whiteSpace: "nowrap",
                    }}>{label}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: "10px 24px",
          borderTop: "0.5px solid var(--border)",
          fontSize: 11, color: "var(--t4)",
          fontFamily: "'DM Mono', monospace",
        }}>
          Tip: shortcuts ignore typing in input fields.
        </div>
      </div>
    </div>
  );
}
