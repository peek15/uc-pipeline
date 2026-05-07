import { FORMAT_MAP, suggestFormat } from "@/lib/constants";
import { getBrandProgrammeMap, getConfiguredLanguageKeys, getStoryScript, subjectText } from "@/lib/brandConfig";

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

function hasFactualAnchor(story, settings = null) {
  const text = [story.title, story.angle, story.hook, story.statline, story.era].join(" ");
  const configured = settings?.quality_gate?.factual_anchor_terms;
  const terms = Array.isArray(configured) && configured.length
    ? configured
    : ["final", "playoff", "draft", "trade", "injury", "rookie", "mvp", "all-star"];
  const escaped = terms.map(t => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return /\b(19|20)\d{2}\b/.test(text) || /\b\d+(\.\d+)?\b/.test(text) || (escaped ? new RegExp(`\\b(${escaped})s?\\b`, "i").test(text) : false);
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const date = new Date(dateValue);
  date.setHours(0,0,0,0);
  return Math.round((date - today) / 86400000);
}

export function auditStoryQuality(story, existingStories = [], settings = null) {
  const issues = [];
  const title = String(story.title || "").trim();
  const hook = String(story.hook || "").trim();
  const angle = String(story.angle || "").trim();
  const script = String(getStoryScript(story, "en") || "").trim();
  const subject = subjectText(story);
  const format = story.format || suggestFormat(story.era);
  const programmeMap = getBrandProgrammeMap(settings);
  const scheduledIn = daysUntil(story.scheduled_date);
  const languageKeys = getConfiguredLanguageKeys(settings);

  const add = (severity, code, message, category = "story") => issues.push({ severity, code, message, category });

  if (!title) add("blocker", "missing_title", "Missing title.");
  if (title && title.length < 10) add("warning", "short_title", "Title is very short.");
  if (title && title.length > 95) add("warning", "long_title", "Title may be too long for scanning.");
  if (!subject) add("warning", "missing_subject", "No subject listed.");
  if (!story.archetype) add("warning", "missing_archetype", "No archetype selected.");
  if (!story.era) add("warning", "missing_era", "No era selected.");
  if (!format || !(programmeMap[format] || FORMAT_MAP[format])) add("warning", "missing_format", "No valid programme assigned.");
  if (!angle || angle.length < 35) add("warning", "weak_angle", "Angle needs a clearer human tension.");
  if (angle && angle.length > 520) add("warning", "long_angle", "Angle is long; tighten before scripting.");
  if (!hook) add("warning", "missing_hook", "Missing hook.");
  if (hook && hook.length < 18) add("warning", "short_hook", "Hook may be too thin.");
  if (hook && hook.length > 170) add("warning", "long_hook", "Hook may be too long for short-form.");
  if (hook && title && hook.toLowerCase() === title.toLowerCase()) add("warning", "hook_matches_title", "Hook repeats the title.");
  if (!hasFactualAnchor(story, settings)) add("warning", "missing_fact", "No clear factual anchor found.");
  if (story.score_total != null && Number(story.score_total) < 60) add("warning", "low_score", "AI score is below 60.");
  if (story.reach_score != null && Number(story.reach_score) < 35) add("warning", "low_reach", "Reach score is low.", "positioning");
  if (story.emotional_angle && angle && !angle.toLowerCase().includes(String(story.emotional_angle).toLowerCase())) {
    add("info", "angle_label_not_explicit", "Emotional angle is not explicit in the angle text.", "positioning");
  }

  if (scheduledIn != null && scheduledIn >= 0 && scheduledIn <= 14) {
    if (!script) add("warning", "scheduled_without_script", "Scheduled within 14 days but missing script.", "production");
    if (script && wordCount(script) < 90) add("warning", "short_script", "Script may be too short for production.", "production");
    if (script && wordCount(script) > 260) add("warning", "long_script", "Script may be too long for short-form production.", "production");
    if (languageKeys.includes("pt") && getStoryScript(story, "pt") && !story.pt_review_cleared) add("warning", "pt_review_pending", "Portuguese script needs review before publishing.", "production");
    if (!story.platform_target && scheduledIn <= 7) add("info", "missing_platform", "Scheduled soon without a platform target.", "distribution");
  }

  const duplicates = existingStories.filter(s => s.id !== story.id && String(s.title || "").trim().toLowerCase() === title.toLowerCase());
  if (duplicates.length) add("blocker", "duplicate_title", "Exact duplicate title already exists.");

  const similar = existingStories
    .filter(s => s.id !== story.id && s.title)
    .map(s => ({ title: s.title, score: overlapScore(title, s.title) }))
    .filter(s => s.score >= 0.72)
    .sort((a, b) => b.score - a.score)[0];
  if (similar) add("warning", "similar_title", `Very similar to: ${similar.title}`);

  const blockerCount = issues.filter(i => i.severity === "blocker").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const infoCount = issues.filter(i => i.severity === "info").length;
  const score = Math.max(0, 100 - blockerCount * 40 - warningCount * 10 - infoCount * 3);

  return {
    ok: blockerCount === 0 && warningCount === 0,
    canAdd: blockerCount === 0,
    blockerCount,
    warningCount,
    infoCount,
    score,
    issues,
  };
}

export function qualityGatePatch(gate, checkedAt = new Date()) {
  return {
    quality_gate: gate,
    quality_gate_status: gate.blockerCount > 0 ? "blocked" : gate.warningCount > 0 ? "warnings" : "passed",
    quality_gate_blockers: gate.blockerCount,
    quality_gate_warnings: gate.warningCount,
    quality_gate_checked_at: checkedAt.toISOString(),
  };
}

export function auditStoriesQuality(stories, existingStories = [], settings = null) {
  return stories.map(story => ({ story, gate: auditStoryQuality(story, existingStories, settings) }));
}
