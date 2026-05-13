const FIELD_DEFINITIONS = [
  {
    key: "company",
    label: "Brand/company",
    required: true,
    keywords: ["company", "brand", "about", "founded", "we are"],
  },
  {
    key: "priority_offer",
    label: "Priority offer",
    required: true,
    keywords: ["service", "services", "product", "offer", "solution", "platform", "we help"],
  },
  {
    key: "audience",
    label: "Priority audience",
    required: true,
    keywords: ["customer", "customers", "client", "clients", "audience", "teams", "businesses", "brands", "for "],
  },
  {
    key: "content_goal",
    label: "Content goal",
    required: true,
    keywords: ["goal", "growth", "leads", "awareness", "trust", "education", "retention", "conversion"],
  },
  {
    key: "platforms",
    label: "Target platforms",
    required: false,
    keywords: ["linkedin", "instagram", "youtube", "tiktok", "newsletter", "social"],
  },
  {
    key: "tone_style",
    label: "Tone/style",
    required: false,
    keywords: ["tone", "voice", "style", "premium", "friendly", "technical", "clear"],
  },
  {
    key: "sensitive_claims",
    label: "Claims/risk guidance",
    required: false,
    keywords: ["claim", "risk", "guarantee", "compliance", "regulated", "medical", "finance", "legal"],
  },
  {
    key: "asset_rights",
    label: "Asset rights",
    required: true,
    keywords: ["rights", "permission", "licensed", "own", "allowed"],
  },
];

export function buildOnboardingPlan({
  intake = {},
  facts = {},
  confidence = null,
  clarifications = [],
  researchedSource = null,
  factMemory = {},
  existingSettings = {},
} = {}) {
  const evidenceMap = buildFactEvidenceMap({ intake, researchedSource });
  const fieldStates = FIELD_DEFINITIONS.map(definition => {
    const value = facts[definition.key] || fallbackValue(definition.key, facts, existingSettings);
    const evidence = evidenceMap[definition.key] || [];
    const reviewed = factMemory[definition.key]?.status || null;
    const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
    const sourceConfidence = reviewed === "confirmed" || reviewed === "edited"
      ? "confirmed"
      : evidence.length >= 2
        ? "sourced"
        : hasValue
          ? "inferred"
          : "missing";
    return {
      key: definition.key,
      label: definition.label,
      required: definition.required,
      value: normalizeValue(value),
      status: hasValue ? sourceConfidence : "missing",
      confidence: fieldConfidence({ hasValue, evidence, reviewed }),
      evidence,
      reviewed_status: reviewed,
    };
  });

  const requiredMissing = fieldStates.filter(field => field.required && field.status === "missing");
  const uncertainRequired = fieldStates.filter(field => field.required && ["inferred", "low"].includes(field.confidence));
  const sourceSummary = summarizeSourceCoverage({ intake, researchedSource });
  const nextAction = choosePlannerAction({
    fieldStates,
    clarifications,
    confidence,
    researchedSource,
    intake,
  });

  return {
    planner_version: "2026-05-13.1",
    current_goal: nextAction.goal,
    stage: nextAction.stage,
    next_action: nextAction,
    field_states: fieldStates,
    missing_required: requiredMissing.map(field => field.key),
    uncertain_required: uncertainRequired.map(field => field.key),
    fact_evidence: evidenceMap,
    source_coverage: sourceSummary,
    draft_readiness: {
      ready: nextAction.type === "draft_strategy" || nextAction.type === "review_then_draft",
      score: confidence?.score || 0,
      blockers: requiredMissing.map(field => field.label),
      needs_confirmation: uncertainRequired.map(field => field.label),
    },
    clarification_queue: (clarifications || []).slice(0, 3).map(question => ({
      key: question.key,
      question: question.question,
      rationale: question.rationale || rationaleForQuestion(question.key),
      required: Boolean(question.required),
    })),
    guardrails: [
      "Ask only the highest-leverage missing question next.",
      "Prefer sourced or confirmed facts over guesses.",
      "Show uncertainty before drafting final strategy.",
      "Never save final strategy before explicit approval.",
    ],
  };
}

export function buildFactEvidenceMap({ intake = {}, researchedSource = null } = {}) {
  const candidates = [];
  if (intake.websiteUrl) {
    candidates.push({
      source_type: "website",
      title: intake.websiteUrl,
      source_url: intake.websiteUrl,
      text: intake.websiteUrl,
      confidence: "stored",
    });
  }
  if (intake.notes) {
    candidates.push({
      source_type: "text_note",
      title: "Pasted notes",
      text: intake.notes,
      confidence: "parsed",
    });
  }
  for (const file of intake.files || []) {
    candidates.push({
      source_type: file.mime_type || "file",
      title: file.name,
      text: file.text || file.summary || file.note || "",
      confidence: file.status || "stored",
    });
  }
  for (const page of researchedSource?.source_pages || []) {
    candidates.push({
      source_type: "website_page",
      title: page.title || page.url,
      source_url: page.url,
      text: page.summary || "",
      confidence: page.status || researchedSource.confidence || "read",
    });
  }
  for (const snippet of researchedSource?.evidence_snippets || []) {
    candidates.push({
      source_type: "website_evidence",
      title: snippet.source_url || researchedSource.url || "Website evidence",
      source_url: snippet.source_url || researchedSource.url,
      text: snippet.text || "",
      confidence: researchedSource.confidence || "read",
    });
  }

  const map = {};
  for (const definition of FIELD_DEFINITIONS) {
    const evidence = [];
    for (const candidate of candidates) {
      const text = String(candidate.text || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const lower = text.toLowerCase();
      const matched = definition.key === "company"
        ? candidate.source_type === "website" || definition.keywords.some(keyword => lower.includes(keyword))
        : definition.keywords.some(keyword => lower.includes(keyword));
      if (!matched) continue;
      evidence.push({
        source_type: candidate.source_type,
        title: candidate.title,
        source_url: candidate.source_url || null,
        excerpt: pickExcerpt(text, definition.keywords),
        confidence: candidate.confidence,
      });
      if (evidence.length >= 4) break;
    }
    map[definition.key] = evidence;
  }
  return map;
}

function choosePlannerAction({ fieldStates, clarifications, confidence, researchedSource, intake }) {
  const score = confidence?.score || 0;
  const missing = fieldStates.filter(field => field.required && field.status === "missing");
  const uncertain = fieldStates.filter(field => field.required && ["inferred", "low"].includes(field.confidence));
  const hasSource = Boolean(intake.websiteUrl || intake.notes || (intake.files || []).some(file => file.text) || researchedSource?.url);

  if (!hasSource) {
    return {
      type: "collect_source",
      stage: "collecting_sources",
      goal: "Get one trustworthy source or useful business description",
      label: "Ask for source",
      description: "Ask for the official website, pasted notes, or a short offer/audience description.",
      question: clarifications?.[0]?.question || "What does the business sell, and who is it for?",
      confidence: "low",
    };
  }
  if (missing.length) {
    const next = clarifications?.find(question => missing.some(field => field.key === question.key)) || clarifications?.[0];
    return {
      type: "ask_missing_required",
      stage: "clarifying",
      goal: "Resolve the highest-impact missing setup field",
      label: "Ask one clarification",
      description: next?.rationale || `Ask for ${missing[0].label.toLowerCase()}.`,
      question: next?.question || `Can you confirm the ${missing[0].label.toLowerCase()}?`,
      field_key: next?.key || missing[0].key,
      confidence: "medium",
    };
  }
  if (score < 55 || uncertain.length) {
    return {
      type: "review_then_draft",
      stage: "review_understanding",
      goal: "Confirm inferred facts before strategy drafting",
      label: "Review understanding",
      description: "Show inferred facts with uncertainty and ask for confirmation before drafting.",
      question: clarifications?.[0]?.question || "Do these inferred facts look right enough for a first strategy draft?",
      confidence: "medium",
    };
  }
  return {
    type: "draft_strategy",
    stage: "ready_to_draft",
    goal: "Prepare a first strategy draft for user approval",
    label: "Draft setup pass",
    description: "Draft Brand Profile, Content Strategy, Programmes, risk guidance, and first ideas for review.",
    confidence: score >= 75 ? "high" : "medium",
  };
}

function summarizeSourceCoverage({ intake, researchedSource }) {
  const sources = [];
  if (researchedSource?.url) {
    sources.push({
      type: researchedSource.discovery === "search" ? "web_lookup" : "website",
      title: researchedSource.url,
      status: researchedSource.status || "stored",
      confidence: researchedSource.confidence || "low",
      pages_read: (researchedSource.source_pages || []).filter(page => page.status === "read").length,
    });
  } else if (intake.websiteUrl) {
    sources.push({ type: "website", title: intake.websiteUrl, status: "stored", confidence: "low", pages_read: 0 });
  }
  if (intake.notes) sources.push({ type: "text_note", title: "Pasted notes", status: "parsed", confidence: "medium" });
  for (const file of intake.files || []) {
    sources.push({ type: file.mime_type || "file", title: file.name, status: file.status || "stored", confidence: file.text ? "medium" : "low" });
  }
  return {
    sources,
    has_readable_source: sources.some(source => ["read", "parsed"].includes(source.status) || source.pages_read > 0),
    limitations: [
      ...(!researchedSource?.url && intake.websiteUrl ? ["Website URL is stored but no readable page text was confirmed."] : []),
      ...((intake.files || []).filter(file => !file.text && /pdf|image/i.test(file.mime_type || file.name || "")).length ? ["Some uploaded files are stored but not deeply parsed."] : []),
    ],
  };
}

function fieldConfidence({ hasValue, evidence, reviewed }) {
  if (reviewed === "confirmed" || reviewed === "edited") return "high";
  if (reviewed === "rejected" || reviewed === "unsure") return "low";
  if (!hasValue) return "missing";
  if ((evidence || []).length >= 2) return "high";
  if ((evidence || []).length === 1) return "medium";
  return "low";
}

function fallbackValue(key, facts, existingSettings) {
  if (key === "company") return existingSettings?.brand?.name;
  if (key === "priority_offer") return facts.products_services || existingSettings?.brand?.products_services;
  if (key === "audience") return existingSettings?.brand?.target_audience;
  return "";
}

function normalizeValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return value;
  return String(value || "").trim();
}

function rationaleForQuestion(key) {
  if (key === "priority_offer") return "Programmes need one priority offer to anchor the first content system.";
  if (key === "audience") return "Audience changes tone, examples, platforms, and CTA strategy.";
  if (key === "content_goal") return "The content strategy needs one first business outcome.";
  if (key === "asset_rights") return "Rights confirmation is required before saving strategy based on provided materials.";
  return "This is the next highest-impact uncertainty.";
}

function pickExcerpt(text, keywords = []) {
  const sentences = String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
  const picked = sentences.find(sentence => {
    const lower = sentence.toLowerCase();
    return keywords.some(keyword => lower.includes(keyword));
  }) || sentences[0] || text;
  return truncate(picked, 260);
}

function truncate(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}...`;
}
