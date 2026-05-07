import { ARCHETYPES, CONTENT_TYPE_MAP, ERAS, FORMATS, LANGS, RESEARCH_ANGLES, SCRIPT_SYSTEM, TEAMS } from "@/lib/constants";

export function getBrandName(settings) {
  return settings?.brand?.name || "Uncle Carter";
}

export function getAppName(settings) {
  return `${getBrandName(settings)} Pipeline`;
}

export function getBrandVoice(settings) {
  return settings?.brand?.voice || "Calm, warm, slightly mischievous. Never reactive. Never loud.";
}

export function getBrandAvoid(settings) {
  return settings?.brand?.avoid || "Hot takes, highlight reels, cliches, exclamation marks";
}

export function getBrandContentType(settings) {
  return settings?.brand?.content_type || "narrative";
}

export function getContentType(story, settings = null) {
  return story?.content_type || story?.metadata?.content_type || getBrandContentType(settings);
}

export function getContentTypeLabel(story, settings = null) {
  const key = getContentType(story, settings);
  return CONTENT_TYPE_MAP[key]?.label || String(key || "Content").replace(/_/g, " ");
}

export function contentObjective(story) {
  return story?.objective || story?.metadata?.objective || "";
}

export function contentAudience(story) {
  return story?.audience || story?.metadata?.audience || "";
}

export function contentChannel(story) {
  return story?.channel || story?.platform_target || story?.metadata?.channel || "";
}

export function getBrandProgrammes(settings) {
  const configured = settings?.strategy?.programmes;
  if (Array.isArray(configured) && configured.length) {
    return configured.map((p, index) => ({
      key: p.id || p.key || `programme_${index + 1}`,
      label: p.name || p.label || p.id || `Programme ${index + 1}`,
      color: p.color || FORMATS[index % FORMATS.length]?.color || "var(--t2)",
      desc: p.role ? `${p.role} programme` : p.desc || "",
      angle_suggestions: Array.isArray(p.angle_suggestions) ? p.angle_suggestions : [],
      weight: p.weight ?? 0,
      role: p.role || "balanced",
    }));
  }
  return FORMATS;
}

export function getBrandProgrammeMap(settings) {
  return Object.fromEntries(getBrandProgrammes(settings).map(p => [p.key, p]));
}

export function getContentTemplates(settings) {
  const configured = settings?.strategy?.content_templates;
  if (Array.isArray(configured) && configured.length) return configured;
  return [
    {
      id: "narrative_story",
      name: "Narrative story",
      content_type: "narrative",
      objective: "community",
      audience: "",
      channels: ["TikTok", "Instagram Reels", "YouTube Shorts"],
      deliverable_type: "short video",
      required_fields: ["subject", "angle", "hook", "script"],
      workflow_steps: ["research", "script", "translations", "brief", "assets", "review"],
    },
  ];
}

export function getContentTemplate(settings, id) {
  const templates = getContentTemplates(settings);
  return templates.find(t => t.id === id) || templates[0] || null;
}

export function getBrandArchetypes(settings) {
  const fromProgrammes = getBrandProgrammes(settings)
    .flatMap(p => p.angle_suggestions || [])
    .filter(Boolean)
    .map(v => String(v).trim())
    .filter(Boolean);
  const unique = [...new Set(fromProgrammes.map(v => v.charAt(0).toUpperCase() + v.slice(1)))];
  return unique.length ? unique : ARCHETYPES;
}

export function getBrandLanguages(settings) {
  const primary = String(settings?.brand?.language_primary || "EN").toLowerCase();
  const secondary = Array.isArray(settings?.brand?.languages_secondary)
    ? settings.brand.languages_secondary.map(l => String(l).toLowerCase())
    : ["fr", "es", "pt"];
  const keys = [...new Set([primary, ...secondary].filter(Boolean))];
  const known = Object.fromEntries(LANGS.map(l => [l.key, l]));
  return keys.map((key, index) => known[key] || {
    key,
    label: key.toUpperCase(),
    name: key.toUpperCase(),
    color: index === 0 ? "var(--t1)" : "var(--t2)",
  });
}

export function getBrandTaxonomy(settings) {
  return {
    name: getBrandName(settings),
    content_type: getBrandContentType(settings),
    voice: getBrandVoice(settings),
    avoid: getBrandAvoid(settings),
    programmes: getBrandProgrammes(settings),
    programme_map: getBrandProgrammeMap(settings),
    content_templates: getContentTemplates(settings),
    archetypes: getBrandArchetypes(settings),
    languages: getBrandLanguages(settings),
    eras: settings?.taxonomy?.eras || ERAS,
    subjects: settings?.taxonomy?.subjects || TEAMS,
    research_angles: settings?.taxonomy?.research_angles || RESEARCH_ANGLES,
    script_system: settings?.prompts?.script_system || SCRIPT_SYSTEM,
    closing_line: settings?.brand?.locked_elements?.[0] || "Because the score is never the whole story.",
  };
}

export function brandConfigForPrompt(settings) {
  const cfg = getBrandTaxonomy(settings);
  return {
    brand_name: cfg.name,
    content_type: cfg.content_type,
    voice: cfg.voice,
    avoid: cfg.avoid,
    programmes: cfg.programmes.map(p => ({ id: p.key, name: p.label, role: p.role, desc: p.desc, angles: p.angle_suggestions })),
    content_templates: cfg.content_templates,
    archetypes: cfg.archetypes,
    languages: cfg.languages.map(l => ({ key: l.key, label: l.label, name: l.name })),
    research_angles: cfg.research_angles,
    closing_line: cfg.closing_line,
  };
}

export function scriptFieldForLanguage(langKey) {
  const key = String(langKey || "en").toLowerCase();
  return key === "en" ? "script" : `script_${key}`;
}

export function getStoryScript(story, langKey = "en") {
  const key = String(langKey || "en").toLowerCase();
  if (!story) return "";
  if (story.scripts && typeof story.scripts === "object" && story.scripts[key]) return story.scripts[key];
  return story[scriptFieldForLanguage(key)] || "";
}

export function storyScriptPatch(langKey, text, story = {}) {
  const key = String(langKey || "en").toLowerCase();
  const legacyField = ["en", "fr", "es", "pt"].includes(key) ? { [scriptFieldForLanguage(key)]: text } : {};
  return {
    ...legacyField,
    scripts: {
      ...(story.scripts && typeof story.scripts === "object" ? story.scripts : {}),
      [key]: text,
    },
  };
}

export function getConfiguredLanguageKeys(settings) {
  return getBrandLanguages(settings).map(l => l.key);
}

export function hasAllConfiguredScripts(story, settings) {
  return getConfiguredLanguageKeys(settings).every(lang => !!getStoryScript(story, lang));
}

export function getAvailableStoryLanguages(story, settings) {
  return getBrandLanguages(settings).filter(lang => !!getStoryScript(story, lang.key));
}

export function subjectText(story) {
  if (!story) return "";
  if (Array.isArray(story.players)) return story.players.join(", ");
  return String(story.players || story.subjects || story.subject || "").trim();
}

export function subjectLabel(settings) {
  return settings?.taxonomy?.subject_label || "Subjects";
}
