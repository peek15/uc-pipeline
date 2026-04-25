export const STAGES = {
  accepted: { label: "New",       color: "var(--c-new)",       next: "approved"  },
  approved: { label: "Approved",  color: "var(--c-approved)",  next: "scripted"  },
  scripted: { label: "Scripted",  color: "var(--c-scripted)",  next: "produced"  },
  produced: { label: "Produced",  color: "var(--c-produced)",  next: "published" },
  published:{ label: "Published", color: "var(--c-published)", next: null        },
  rejected: { label: "Rejected",  color: "var(--c-rejected)",  next: null        },
  archived: { label: "Archived",  color: "var(--c-rejected)",  next: null        },
};

export const ARCHETYPES = ["Redemption","Rivalry","Sacrifice","Pressure","Loyalty","Betrayal","Underdog","Legacy","Heartbreak","Brotherhood"];

export const ACCENT = {
  Redemption:  "#4A9B7F",
  Rivalry:     "#C0666A",
  Sacrifice:   "#8B7EC8",
  Pressure:    "#C49A3C",
  Loyalty:     "#5B8FB9",
  Betrayal:    "#B87333",
  Underdog:    "#7B9E6B",
  Legacy:      "#9B7B6E",
  Heartbreak:  "#7B8FA8",
  Brotherhood: "#5BA8A0",
};

// ─── Content Formats ───
export const FORMATS = [
  { key: "standard",          label: "Standard",           color: "#C49A3C", desc: "NBA 2000s–present. Reach-leaning entry point." },
  { key: "classics",          label: "Classics",           color: "#4A9B7F", desc: "Pre-2000s NBA. Differentiator. Community-leaning." },
  { key: "performance_special",label: "Performance Special",color: "#C0666A", desc: "Historic games & records. Numbers hook, human story." },
  { key: "special_edition",   label: "Special Edition",    color: "#8B7EC8", desc: "Cultural moments. 3–4x/year max." },
];

export const FORMAT_MAP = Object.fromEntries(FORMATS.map(f => [f.key, f]));

// Auto-suggest format based on era
export function suggestFormat(era) {
  if (!era) return "standard";
  if (["1960s-70s","1980s","1990s"].includes(era)) return "classics";
  return "standard";
}

// ─── Hook Types ───
export const HOOK_TYPES = [
  { key: "statement",  label: "Statement",  desc: "Quiet confident assertion" },
  { key: "reframe",    label: "Reframe",    desc: "Known story, new angle" },
  { key: "contrast",   label: "Contrast",   desc: "Two opposing truths" },
  { key: "revelation", label: "Revelation", desc: "Something hidden revealed" },
  { key: "question",   label: "Question",   desc: "Opens a mystery" },
  { key: "cold_open",  label: "Cold Open",  desc: "Drop into the moment" },
];

// ─── Emotional Angles ───
export const EMOTIONAL_ANGLES = [
  "redemption","rivalry","sacrifice","legacy","shock",
  "resilience","loyalty","heartbreak","brotherhood","pressure","betrayal","underdog"
];

export const LANGS = [
  { key: "en", label: "EN", name: "English",    color: "var(--t1)" },
  { key: "fr", label: "FR", name: "French",     color: "var(--t2)" },
  { key: "es", label: "ES", name: "Spanish",    color: "var(--t2)" },
  { key: "pt", label: "PT", name: "Portuguese", color: "var(--t3)" },
];

export const HOOK_STYLES   = ["Question","Bold Claim","Mystery","Contrast","Direct Quote","Cold Open"];
export const PACING_OPTS   = ["Slow Build","Steady","Fast Cut","Climax Heavy","Even"];
export const MUSIC_OPTS    = ["Lo-fi Calm","Dramatic Build","Minimal/Ambient","Piano-led","Percussive","No Music"];
export const VISUAL_OPTS   = ["Press Photo Heavy","AI Scene Heavy","Mixed Balanced","Motion Graphic Heavy","Minimal"];
export const DURATION_OPTS = ["Under 40s","40-45s","45-50s","50-55s","Over 55s"];
export const POST_TIMES    = ["6-9 AM","9-12 PM","12-3 PM","3-6 PM","6-9 PM","9-12 AM"];
export const ERAS          = ["1960s-70s","1980s","1990s","2000s","2010s","2020s"];

export const TEAMS = ["Atlanta Hawks","Boston Celtics","Brooklyn Nets","Charlotte Hornets","Chicago Bulls","Cleveland Cavaliers","Dallas Mavericks","Denver Nuggets","Detroit Pistons","Golden State Warriors","Houston Rockets","Indiana Pacers","LA Clippers","Los Angeles Lakers","Memphis Grizzlies","Miami Heat","Milwaukee Bucks","Minnesota Timberwolves","New Orleans Pelicans","New York Knicks","Oklahoma City Thunder","Orlando Magic","Philadelphia 76ers","Phoenix Suns","Portland Trail Blazers","Sacramento Kings","San Antonio Spurs","Toronto Raptors","Utah Jazz","Washington Wizards"];

export const RESEARCH_ANGLES = [
  "untold stories behind famous NBA moments",
  "NBA player personal struggle overcome adversity",
  "NBA rivalry backstory tension human drama",
  "NBA draft night emotional stories overlooked players",
  "NBA playoff pressure clutch moment human story",
  "NBA trade heartbreak loyalty betrayal story",
  "NBA rookie year pressure expectations sacrifice",
  "NBA finals championship run untold sacrifice",
  "NBA career ending farewell emotional moment",
  "NBA bench player unexpected breakout game career high",
  "NBA injury comeback return emotional moment",
  "NBA undrafted player makes roster proves doubters wrong",
  "NBA game winning shot pressure missed shot redemption",
  "NBA All-Star snub motivation revenge season",
  "NBA single game scoring explosion unexpected hero",
  "NBA triple double rare stat line historic performance",
];

export const SCRIPT_SYSTEM = `You are Uncle Carter, a fictional sports storyteller in his early 50s. Calm, confident, warm, slightly mischievous.

RULES: 110-150 words. Short sentences. No exclamation marks, emojis, hashtags. No cliche sports phrases. 1-2 factual anchors. Human tension focus. End with exact line: "Because the score is never the whole story."

STRUCTURE:
(0) Start with "Forty seconds."
(1) HOOK: emotional intrigue
(2) CONTEXT: season, stakes, 2-3 sentences
(3) HUMAN TENSION: the heart
(4) THE MOMENT: understated
(5) MEANING: beyond the score
(6) CLOSING: "Because the score is never the whole story."

Pure script text only. No labels.`;

// ═══════════════════════════════════════════════════════════
// v3.8.0 — Production tab additions
// ═══════════════════════════════════════════════════════════

// ─── Production status state machine ───
// Per intelligence-layer-reference.md
export const PRODUCTION_STATUSES = [
  "idea",
  "scripted",
  "translated",
  "reviewed",
  "voice_generating",
  "voice_failed",
  "audio_ready",
  "visuals_generating",
  "visuals_failed",
  "visuals_ready",
  "visuals_selected",
  "assembly_ready",
  "assembled",
  "exported",
  "scheduled",
  "published",
];

// Statuses that make a story eligible for the Production tab queue
export const PRODUCTION_QUEUE_STATUSES = [
  "scripted",
  "translated",
  "reviewed",
  "voice_generating",
  "voice_failed",
  "audio_ready",
  "visuals_generating",
  "visuals_failed",
  "visuals_ready",
  "visuals_selected",
  "assembly_ready",
];

// Display labels for production status
export const PRODUCTION_STATUS_LABELS = {
  idea:               "Idea",
  scripted:           "Scripted",
  translated:         "Translated",
  reviewed:           "Reviewed",
  voice_generating:   "Voice generating",
  voice_failed:       "Voice failed",
  audio_ready:        "Audio ready",
  visuals_generating: "Visuals generating",
  visuals_failed:     "Visuals failed",
  visuals_ready:      "Visuals ready",
  visuals_selected:   "Visuals selected",
  assembly_ready:     "Assembly ready",
  assembled:          "Assembled",
  exported:           "Exported",
  scheduled:          "Scheduled",
  published:          "Published",
};

// ─── Asset library types ───
export const ASSET_TYPES = [
  { key: "intro",        label: "Intro" },
  { key: "outro",        label: "Outro" },
  { key: "transition",   label: "Transition" },
  { key: "broll",        label: "B-roll" },
  { key: "overlay",      label: "Overlay" },
  { key: "sfx",          label: "SFX" },
  { key: "voice_locked", label: "Voice (locked)" },
  { key: "music",        label: "Music" },
];

// ─── Production positions (used by asset-curator agent) ───
export const PRODUCTION_POSITIONS = [
  { key: "intro",        type: "intro",        position_intent: "opening", count: 1 },
  { key: "outro",        type: "outro",        position_intent: "closing", count: 1 },
  { key: "transition",   type: "transition",   position_intent: "any",     count: 2 },
  { key: "atmospheric",  type: "broll",        position_intent: "any",     count: 6 },
  { key: "licensed",     type: "broll",        position_intent: "any",     count: 6 },
  { key: "voice_locked", type: "voice_locked", position_intent: "closing", count: 1 },
];

// ─── Confidence thresholds (defaults — overridable in Settings later) ───
export const CONFIDENCE_DEFAULTS = {
  brief_author:    { auto_approve: 999, review_below: 0 }, // Stage 1 = always review
  asset_curator:   { auto_approve: 999, review_below: 0 },
  visual_ranker:   { auto_approve: 999, review_below: 0 },
  voice_producer:  { auto_approve: 999, review_below: 0 },
  assembly_author: { auto_approve: 999, review_below: 0 },
};

// Production tab eligibility — used by ProductionView
export const isInProductionQueue = (story) => {
  if (!story) return false;
  if (PRODUCTION_QUEUE_STATUSES.includes(story.production_status)) return true;
  // Also accept legacy "scripted" status (some stories may not yet have production_status)
  if (!story.production_status && story.status === "scripted") return true;
  if (!story.production_status && story.status === "produced")  return true;
  return false;
};
