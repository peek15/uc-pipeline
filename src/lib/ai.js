import { ARCHETYPES, SCRIPT_SYSTEM } from "./constants";

// ─── AI STORY SCORER ───
// Returns a score 0-100 with breakdown
export function buildScorePrompt(story) {
  return `Rate this story idea for a 45-55 second Instagram Reel sports storytelling brand called "Uncle Carter." Score each dimension 0-25, then total 0-100.

Story: "${story.title}"
Players: ${story.players || "Unknown"}
Era: ${story.era || "Unknown"}
Archetype: ${story.archetype || "Unknown"}
Angle: ${story.angle || "No angle provided"}
Hook: ${story.hook || "No hook provided"}

Score these 4 dimensions:
1. EMOTIONAL DEPTH (0-25): Is there genuine human tension, conflict, sacrifice, or transformation? Generic "player overcame adversity" = low. Specific, layered human dilemma = high.
2. OBSCURITY (0-25): How fresh is this? Everyone knows = 0-5. Known but angle is fresh = 10-15. Genuinely obscure = 20-25.
3. VISUAL POTENTIAL (0-25): Can an editor find press photos and create compelling visuals? Specific moment with identifiable players = high. Abstract concept = low.
4. HOOK STRENGTH (0-25): Would someone stop scrolling for this? Bland = low. Intriguing mystery/tension = high.

Respond ONLY with JSON: {"emotional": N, "obscurity": N, "visual": N, "hook": N, "total": N, "note": "1 sentence on biggest strength or weakness"}`;
}

export function parseScoreResponse(text) {
  try {
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    let parsed = null;
    try { parsed = JSON.parse(clean); } catch {}
    if (!parsed) {
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    if (parsed && typeof parsed.total === "number") return parsed;
    return null;
  } catch { return null; }
}

// ─── SMART CALENDAR AUTO-FILL ───
export function autoFillWeek(stories, days) {
  const ready = stories.filter(s =>
    ["approved", "scripted", "produced"].includes(s.status) && !s.scheduled_date
  );

  if (!ready.length) return [];

  // Score each story for scheduling priority
  const scored = ready.map(s => {
    let priority = 0;
    // Prefer stories with scripts ready
    if (s.script) priority += 20;
    // Prefer stories with all translations
    if (s.script_fr && s.script_es && s.script_pt) priority += 15;
    // Prefer higher AI scores
    if (s.ai_score) priority += Math.min(s.ai_score / 5, 20);
    // Prefer higher obscurity
    priority += (s.obscurity || 3) * 3;
    return { ...s, priority };
  }).sort((a, b) => b.priority - a.priority);

  // Get already scheduled archetypes this week
  const weekArchetypes = days.flatMap(d =>
    stories.filter(s => s.scheduled_date === d.toISOString().split("T")[0]).map(s => s.archetype)
  ).filter(Boolean);

  const assignments = [];
  const usedArchetypes = [...weekArchetypes];
  const today = new Date().toISOString().split("T")[0];

  for (const day of days) {
    const dateStr = day.toISOString().split("T")[0];
    // Skip past days and already filled days
    if (dateStr < today) continue;
    if (stories.some(s => s.scheduled_date === dateStr)) continue;

    // Find best story for this day (maximize archetype variety)
    let best = null;
    let bestScore = -1;

    for (const s of scored) {
      if (assignments.some(a => a.id === s.id)) continue;
      let score = s.priority;
      // Bonus if archetype hasn't been used this week
      if (!usedArchetypes.includes(s.archetype)) score += 25;
      // Small penalty for recently used archetypes
      const recentCount = usedArchetypes.filter(a => a === s.archetype).length;
      score -= recentCount * 10;

      if (score > bestScore) { bestScore = score; best = s; }
    }

    if (best) {
      assignments.push({ id: best.id, date: dateStr });
      usedArchetypes.push(best.archetype);
    }
  }

  return assignments;
}

// ─── BATCH SCRIPT GENERATION PROMPTS ───
export function buildScriptPrompt(story) {
  return `${SCRIPT_SYSTEM}\n\n---\n\nWrite an Uncle Carter episode script about:\nStory: ${story.angle || story.title}\nPlayer(s): ${story.players || "Unknown"}\nEra: ${story.era || "Unknown"}\nEmotional angle: ${story.archetype || "Pressure"}\n\n110-150 words. Pure script only.`;
}

export function buildTranslatePrompt(script, langName) {
  return `Translate this Uncle Carter sports storytelling script to ${langName}. Keep the same tone: calm, warm, storytelling uncle by a fireplace. Translate "Forty seconds." and the closing line naturally. Same structure, same rhythm. 110-150 words.\n\nReturn ONLY the translated script.\n\nOriginal:\n${script}`;
}

// ─── ELEVENLABS EXPORT ───
export function generateVoicePack(story) {
  const files = [];
  const slug = (story.title || "untitled").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
  const id = story.id?.substring(0, 8) || "000";

  if (story.script) files.push({ name: `UC-${id}_${slug}_EN.txt`, content: story.script });
  if (story.script_fr) files.push({ name: `UC-${id}_${slug}_FR.txt`, content: story.script_fr });
  if (story.script_es) files.push({ name: `UC-${id}_${slug}_ES.txt`, content: story.script_es });
  if (story.script_pt) files.push({ name: `UC-${id}_${slug}_PT.txt`, content: story.script_pt });

  return files;
}

// Download multiple text files as individual downloads
export function downloadVoicePack(story) {
  const files = generateVoicePack(story);
  for (const f of files) {
    const blob = new Blob([f.content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = f.name;
    a.click();
  }
  return files.length;
}

// ─── READINESS SCORE ───
export function getReadinessScore(story) {
  const checks = {
    script: !!story.script,
    fr: !!story.script_fr,
    es: !!story.script_es,
    pt: !!story.script_pt,
    scheduled: !!story.scheduled_date,
    scored: !!story.ai_score,
  };
  const done = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  return { checks, done, total, percent: Math.round((done / total) * 100) };
}

// ─── KEYBOARD SHORTCUTS ───
export const SHORTCUTS = {
  "n": "Next tab",
  "p": "Previous tab",
  "a": "Approve selected / Accept all",
  "g": "Generate script",
  "f": "Focus search",
  "Escape": "Close modal",
};
