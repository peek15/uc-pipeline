// ═══════════════════════════════════════════════════════════
// shortcuts.js — Keyboard shortcut registry + cross-platform helpers.
// v3.11.4
//
// Single source of truth for every shortcut in the app.
// Renders correct labels per platform (Mac vs Windows/Linux).
// Provides one matcher function used by every keydown handler.
//
// Conventions:
//   "mod"   = Cmd on Mac, Ctrl on Win/Linux (matches metaKey || ctrlKey)
//   "alt"   = Option on Mac, Alt on Win/Linux
//   "shift" = Shift on both
// ═══════════════════════════════════════════════════════════

export function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
}

const SYMBOLS_MAC = {
  mod: "⌘", alt: "⌥", shift: "⇧", ctrl: "⌃",
  enter: "↵", arrow_up: "↑", arrow_down: "↓",
  arrow_left: "←", arrow_right: "→",
  backspace: "⌫", space: "Space", escape: "Esc", tab: "Tab",
  separator: "",
};

const SYMBOLS_WIN = {
  mod: "Ctrl", alt: "Alt", shift: "Shift", ctrl: "Ctrl",
  enter: "Enter", arrow_up: "↑", arrow_down: "↓",
  arrow_left: "←", arrow_right: "→",
  backspace: "Backspace", space: "Space", escape: "Esc", tab: "Tab",
  separator: "+",
};

function symbols() { return isMac() ? SYMBOLS_MAC : SYMBOLS_WIN; }

/**
 * Match a keyboard event against a combo definition.
 * Combo: { mod?: bool, alt?: bool, shift?: bool, key: string }
 * Note: matching uses === for modifiers — extra modifiers fail the match,
 * so { mod, key: "z" } won't match Cmd+Shift+Z.
 */
export function matches(e, combo) {
  if (!combo || !e) return false;
  const wantMod   = !!combo.mod;
  const wantAlt   = !!combo.alt;
  const wantShift = !!combo.shift;
  const hasMod    = !!(e.metaKey || e.ctrlKey);
  const hasAlt    = !!e.altKey;
  const hasShift  = !!e.shiftKey;
  if (hasMod   !== wantMod)   return false;
  if (hasAlt   !== wantAlt)   return false;
  if (hasShift !== wantShift) return false;
  const key = combo.key.toLowerCase();
  if (e.key.toLowerCase() === key) return true;
  // On Mac, Option/Alt changes e.key for letter/digit keys (e.g. Alt+T → "†").
  // Fall back to e.code (physical key) so Alt+letter combos work cross-platform.
  if (wantAlt && key.length === 1) {
    if (/[a-z]/.test(key)) return e.code === `Key${key.toUpperCase()}`;
    if (/[0-9]/.test(key)) return e.code === `Digit${key}`;
  }
  return false;
}

/**
 * Should a handler skip because user is typing? Single source of truth.
 */
export function shouldIgnoreFromInput() {
  if (typeof document === "undefined") return false;
  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return true;
  if (document.activeElement?.isContentEditable) return true;
  return false;
}

// Keys where shift is already implied by the character — don't render ⇧ prefix.
const SHIFT_IMPLIED = new Set(["?", "!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "_", "+", "{", "}", "|", ":", '"', "<", ">", "~"]);

export function renderCombo(combo) {
  if (!combo) return "";
  const s = symbols();
  const parts = [];
  if (combo.mod)   parts.push(s.mod);
  if (combo.alt)   parts.push(s.alt);
  if (combo.shift && !SHIFT_IMPLIED.has(combo.key)) parts.push(s.shift);
  parts.push(renderKey(combo.key, s));
  return parts.join(s.separator);
}

function renderKey(key, s) {
  const k = key.toLowerCase();
  if (k === "arrowup")    return s.arrow_up;
  if (k === "arrowdown")  return s.arrow_down;
  if (k === "arrowleft")  return s.arrow_left;
  if (k === "arrowright") return s.arrow_right;
  if (k === "enter")      return s.enter;
  if (k === "backspace")  return s.backspace;
  if (k === " " || k === "space") return s.space;
  if (k === "escape")     return s.escape;
  if (k === "tab")        return s.tab;
  if (key.length === 1) return key.toUpperCase();
  return key;
}

// ═══════════════════════════════════════════════════════════
// SHORTCUT REGISTRY
// ═══════════════════════════════════════════════════════════

export const SHORTCUTS = {
  // Global
  toggleSettings:     { combo: { mod: true, key: "," },           description: "Open / close Settings",          group: "Global" },
  showShortcuts:      { combo: { shift: true, key: "?" },          description: "Show this cheat sheet",          group: "Global" },
  undo:               { combo: { mod: true, key: "z" },           description: "Undo last action",               group: "Global" },
  productionShortcut: { combo: { alt: true, key: "j" },           description: "Smart jump to Research",         group: "Global" },
  sidebarToggle:      { combo: { mod: true, key: "\\" },          description: "Collapse / expand sidebar",      group: "Global" },
  agentToggle:        { combo: { mod: true, alt: true, key: "a" }, description: "Toggle agent panel",            group: "Global" },

  // Navigation — Ctrl+1–5 in Chrome (Cmd is intercepted for browser tabs)
  tabPipeline:   { combo: { mod: true, key: "1" }, description: "Go to Stories",  hint: "Ctrl+1 in Chrome", group: "Navigation" },
  tabResearch:   { combo: { mod: true, key: "2" }, description: "Go to Research", hint: "Ctrl+2 in Chrome", group: "Navigation" },
  tabCreate:     { combo: { mod: true, key: "3" }, description: "Go to Create",   hint: "Ctrl+3 in Chrome", group: "Navigation" },
  tabCalendar:   { combo: { mod: true, key: "4" }, description: "Go to Schedule", hint: "Ctrl+4 in Chrome", group: "Navigation" },
  tabAnalyze:    { combo: { mod: true, key: "5" }, description: "Go to Insights", hint: "Ctrl+5 in Chrome", group: "Navigation" },

  // Section cycling
  tabPrev: { combo: { alt: true, key: "ArrowLeft" },  description: "Previous section", group: "Navigation" },
  tabNext: { combo: { alt: true, key: "ArrowRight" }, description: "Next section",     group: "Navigation" },

  // Create workflow
  createModePrev: { combo: { alt: true, shift: true, key: "ArrowLeft" },  description: "Previous Create step", group: "Create" },
  createModeNext: { combo: { alt: true, shift: true, key: "ArrowRight" }, description: "Next Create step",     group: "Create" },

  // Pipeline (no-modifier nav, plus modified actions)
  pipelineDown:      { combo: { key: "ArrowDown" },                          description: "Next story",                 group: "Pipeline" },
  pipelineUp:        { combo: { key: "ArrowUp" },                            description: "Previous story",             group: "Pipeline" },
  pipelineExpand:    { combo: { key: "ArrowRight" },                         description: "Expand story",               group: "Pipeline" },
  pipelineCollapse:  { combo: { key: "ArrowLeft" },                          description: "Collapse story",             group: "Pipeline" },
  pipelineSelect:    { combo: { key: " " },                                  description: "Toggle selection",           group: "Pipeline" },
  pipelineOpen:      { combo: { key: "Enter" },                              description: "Open story detail",          group: "Pipeline" },
  pipelineSelectAll: { combo: { mod: true, key: "e" },                       description: "Select all visible",         group: "Pipeline" },
  pipelineApprove:   { combo: { mod: true, key: "Enter" },                   description: "Approve focused / selected", group: "Pipeline" },
  pipelineReject:    { combo: { mod: true, key: "Backspace" },               description: "Reject focused / selected",  group: "Pipeline" },
  pipelineSubTabPrev:{ combo: { alt: true, shift: true, key: "ArrowLeft" },  description: "Previous Pipeline sub-tab",  group: "Pipeline" },
  pipelineSubTabNext:{ combo: { alt: true, shift: true, key: "ArrowRight" }, description: "Next Pipeline sub-tab",      group: "Pipeline" },

  // Script
  scriptDown:      { combo: { key: "ArrowDown" },        description: "Next story",                                  group: "Script" },
  scriptUp:        { combo: { key: "ArrowUp" },          description: "Previous story",                              group: "Script" },
  scriptExpand:    { combo: { key: "ArrowRight" },       description: "Expand story",                                group: "Script" },
  scriptCollapse:  { combo: { key: "ArrowLeft" },        description: "Collapse story",                              group: "Script" },
  scriptToggle:    { combo: { key: " " },                description: "Toggle expand",                               group: "Script" },
  scriptGenerate:  { combo: { alt: true, key: "g" },     description: "Generate script for focused story",           group: "Script" },
  scriptTranslate: { combo: { alt: true, key: "t" },     description: "Translate configured languages",              group: "Script" },
  scriptCopy:      { combo: { mod: true, key: "c" },     description: "Copy current language script (when expanded)", group: "Script" },

  // Production
  productionDown:    { combo: { alt: true, key: "ArrowDown" },      description: "Next queued story",       group: "Production" },
  productionUp:      { combo: { alt: true, key: "ArrowUp" },        description: "Previous queued story",   group: "Production" },
  productionBrief:   { combo: { mod: true, key: "b" },              description: "Generate visual brief",   group: "Production" },
  productionVoice:   { combo: { mod: true, shift: true, key: "v" }, description: "Generate voice (EN)",     group: "Production" },
  productionVisual:  { combo: { alt: true, key: "i" },              description: "Generate visuals",        group: "Production" },
  productionApprove: { combo: { mod: true, key: "Enter" },          description: "Approve current section", group: "Production" },

  // Calendar
  calendarAutoFill: { combo: { alt: true, key: "p" }, description: "Preview auto-fill calendar slots", group: "Calendar" },

  // Detail Modal
  detailPrev:  { combo: { key: "ArrowLeft" },  description: "Previous story",  group: "Detail Modal" },
  detailNext:  { combo: { key: "ArrowRight" }, description: "Next story",      group: "Detail Modal" },
  detailClose: { combo: { key: "Escape" },     description: "Close modal",     group: "Detail Modal" },
};

/**
 * Get shortcuts grouped for the cheat sheet.
 */
export function getGroupedShortcuts() {
  const groups = {};
  for (const [name, def] of Object.entries(SHORTCUTS)) {
    if (!groups[def.group]) groups[def.group] = [];
    groups[def.group].push({
      key: name,
      combo: def.combo,
      description: def.description,
      hint: def.hint || null,
      label: renderCombo(def.combo),
    });
  }
  const order = ["Global", "Navigation", "Create", "Pipeline", "Script", "Production", "Calendar", "Detail Modal"];
  return order.filter(g => groups[g]).map(g => ({ group: g, items: groups[g] }));
}
