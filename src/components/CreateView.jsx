"use client";

import { useEffect } from "react";
import ScriptView from "@/components/ScriptView";
import ProductionView from "@/components/ProductionView";
import { PageHeader, Panel, buttonStyle } from "@/components/OperationalUI";
import { SHORTCUTS, matches, shouldIgnoreFromInput, renderCombo } from "@/lib/shortcuts";

export default function CreateView({ stories, onUpdate, mode, onModeChange }) {
  const ready = stories.filter(s => ["approved", "scripted", "produced"].includes(s.status));
  const queue = stories.filter(s =>
    ["scripted", "produced"].includes(s.status) ||
    ["briefing", "visuals", "voice", "assembly", "ready"].includes(s.production_status)
  );

  const modes = [
    { key: "write", label: "Write", meta: `${ready.length} ready`, description: "Scripts, translations, voice packs" },
    { key: "produce", label: "Produce", meta: `${queue.length} in flight`, description: "Briefs, assets, voice, visuals, assembly" },
  ];
  const activeIndex = Math.max(0, modes.findIndex(m => m.key === mode));

  useEffect(() => {
    const handler = (e) => {
      if (shouldIgnoreFromInput()) return;
      if (!matches(e, SHORTCUTS.createModePrev.combo) && !matches(e, SHORTCUTS.createModeNext.combo)) return;
      e.preventDefault();
      const nextIndex = matches(e, SHORTCUTS.createModeNext.combo)
        ? Math.min(activeIndex + 1, modes.length - 1)
        : Math.max(activeIndex - 1, 0);
      onModeChange(modes[nextIndex].key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex, modes, onModeChange]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Create"
        description="Write scripts, translate voice packs, and produce assets from one creation workspace."
        meta={mode === "write" ? modes[0].meta : modes[1].meta}
      />

      <Panel style={{ marginBottom:16, padding:"8px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(210px, 1fr))", gap:8 }}>
        {modes.map(m => (
          <button key={m.key} onClick={() => onModeChange(m.key)} style={buttonStyle(mode === m.key ? "primary" : "ghost", {
            padding:"10px 12px",
            justifyContent:"space-between",
            border: mode === m.key ? "0.5px solid var(--t1)" : "0.5px solid var(--border)",
            textAlign:"left",
          })}>
            <span>
              <span style={{ display:"block", fontSize:13, fontWeight:700 }}>{m.label}</span>
              <span style={{ display:"block", fontSize:11, opacity:0.72, marginTop:2 }}>{m.description}</span>
            </span>
            <span style={{ fontSize:10, opacity:0.7, fontFamily:"var(--font-mono)" }}>{m.meta}</span>
          </button>
        ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginTop:8, padding:"0 2px", fontSize:10, color:"var(--t4)", flexWrap:"wrap" }}>
          <span>Move fluidly between scripting and production without leaving Create.</span>
          <span style={{ fontFamily:"var(--font-mono)" }}>{renderCombo(SHORTCUTS.createModePrev.combo)} / {renderCombo(SHORTCUTS.createModeNext.combo)}</span>
        </div>
      </Panel>

      <div style={{ display: mode === "write" ? "block" : "none" }}>
        <ScriptView stories={stories} onUpdate={onUpdate} embedded />
      </div>
      <div style={{ display: mode === "produce" ? "block" : "none" }}>
        <ProductionView stories={stories} onUpdate={onUpdate} embedded />
      </div>
    </div>
  );
}
