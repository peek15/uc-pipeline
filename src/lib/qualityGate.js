import { FORMAT_MAP, suggestFormat } from "@/lib/constants";
import {
  contentAudience,
  contentChannel,
  contentObjective,
  getBrandProgrammeMap,
  getConfiguredLanguageKeys,
  getContentTemplate,
  getContentType,
  getStoryScript,
  subjectText,
} from "@/lib/brandConfig";

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

function fieldText(story, field) {
  const key = String(field || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const combined = [
    story.title,
    subjectText(story),
    story.angle,
    story.hook,
    story.statline,
    story.notes,
    contentObjective(story),
    contentAudience(story),
    contentChannel(story),
    story.campaign_name,
    story.deliverable_type,
    getStoryScript(story, "en"),
  ].join(" ");
  if (["subject", "subjects", "player", "players"].includes(key)) return subjectText(story);
  if (["angle", "positioning"].includes(key)) return story.angle;
  if (["hook", "opener"].includes(key)) return story.hook;
  if (["script", "copy", "caption", "press_copy", "email_copy", "landing_copy"].includes(key)) return getStoryScript(story, "en");
  if (["objective", "goal"].includes(key)) return contentObjective(story);
  if (["audience", "target_audience"].includes(key)) return contentAudience(story);
  if (["channel", "platform", "placement"].includes(key)) return contentChannel(story);
  if (["deliverable", "deliverable_type", "asset_type"].includes(key)) return story.deliverable_type;
  if (["campaign", "campaign_name"].includes(key)) return story.campaign_name;
  if (["cta", "call_to_action"].includes(key)) return /\b(shop|buy|book|sign up|subscribe|learn more|download|join|apply|register|visit|try|get started|contact)\b/i.test(combined) ? combined : "";
  if (["offer", "benefit", "value"].includes(key)) return /\b(save|free|launch|offer|benefit|helps?|get|new|because|so you can)\b/i.test(combined) ? combined : "";
  if (["proof", "reason", "evidence"].includes(key)) return /\b(proof|because|data|study|result|tested|trusted|used by|case|metric|number|%|\d+)\b/i.test(combined) ? combined : "";
  return story.metadata?.[key] || "";
}

function hasField(story, field) {
  return String(fieldText(story, field) || "").trim().length > 0;
}

function isProductionField(field) {
  const key = String(field || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return ["script", "copy", "caption", "press_copy", "email_copy", "landing_copy", "voice", "audio", "visuals", "assets", "assembly"].includes(key);
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
  const template = getContentTemplate(settings, story.content_template_id);
  const contentType = getContentType(story, settings);
  const objective = contentObjective(story);
  const audience = contentAudience(story);
  const channel = contentChannel(story);
  const deliverable = story.deliverable_type || template?.deliverable_type || "";
  const profile = qualityProfileFor(contentType, template, settings);

  const add = (severity, code, message, category = profile.category) => issues.push({ severity, code, message, category });

  if (!title) add("blocker", "missing_title", "Missing title.");
  if (title && title.length < 10) add("warning", "short_title", "Title is very short.");
  if (title && title.length > 95) add("warning", "long_title", "Title may be too long for scanning.");
  if (!format || !(programmeMap[format] || FORMAT_MAP[format])) add("warning", "missing_format", "No valid programme assigned.");
  if (!story.content_template_id && template?.id) add("info", "template_inferred", `Using default template: ${template.name}.`, "template");
  if (!contentType) add("warning", "missing_content_type", "No content type assigned.", "template");

  if (profile.needsSubject && !subject) add("warning", "missing_subject", "No subject listed.");
  if (profile.needsArchetype && !story.archetype) add("warning", "missing_archetype", "No archetype selected.");
  if (profile.needsEra && !story.era) add("warning", "missing_era", "No era selected.");
  if (profile.needsObjective && !objective) add("warning", "missing_objective", "No objective set.", "positioning");
  if (profile.needsAudience && !audience) add("warning", "missing_audience", "No target audience set.", "positioning");
  if (profile.needsChannel && !channel) add("warning", "missing_channel", "No channel or platform set.", "distribution");
  if (profile.needsDeliverable && !deliverable) add("warning", "missing_deliverable", "No deliverable type set.", "production");

  if (!angle || angle.length < profile.minAngle) add("warning", "weak_angle", profile.angleMessage);
  if (angle && angle.length > 520) add("warning", "long_angle", "Angle is long; tighten before scripting.");
  if (profile.needsHook && !hook) add("warning", "missing_hook", "Missing hook.");
  if (hook && hook.length < 18) add("warning", "short_hook", "Hook may be too thin.");
  if (hook && hook.length > 170) add("warning", "long_hook", "Hook may be too long for short-form.");
  if (hook && title && hook.toLowerCase() === title.toLowerCase()) add("warning", "hook_matches_title", "Hook repeats the title.");
  if (profile.needsFact && !hasFactualAnchor(story, settings)) add("warning", "missing_fact", profile.factMessage);
  for (const field of profile.requiredFields) {
    if (isProductionField(field) && !story.scheduled_date && !["scripted", "produced", "published"].includes(story.status)) continue;
    if (!hasField(story, field)) add("warning", `missing_${String(field).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, `Missing template field: ${field}.`, "template");
  }
  runProfileChecks({ story, add, contentType, objective, audience, channel, deliverable, angle, hook, script, template, scheduledIn });
  if (story.score_total != null && Number(story.score_total) < 60) add("warning", "low_score", "AI score is below 60.");
  if (story.reach_score != null && Number(story.reach_score) < 35) add("warning", "low_reach", "Reach score is low.", "positioning");
  if (story.emotional_angle && angle && !angle.toLowerCase().includes(String(story.emotional_angle).toLowerCase())) {
    add("info", "angle_label_not_explicit", "Emotional angle is not explicit in the angle text.", "positioning");
  }

  if (scheduledIn != null && scheduledIn >= 0 && scheduledIn <= 14) {
    if (profile.needsScript && !script) add("warning", "scheduled_without_script", `Scheduled within 14 days but missing ${profile.scriptLabel}.`, "production");
    if (script && profile.minScriptWords && wordCount(script) < profile.minScriptWords) add("warning", "short_script", `${profile.scriptLabel} may be too short for this template.`, "production");
    if (script && profile.maxScriptWords && wordCount(script) > profile.maxScriptWords) add("warning", "long_script", `${profile.scriptLabel} may be too long for this template.`, "production");
    if (languageKeys.includes("pt") && getStoryScript(story, "pt") && !story.pt_review_cleared) add("warning", "pt_review_pending", "Portuguese script needs review before publishing.", "production");
    if (!channel && scheduledIn <= 7) add("info", "missing_platform", "Scheduled soon without a platform target.", "distribution");
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
    profile: profile.key,
    template_id: template?.id || null,
    content_type: contentType,
    blockerCount,
    warningCount,
    infoCount,
    score,
    issues,
  };
}

function qualityProfileFor(contentType, template, settings = null) {
  const type = String(template?.content_type || contentType || "narrative").toLowerCase();
  const templateFields = Array.isArray(template?.required_fields) ? template.required_fields : [];
  const base = {
    key: type,
    category: "content",
    requiredFields: templateFields,
    needsSubject: true,
    needsArchetype: false,
    needsEra: false,
    needsObjective: true,
    needsAudience: true,
    needsChannel: true,
    needsDeliverable: true,
    needsHook: true,
    needsFact: false,
    needsScript: true,
    minAngle: 28,
    minScriptWords: 40,
    maxScriptWords: 260,
    scriptLabel: "copy",
    angleMessage: "Angle needs clearer positioning.",
    factMessage: "No clear factual anchor found.",
  };
  if (type === "narrative") {
    return applyCustomProfile({
      ...base,
      category: "story",
      needsArchetype: true,
      needsEra: true,
      needsObjective: false,
      needsAudience: false,
      needsChannel: false,
      needsDeliverable: false,
      needsFact: true,
      minAngle: 35,
      minScriptWords: 90,
      maxScriptWords: 260,
      scriptLabel: "script",
      angleMessage: "Angle needs a clearer human tension.",
      factMessage: "No clear factual anchor found.",
    }, type, settings);
  }
  if (type === "ad") {
    return applyCustomProfile({ ...base, key: "ad", category: "conversion", minAngle: 20, minScriptWords: 25, maxScriptWords: 180, angleMessage: "Ad angle needs a clearer offer, pain point, or promise." }, type, settings);
  }
  if (type === "publicity") {
    return applyCustomProfile({ ...base, key: "publicity", category: "publicity", needsAudience: false, needsFact: true, minAngle: 24, minScriptWords: 35, maxScriptWords: 320, angleMessage: "Publicity angle needs clearer news value.", factMessage: "No clear news/date/factual anchor found." }, type, settings);
  }
  if (type === "product_post") {
    return applyCustomProfile({ ...base, key: "product_post", category: "product", minAngle: 22, minScriptWords: 25, maxScriptWords: 220, angleMessage: "Product angle needs a clearer benefit or use case." }, type, settings);
  }
  if (type === "educational") {
    return applyCustomProfile({ ...base, key: "educational", category: "education", needsFact: false, minAngle: 26, minScriptWords: 50, maxScriptWords: 320, angleMessage: "Educational angle needs a clearer lesson or takeaway." }, type, settings);
  }
  if (type === "community") {
    return applyCustomProfile({ ...base, key: "community", category: "community", needsDeliverable: false, minAngle: 20, minScriptWords: 20, maxScriptWords: 180, angleMessage: "Community angle needs a clearer participation prompt." }, type, settings);
  }
  return applyCustomProfile(base, type, settings);
}

function applyCustomProfile(profile, type, settings) {
  const custom = settings?.quality_gate?.profiles?.[type];
  if (!custom || typeof custom !== "object") return profile;
  return { ...profile, ...custom };
}

function runProfileChecks({ story, add, contentType, objective, audience, channel, deliverable, angle, hook, script, scheduledIn }) {
  const text = [story.title, angle, hook, script, story.notes].join(" ");
  const type = String(contentType || "").toLowerCase();
  if (type === "ad") {
    if (!/\b(shop|buy|book|sign up|subscribe|learn more|download|join|apply|register|visit|try|get started|contact)\b/i.test(text)) {
      add("warning", "missing_cta", "Ad is missing a clear call to action.", "conversion");
    }
    if (!/\b(proof|because|result|tested|trusted|used by|case|metric|number|%|\d+)\b/i.test(text)) {
      add("info", "missing_proof", "Ad could use stronger proof or evidence.", "conversion");
    }
  }
  if (type === "publicity") {
    if (!/\b(launch|announce|new|release|opens?|available|partnership|event|date|today|this week|202\d)\b/i.test(text)) {
      add("warning", "missing_news_value", "Publicity asset needs clearer news value.", "publicity");
    }
  }
  if (type === "product_post") {
    if (!/\b(benefit|helps?|feature|use|problem|solution|because|so you can|for teams|for creators)\b/i.test(text)) {
      add("warning", "missing_product_benefit", "Product content needs a clearer benefit or use case.", "product");
    }
  }
  if (type === "educational") {
    if (!/\b(learn|how to|why|framework|steps?|guide|lesson|mistake|example|takeaway)\b/i.test(text)) {
      add("warning", "missing_teaching_point", "Educational content needs a clearer teaching point.", "education");
    }
  }
  if (type === "community") {
    if (!/\b(comment|reply|vote|share|tell us|which|what would you|join|tag)\b/i.test(text)) {
      add("warning", "missing_participation_prompt", "Community content needs a clearer participation prompt.", "community");
    }
  }
  if (scheduledIn != null && scheduledIn <= 7 && !channel && !story.platform_target) {
    add("info", "scheduled_without_channel", "Scheduled soon without a channel.", "distribution");
  }
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
