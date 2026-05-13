export function critiqueOnboardingDraft({ draft = {}, planner = {}, facts = {} } = {}) {
  const issues = [];
  const improvements = [];
  const assumptions = [...(draft.assumptions || [])];

  if (isGeneric(draft.brand_profile?.short_description)) {
    issues.push(issue("brand_profile", "Brand description is still generic.", "medium"));
    improvements.push("Make the brand description more specific before approval.");
  }

  if (!draft.brand_profile?.products_services || /to be confirmed/i.test(draft.brand_profile.products_services)) {
    issues.push(issue("brand_profile", "Priority offer is missing or still marked for confirmation.", "high"));
  }

  if (!draft.brand_profile?.target_audience || /to be confirmed/i.test(draft.brand_profile.target_audience)) {
    issues.push(issue("brand_profile", "Priority audience is missing or still marked for confirmation.", "high"));
  }

  const programmes = draft.programmes || [];
  const programmeNames = programmes.map(programme => normalize(programme.name));
  if (new Set(programmeNames).size !== programmeNames.length) {
    issues.push(issue("programmes", "Programme names contain duplicates.", "medium"));
    improvements.push("Deduplicate programmes or merge overlapping content jobs.");
  }
  if (programmes.length < 3) {
    issues.push(issue("programmes", "Fewer than three recommended programmes were generated.", "medium"));
  }
  for (const programme of programmes) {
    if (!programme.goal || !programme.audience || !(programme.platforms || []).length || !(programme.formats || []).length) {
      issues.push(issue("programmes", `${programme.name || "Programme"} is missing goal, audience, platforms, or formats.`, "medium"));
    }
  }

  const unsupportedClaims = detectUnsupportedClaims(draft);
  for (const claim of unsupportedClaims) {
    issues.push(issue("claims", claim, "high"));
  }

  const citations = draft.source_citations || [];
  const sourcedFields = new Set(citations.map(citation => citation.field_key));
  for (const key of ["priority_offer", "audience"]) {
    if (!sourcedFields.has(key) && facts[key]) {
      assumptions.push({
        field_key: key,
        label: key.replace(/_/g, " "),
        status: "inferred",
        confidence: "low",
        note: `${key.replace(/_/g, " ")} is inferred without a direct source citation.`,
      });
    }
  }

  const plannerBlockers = planner.draft_readiness?.blockers || [];
  for (const blocker of plannerBlockers) {
    issues.push(issue("readiness", `${blocker} remains a draft blocker.`, "high"));
  }

  const score = Math.max(0, 100 - issues.reduce((total, item) => total + (item.severity === "high" ? 18 : item.severity === "medium" ? 10 : 4), 0));
  return {
    score,
    status: issues.some(item => item.severity === "high") ? "needs_review" : issues.length ? "review_recommended" : "clear",
    issues: dedupeIssues(issues).slice(0, 12),
    improvements: [...new Set(improvements)].slice(0, 8),
    assumptions: dedupeAssumptions(assumptions).slice(0, 10),
  };
}

export function applyCriticToDraft(draft = {}, critic = {}) {
  const next = {
    ...draft,
    assumptions: critic.assumptions || draft.assumptions || [],
    quality_review: critic,
  };

  if (critic.issues?.some(item => item.category === "claims")) {
    next.risk_checklist = [
      ...(draft.risk_checklist || []),
      "Review unsupported claims and replace broad promises with sourced, specific language.",
    ].filter(Boolean);
  }

  if (critic.status !== "clear") {
    next.content_strategy = {
      ...(draft.content_strategy || {}),
      approval_note: "This strategy includes assumptions or unresolved risks that should be reviewed before final use.",
    };
  }

  return next;
}

function detectUnsupportedClaims(draft) {
  const text = JSON.stringify(draft || {}).toLowerCase();
  const risky = [
    ["guarantee", "Draft includes guarantee-like language that may need substantiation."],
    ["guaranteed", "Draft includes guarantee-like language that may need substantiation."],
    ["best", "Draft may include superiority language that needs evidence."],
    ["#1", "Draft may include ranking language that needs evidence."],
    ["roi", "Draft may include ROI/performance claims that need evidence."],
    ["double", "Draft may include quantified performance claims that need evidence."],
  ];
  return [...new Set(risky.filter(([needle]) => text.includes(needle)).map(([, message]) => message))];
}

function issue(category, message, severity) {
  return { category, message, severity };
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter(item => {
    const key = `${item.category}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeAssumptions(assumptions) {
  const seen = new Set();
  return assumptions.filter(item => {
    const key = item.field_key || item.label || item.note;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isGeneric(value) {
  const text = String(value || "").toLowerCase();
  return !text || text.includes("your brand") || text.includes("to be confirmed") || text.length < 45;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
