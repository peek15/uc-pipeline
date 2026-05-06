import { FORMAT_MAP, suggestFormat } from "@/lib/constants";

function words(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlapScore(a, b) {
  const aw = new Set(words(a));
  const bw = new Set(words(b));
  if (!aw.size || !bw.size) return 0;
  let overlap = 0;
  for (const w of aw) if (bw.has(w)) overlap++;
  return overlap / Math.min(aw.size, bw.size);
}

function hasFactualAnchor(story) {
  const text = [story.title, story.angle, story.hook, story.statline, story.era].join(" ");
  return /\b(19|20)\d{2}\b/.test(text) || /\b\d+(\.\d+)?\b/.test(text) || /\bfinals?|playoffs?|draft|trade|injury|rookie|mvp|all-star\b/i.test(text);
}

export function auditStoryQuality(story, existingStories = []) {
  const issues = [];
  const title = String(story.title || "").trim();
  const hook = String(story.hook || "").trim();
  const angle = String(story.angle || "").trim();
  const players = Array.isArray(story.players) ? story.players.join(", ") : String(story.players || "").trim();
  const format = story.format || suggestFormat(story.era);

  const add = (severity, code, message) => issues.push({ severity, code, message });

  if (!title) add("blocker", "missing_title", "Missing title.");
  if (title && title.length < 10) add("warning", "short_title", "Title is very short.");
  if (!players) add("warning", "missing_players", "No player or subject listed.");
  if (!story.archetype) add("warning", "missing_archetype", "No archetype selected.");
  if (!story.era) add("warning", "missing_era", "No era selected.");
  if (!format || !FORMAT_MAP[format]) add("warning", "missing_format", "No valid format assigned.");
  if (!angle || angle.length < 35) add("warning", "weak_angle", "Angle needs a clearer human tension.");
  if (!hook) add("warning", "missing_hook", "Missing hook.");
  if (hook && hook.length < 18) add("warning", "short_hook", "Hook may be too thin.");
  if (hook && hook.length > 170) add("warning", "long_hook", "Hook may be too long for short-form.");
  if (!hasFactualAnchor(story)) add("warning", "missing_fact", "No clear factual anchor found.");
  if (story.score_total != null && Number(story.score_total) < 60) add("warning", "low_score", "AI score is below 60.");

  const duplicates = existingStories.filter(s => s.id !== story.id && String(s.title || "").trim().toLowerCase() === title.toLowerCase());
  if (duplicates.length) add("blocker", "duplicate_title", "Exact duplicate title already exists.");

  const similar = existingStories
    .filter(s => s.id !== story.id && s.title)
    .map(s => ({ title: s.title, score: overlapScore(title, s.title) }))
    .filter(s => s.score >= 0.72)
    .sort((a, b) => b.score - a.score)[0];
  if (similar) add("warning", "similar_title", `Very similar to: ${similar.title}`);

  const blockerCount = issues.filter(i => i.severity === "blocker").length;
  const warningCount = issues.filter(i => i.severity !== "blocker").length;

  return {
    ok: blockerCount === 0 && warningCount === 0,
    canAdd: blockerCount === 0,
    blockerCount,
    warningCount,
    issues,
  };
}

export function auditStoriesQuality(stories, existingStories = []) {
  return stories.map(story => ({ story, gate: auditStoryQuality(story, existingStories) }));
}

