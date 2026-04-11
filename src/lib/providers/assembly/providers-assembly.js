// ── Assembly Provider Slot ──
// Supported: capcut_export (manual brief), creatomate, remotion_stub
// Long term target: Remotion (React → MP4, fully automated)

export const assemblyProviders = {

  // CapCut export — generates a structured brief for manual assembly
  // Current default — no API, human assembles from the brief
  capcut_export: {
    name: "CapCut (manual)",
    async execute({ story, audioRefs, visualRefs, templateId, brandConfig }) {
      const brief = {
        story_id:      story.id,
        title:         story.title,
        format:        story.format,
        template_id:   templateId,
        duration_target: "45-55s",
        color_grade:   brandConfig?.production?.color_identity || "warm gold",
        locked_elements: brandConfig?.identity?.locked_elements || [],
        audio_files:   audioRefs,
        visual_assets: visualRefs?.selected || [],
        beat_structure: [
          { beat:1, name:"Hook",  duration:"0-5s",   notes:"Open with clockwatch click" },
          { beat:2, name:"Setup", duration:"5-20s",  notes:"Scene, context, intimacy" },
          { beat:3, name:"Story", duration:"20-45s", notes:"Untold angle, one emotional peak" },
          { beat:4, name:"Close", duration:"45-55s", notes:"Land weight. Closing line. Clockwatch close." },
        ],
        export_settings: {
          resolution: "1080x1920",
          fps: 30,
          format: "mp4",
        },
        generated_at: new Date().toISOString(),
      };

      return {
        result: brief,
        cost_estimate: 0,
        format: "json",
        requires_human: true,
      };
    }
  },

  // Creatomate — has API, template-based, good for automation bridge
  creatomate: {
    name: "Creatomate",
    async execute({ story, audioRefs, visualRefs, templateId, config }) {
      const apiKey = process.env.CREATOMATE_API_KEY;
      if (!apiKey) throw new Error("CREATOMATE_API_KEY not configured");

      throw new Error("Creatomate integration not yet configured. Add template_id to provider config.");
    }
  },

  // Remotion stub — future full automation target
  remotion: {
    name: "Remotion",
    async execute({ story, audioRefs, visualRefs, config }) {
      throw new Error("Remotion provider not yet implemented. Planned for Phase 2.");
    }
  },

  // Stub
  stub: {
    name: "Stub (test)",
    async execute(params) {
      return { result: { stub: true, params }, cost_estimate: 0, format: "json", requires_human: true };
    }
  },
};
