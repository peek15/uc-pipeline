export const ONBOARDING_STATUSES = [
  "not_started",
  "collecting_sources",
  "analyzing_sources",
  "needs_clarification",
  "draft_ready",
  "approved",
  "skipped",
  "archived",
];

export const ONBOARDING_MODES = ["workspace_setup", "brand_setup", "strategy_refresh"];

export function blankOnboardingIntake() {
  return {
    websiteUrl: "",
    notes: "",
    manual: {
      brandName: "",
      priorityOffer: "",
      audience: "",
      goal: "",
      platforms: [],
      formats: [],
      toneAvoid: "",
      sensitiveClaims: "",
      assetRights: "",
    },
    files: [],
  };
}

export function hasApprovedStrategy(settings) {
  return Boolean(settings?.onboarding?.strategy_approved_at || settings?.strategy?.strategy_approved_at);
}

export function shouldPromptOnboarding(settings) {
  if (hasApprovedStrategy(settings)) return false;
  const brand = settings?.brand || {};
  const strategy = settings?.strategy || {};
  const hasCoreBrand = Boolean(
    brand.name &&
    (brand.short_description || brand.products_services) &&
    brand.target_audience
  );
  const hasStrategy = Boolean(
    strategy.content_goals &&
    (strategy.target_platforms || []).length &&
    (strategy.programmes || []).length
  );
  return !(hasCoreBrand && hasStrategy);
}

export function scoreUnderstanding(facts = {}) {
  const checks = [
    ["Offer understood", facts.priority_offer || facts.products_services],
    ["Audience likely identified", facts.audience],
    ["Tone detected", facts.tone_style],
    ["Content goal known", facts.content_goal],
    ["Platforms selected", (facts.platforms || []).length],
    ["Claims need confirmation", facts.sensitive_claims || facts.claims_risks],
  ];
  const passed = checks.filter(([, ok]) => Boolean(ok)).length;
  const score = Math.round((passed / checks.length) * 100);
  return {
    score,
    signals: checks.map(([label, ok]) => ({ label, ok: Boolean(ok) })),
  };
}

export function inferFactsFromIntake(intake = {}, existingSettings = {}) {
  const notes = `${intake.notes || ""}\n${Object.values(intake.manual || {}).flat().join("\n")}`.trim();
  const manual = intake.manual || {};
  const brand = existingSettings?.brand || {};
  const strategy = existingSettings?.strategy || {};
  const text = notes.toLowerCase();
  const platforms = unique([
    ...(manual.platforms || []),
    ...["Instagram", "LinkedIn", "YouTube", "TikTok", "Newsletter"].filter(p => text.includes(p.toLowerCase())),
    ...(strategy.target_platforms || []),
  ]);
  const formats = unique([
    ...(manual.formats || []),
    ...["Short video", "Carousel", "Newsletter", "Case study", "Founder post"].filter(f => text.includes(f.toLowerCase().split(" ")[0])),
  ]);
  const websiteHost = safeHost(intake.websiteUrl);
  const facts = {
    company: manual.brandName || brand.name || websiteHost || "",
    website: intake.websiteUrl || "",
    priority_offer: manual.priorityOffer || firstNonEmptyLine(notes, ["offer", "service", "product"]) || brand.products_services || "",
    products_services: manual.priorityOffer || brand.products_services || "",
    audience: manual.audience || firstNonEmptyLine(notes, ["audience", "customer", "client", "for "]) || brand.target_audience || "",
    content_goal: manual.goal || strategy.content_goals || "",
    platforms,
    formats,
    tone_style: brand.voice || firstNonEmptyLine(notes, ["tone", "voice", "style"]) || "",
    tone_avoid: manual.toneAvoid || brand.avoid || "",
    sensitive_claims: manual.sensitiveClaims || strategy.claims_to_use_carefully || "",
    asset_rights: manual.assetRights || "",
    source_summary: summarizeSources(intake),
  };
  return facts;
}

export function buildClarifications(facts = {}) {
  const questions = [];
  if (!facts.priority_offer) questions.push({
    key: "priority_offer",
    question: "What product or service should Creative Engine prioritize first?",
    question_type: "free_text",
    options: [],
    required: true,
  });
  if (!facts.audience) questions.push({
    key: "audience",
    question: "Who is the priority audience for the first content strategy?",
    question_type: "choice_plus_other",
    options: ["Existing customers", "New prospects", "Partners", "Community/fans", "I'm not sure — suggest for me"],
    required: true,
  });
  if (!facts.content_goal) questions.push({
    key: "content_goal",
    question: "What is the main goal for content right now?",
    question_type: "single_choice",
    options: ["Build trust", "Generate leads", "Grow reach", "Educate the market", "Support retention", "I'm not sure — suggest for me"],
    required: true,
  });
  if (!(facts.platforms || []).length) questions.push({
    key: "platforms",
    question: "Which platforms should the strategy target first?",
    question_type: "multi_choice",
    options: ["Instagram", "LinkedIn", "YouTube", "TikTok", "Newsletter", "I'm not sure — suggest for me"],
    required: false,
  });
  if (!facts.tone_avoid) questions.push({
    key: "tone_avoid",
    question: "Are there tones, claims, or subjects Creative Engine should avoid?",
    question_type: "free_text",
    options: [],
    required: false,
  });
  if (!facts.asset_rights) questions.push({
    key: "asset_rights",
    question: "Do you confirm you have the right to use the uploaded or pasted materials for strategy drafting?",
    question_type: "confirmation",
    options: ["Yes", "No", "Not sure"],
    required: true,
  });
  return questions;
}

export function applyClarificationAnswers(facts = {}, answers = {}) {
  const next = { ...facts };
  for (const [key, value] of Object.entries(answers || {})) {
    if (Array.isArray(value)) {
      next[key] = value.includes("I'm not sure — suggest for me")
        ? suggestedValueFor(key, facts)
        : value;
    } else if (value === "I'm not sure — suggest for me") {
      next[key] = suggestedValueFor(key, facts);
    } else if (value) {
      next[key] = value;
    }
  }
  return next;
}

export function buildDraftStrategy(facts = {}, existingSettings = {}) {
  const brandName = facts.company || existingSettings?.brand?.name || "Your brand";
  const platforms = (facts.platforms || []).length ? facts.platforms : ["LinkedIn", "Instagram"];
  const formats = (facts.formats || []).length ? facts.formats : ["Short video", "Carousel", "Text post"];
  const audience = facts.audience || "Primary customers, to be confirmed";
  const offer = facts.priority_offer || facts.products_services || "Priority offer to be confirmed";
  const goal = facts.content_goal || "Build trust and create a steady content pipeline";
  const programmes = [
    {
      id: "onboarding_explainers",
      name: "Proof-led Explainers",
      description: `Educational content that connects ${offer} to concrete audience problems.`,
      goal,
      audience,
      platforms,
      formats: formats.slice(0, 3),
      cadence: "1-2x per week",
      why_this_works: "It creates a reliable base of useful, low-claim content while the team learns what performs.",
      role: "balanced",
      weight: 40,
      active: true,
    },
    {
      id: "onboarding_trust",
      name: "Trust Signals",
      description: "Customer proof, process transparency, FAQs, and behind-the-scenes credibility content.",
      goal: "Reduce buyer uncertainty",
      audience,
      platforms,
      formats: ["Case study", "Carousel", "Short video"],
      cadence: "Weekly",
      why_this_works: "It gives Creative Engine safer evidence-based material without inventing claims.",
      role: "community",
      weight: 35,
      active: true,
    },
    {
      id: "onboarding_opinion",
      name: "Point of View",
      description: "Opinion and category-shaping posts anchored in the brand's expertise.",
      goal: "Build recognition and recall",
      audience,
      platforms,
      formats: ["Founder post", "Short video", "Newsletter"],
      cadence: "Weekly",
      why_this_works: "It turns the strategy into a recognizable editorial stance instead of generic posting.",
      role: "reach",
      weight: 25,
      active: true,
    },
  ];
  const alternatives = [
    { name: "Product Deep Dives", goal: "Support consideration", platforms, formats: ["Demo", "Carousel"], cadence: "Bi-weekly", why_this_works: "Useful once product priorities are clearer." },
    { name: "Community Questions", goal: "Increase feedback loops", platforms, formats: ["Q&A", "Poll"], cadence: "Weekly", why_this_works: "Good when audience uncertainty is still high." },
  ];
  const firstIdeas = Array.from({ length: 10 }, (_, i) => ({
    id: `idea_${i + 1}`,
    title: ideaTitle(i, offer, audience),
    programme: programmes[i % programmes.length].name,
    platform: platforms[i % platforms.length],
    format: formats[i % formats.length] || "Post",
    note: "Draft idea from onboarding. Review facts, claims, and rights before production.",
  }));
  return {
    brand_profile: {
      name: brandName,
      short_description: `${brandName} helps ${audience} with ${offer}.`,
      products_services: offer,
      target_audience: audience,
      voice: facts.tone_style || "Clear, useful, commercially grounded, and specific.",
      avoid: facts.tone_avoid || "Unsupported claims, invented proof, legal or platform-sensitive promises.",
    },
    content_strategy: {
      content_goals: goal,
      target_platforms: platforms,
      content_pillars: ["Education", "Trust", "Point of view"],
      key_messages: `Connect ${offer} to real customer needs. Use evidence and clear next steps.`,
      preferred_angles: "Practical, source-backed, audience-first, and concrete.",
      avoid_angles: facts.tone_avoid || "Overpromising, vague trend-chasing, or unsupported performance claims.",
      calls_to_action: "Learn more, book a call, ask a question, or review the offer.",
      claims_to_use_carefully: facts.sensitive_claims || "ROI, guarantees, testimonials, before/after comparisons, and regulated claims.",
      compliance_sensitivities: "User must verify claims, rights, approvals, platform rules, and legal compliance before publishing.",
    },
    programmes,
    alternatives,
    risk_checklist: [
      "Confirm rights for uploaded files, notes, images, and examples.",
      "Verify claims before publishing or using in ads.",
      "Do not imply customer outcomes unless documented and approved.",
      "Check platform rules for sensitive categories and ad claims.",
    ],
    first_content_ideas: firstIdeas,
  };
}

export function mergeDraftIntoSettings(settings = {}, draft = {}) {
  const next = JSON.parse(JSON.stringify(settings || {}));
  next.brand = { ...(next.brand || {}), ...(draft.brand_profile || {}) };
  next.strategy = {
    ...(next.strategy || {}),
    ...(draft.content_strategy || {}),
    programmes: (draft.programmes || []).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      color: "#4A9B7F",
      role: p.role || "balanced",
      weight: p.weight || 25,
      active: p.active !== false,
      cadence: p.cadence,
      platforms: p.platforms || [],
      tone: next.brand?.voice || "",
      example_topics: p.why_this_works || "",
      avoid_topics: next.brand?.avoid || "",
      target_audience_desc: p.audience || "",
      primary_goal: p.goal || "",
      angle_suggestions: p.formats || [],
      custom_fields: [],
    })),
    strategy_approved_at: new Date().toISOString(),
  };
  next.strategy_recommendations = [
    ...(next.strategy_recommendations || []),
    ...(draft.first_content_ideas || []).map(idea => ({
      id: idea.id,
      type: "content_idea",
      title: idea.title,
      rationale: idea.note,
      target_audience: draft.brand_profile?.target_audience || "",
      platforms: [idea.platform].filter(Boolean),
      formats: [idea.format].filter(Boolean),
      priority: "medium",
      status: "suggested",
      created_by: "onboarding",
      created_at: new Date().toISOString(),
    })),
  ];
  next.onboarding = {
    ...(next.onboarding || {}),
    strategy_approved_at: new Date().toISOString(),
    last_session_status: "approved",
  };
  return next;
}

function firstNonEmptyLine(text, hints) {
  const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.find(line => hints.some(h => line.toLowerCase().includes(h))) || "";
}

function safeHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function unique(values) {
  return [...new Set((values || []).map(v => String(v || "").trim()).filter(Boolean))];
}

function summarizeSources(intake) {
  const parts = [];
  if (intake.websiteUrl) parts.push(`Website URL provided: ${intake.websiteUrl}. V1 stores the URL but does not run open-web research.`);
  if (intake.notes) parts.push("Pasted notes were used for deterministic extraction.");
  if ((intake.files || []).length) {
    const parsed = intake.files.filter(f => f.text).map(f => f.name);
    const pending = intake.files.filter(f => !f.text).map(f => f.name);
    if (parsed.length) parts.push(`Text files parsed: ${parsed.join(", ")}.`);
    if (pending.length) parts.push(`Files accepted but not analyzed yet: ${pending.join(", ")}.`);
  }
  return parts.join(" ");
}

function suggestedValueFor(key) {
  if (key === "audience") return "New prospects";
  if (key === "content_goal") return "Build trust";
  if (key === "platforms") return ["LinkedIn", "Instagram"];
  if (key === "asset_rights") return "Not sure";
  return "";
}

function ideaTitle(i, offer, audience) {
  const templates = [
    `The most common misconception about ${offer}`,
    `A practical checklist for ${audience}`,
    `What to ask before choosing ${offer}`,
    `How ${offer} fits into a better workflow`,
    `Three signs your current approach is costing time`,
    `A transparent look at our process`,
    `Customer question: when is ${offer} worth it?`,
    `What good looks like before you buy`,
    `A simple explainer for first-time buyers`,
    `What we would avoid in this category`,
  ];
  return templates[i] || `Content idea ${i + 1}`;
}
