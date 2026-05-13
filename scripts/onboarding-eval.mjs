import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const checks = [
  {
    name: "Company-name-only input is accepted as a starting point",
    file: "src/lib/ai/prompts/onboarding-chat.js",
    mustInclude: [
      "if the user gives only a company/brand name, accept it as a starting point",
      "never say \"that's not precise enough\"",
    ],
  },
  {
    name: "Agent follows explicit planner state",
    file: "src/lib/ai/prompts/onboarding-chat.js",
    mustInclude: [
      "follow Planner state",
      "collect_source",
      "ask_missing_required",
      "review_then_draft",
      "draft_strategy",
    ],
  },
  {
    name: "Planner produces draft readiness and field evidence",
    file: "src/lib/onboardingPlanner.js",
    mustInclude: [
      "draft_readiness",
      "field_states",
      "fact_evidence",
      "source_coverage",
    ],
  },
  {
    name: "Unsure answers use context-aware defaults",
    file: "src/lib/onboarding.js",
    mustInclude: [
      "export function suggestedValueFor",
      "Use the safest default",
      "B2B buyers and teams",
      "Not sure — do not rely on unverified assets",
    ],
  },
  {
    name: "PDF/image honesty is preserved",
    file: "src/lib/onboardingDocumentIntelligence.js",
    mustInclude: [
      "pdf-light",
      "pdf-light-failed",
      "OCR can run server-side if a vision provider is configured",
    ],
  },
  {
    name: "Analyze route stores citations and assumptions",
    file: "src/app/api/onboarding/analyze/route.js",
    mustInclude: [
      "source_citations",
      "assumptions",
      "metadata_json",
      "planner.fact_evidence",
    ],
  },
  {
    name: "Draft UI exposes evidence and assumptions",
    file: "src/app/onboarding/page.jsx",
    mustInclude: [
      "EvidenceAssumptionsCard",
      "Evidence and assumptions",
      "No detailed source trace is available for this draft",
    ],
  },
  {
    name: "Strategy critic is wired into draft generation",
    file: "src/app/api/onboarding/analyze/route.js",
    mustInclude: [
      "critiqueOnboardingDraft",
      "applyCriticToDraft",
      "quality_review",
    ],
  },
  {
    name: "Durable brand memory is written on approval",
    file: "src/app/api/onboarding/approve/route.js",
    mustInclude: [
      "attachBrandMemoryToSettings",
      "previousSettings",
      "approvedBy",
      "approvedAt",
    ],
  },
  {
    name: "Onboarding guardrails enforce V1 limits",
    file: "src/lib/onboardingGuardrails.js",
    mustInclude: [
      "maxAgentTurnsPerSession",
      "maxResearchJobsPerSession",
      "maxSourcesPerSession",
      "onboardingPrivacyNotice",
    ],
  },
  {
    name: "Research jobs support enqueue and processing",
    file: "src/lib/onboardingResearchJobs.js",
    mustInclude: [
      "enqueueOnboardingResearchJob",
      "processQueuedOnboardingResearchJobs",
      "queued",
      "retrying",
    ],
  },
  {
    name: "OCR provider status is explicit",
    file: "src/lib/onboardingOcrProvider.js",
    mustInclude: [
      "getOnboardingOcrProviderStatus",
      "OPENAI_API_KEY",
      "openai_vision",
      "requires_ocr",
      "No OCR/vision provider is configured",
      "runOpenAiVisionOcr",
    ],
  },
  {
    name: "Onboarding source intake can route transient image OCR",
    file: "src/app/api/onboarding/source/route.js",
    mustInclude: [
      "runOnboardingOcr",
      "image_base64",
      "ocr_extracted",
      "ocr_gateway",
    ],
  },
];

let failures = 0;

for (const check of checks) {
  const text = read(check.file);
  const missing = check.mustInclude.filter(needle => !text.includes(needle));
  if (missing.length) {
    failures += 1;
    console.error(`FAIL ${check.name}`);
    for (const needle of missing) console.error(`  missing: ${needle}`);
  } else {
    console.log(`PASS ${check.name}`);
  }
}

if (failures) {
  console.error(`\n${failures} onboarding eval check${failures === 1 ? "" : "s"} failed.`);
  process.exit(1);
}

console.log("\nOnboarding eval checks passed.");

if (process.env.ONBOARDING_EVAL_BASE_URL) {
  await runLiveEval();
}

function read(file) {
  return readFileSync(join(root, file), "utf8");
}

async function runLiveEval() {
  const baseUrl = process.env.ONBOARDING_EVAL_BASE_URL.replace(/\/$/, "");
  const token = process.env.ONBOARDING_EVAL_TOKEN;
  const workspaceId = process.env.ONBOARDING_EVAL_WORKSPACE_ID;
  const brandProfileId = process.env.ONBOARDING_EVAL_BRAND_PROFILE_ID;
  const sessionId = process.env.ONBOARDING_EVAL_SESSION_ID;
  if (!token || !workspaceId || !sessionId) {
    console.log("\nSkipping live onboarding eval: set ONBOARDING_EVAL_TOKEN, ONBOARDING_EVAL_WORKSPACE_ID, and ONBOARDING_EVAL_SESSION_ID.");
    return;
  }

  const cases = [
    {
      name: "company name only",
      message: "I own company Acme Analytics.",
      expectAny: ["working brand", "Acme", "website", "official"],
      rejectAny: ["not precise enough", "insufficient information"],
    },
    {
      name: "weak input",
      message: "test",
      expectAny: ["website", "business", "source", "describe"],
      rejectAny: ["draft strategy", "approved", "saved"],
    },
  ];

  let liveFailures = 0;
  for (const item of cases) {
    const res = await fetch(`${baseUrl}/api/onboarding/agent-step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        brand_profile_id: brandProfileId || null,
        session_id: sessionId,
        intake: { websiteUrl: "", notes: "", manual: {}, files: [] },
        messages: [],
        user_message: item.message,
      }),
    });
    const json = await res.json().catch(() => ({}));
    const text = String(json.assistant_message || json.reply || "").toLowerCase();
    const expected = item.expectAny.some(needle => text.includes(needle.toLowerCase()));
    const rejected = item.rejectAny.some(needle => text.includes(needle.toLowerCase()));
    if (!res.ok || !expected || rejected) {
      liveFailures += 1;
      console.error(`LIVE FAIL ${item.name}`);
      console.error(`  status: ${res.status}`);
      console.error(`  reply: ${json.assistant_message || json.reply || json.error || "(none)"}`);
    } else {
      console.log(`LIVE PASS ${item.name}`);
    }
  }
  if (liveFailures) process.exit(1);
  console.log("Live onboarding eval checks passed.");
}
