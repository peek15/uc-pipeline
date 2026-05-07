"use client";

import ScriptView from "@/components/ScriptView";
import ProductionView from "@/components/ProductionView";
import { PageHeader, buttonStyle } from "@/components/OperationalUI";

export default function CreateView({ stories, onUpdate, mode, onModeChange }) {
  const ready = stories.filter(s => ["approved", "scripted", "produced"].includes(s.status));
  const queue = stories.filter(s =>
    ["scripted", "produced"].includes(s.status) ||
    ["briefing", "visuals", "voice", "assembly", "ready"].includes(s.production_status)
  );

  const modes = [
    { key: "write", label: "Write", meta: `${ready.length} ready` },
    { key: "produce", label: "Produce", meta: `${queue.length} in flight` },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Create"
        description="Write scripts, translate voice packs, and produce assets from one creation workspace."
        meta={mode === "write" ? modes[0].meta : modes[1].meta}
      />

      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:16 }}>
        {modes.map(m => (
          <button key={m.key} onClick={() => onModeChange(m.key)} style={buttonStyle(mode === m.key ? "primary" : "ghost", {
            padding:"6px 14px",
            border: mode === m.key ? "0.5px solid var(--t1)" : "0.5px solid transparent",
          })}>
            {m.label}
            <span style={{ fontSize:10, opacity:0.7 }}>{m.meta}</span>
          </button>
        ))}
      </div>

      <div style={{ display: mode === "write" ? "block" : "none" }}>
        <ScriptView stories={stories} onUpdate={onUpdate} embedded />
      </div>
      <div style={{ display: mode === "produce" ? "block" : "none" }}>
        <ProductionView stories={stories} onUpdate={onUpdate} embedded />
      </div>
    </div>
  );
}
