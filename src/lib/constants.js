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
  Redemption: "var(--t1)", Rivalry: "var(--t1)", Sacrifice: "var(--t2)", Pressure: "var(--t1)",
  Loyalty: "var(--t2)", Betrayal: "var(--t1)", Underdog: "var(--t2)", Legacy: "var(--t2)",
  Heartbreak: "var(--t1)", Brotherhood: "var(--t2)",
};

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
