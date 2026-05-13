import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scenarioPath = path.join(root, "evals/intelligence-runtime-scenarios.json");
const catalog = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));

let failures = 0;

runStaticChecks();

if (process.env.INTELLIGENCE_EVAL_BASE_URL) {
  await runLiveScenarios();
} else {
  console.log("Skipping live intelligence eval: set INTELLIGENCE_EVAL_BASE_URL plus token/workspace/session env vars.");
}

if (failures) {
  console.error(`\n${failures} intelligence runtime eval check${failures === 1 ? "" : "s"} failed.`);
  process.exit(1);
}

console.log("\nIntelligence runtime eval checks passed.");

function runStaticChecks() {
  check("Scenario catalog has a version", Boolean(catalog.version));
  check("Scenario catalog has at least five scenarios", (catalog.scenarios || []).length >= 5);
  check("Scenario catalog covers onboarding", catalog.scenarios.some(s => s.suite === "onboarding"));
  check("Scenario catalog covers gateway", catalog.scenarios.some(s => s.suite === "gateway"));
  check("Scenarios use auth-aware placeholders", JSON.stringify(catalog).includes("$workspace_id"));
  checkFile("Onboarding agent-step route delegates to chat route", "src/app/api/onboarding/agent-step/route.js", [
    "export { POST } from \"../chat/route\"",
  ]);
  checkFile("Onboarding chat route supports live agent-step eval", "src/app/api/onboarding/chat/route.js", [
    "buildOnboardingAgentStep",
    "return ok(payload)",
    "session_id",
  ]);
  checkFile("Gateway eval script is wired", "scripts/intelligence-gateway-eval.mjs", [
    "prepareGatewayPromptCall",
    "prepareGatewayMessageCall",
    "AI_GATEWAY_DAILY_COST_LIMIT_USD",
  ]);
  checkFile("Package exposes runtime eval", "package.json", [
    "\"eval:runtime\"",
    "scripts/intelligence-runtime-eval.mjs",
  ]);
}

async function runLiveScenarios() {
  const baseUrl = readEnv("INTELLIGENCE_EVAL_BASE_URL", true).replace(/\/$/, "");
  const token = readEnv("INTELLIGENCE_EVAL_TOKEN", true);
  const required = catalog.required_env || {};
  const values = {
    base_url: baseUrl,
    token,
    workspace_id: readEnv(required.workspace_id || "INTELLIGENCE_EVAL_WORKSPACE_ID", true),
    brand_profile_id: readEnv(required.brand_profile_id || "INTELLIGENCE_EVAL_BRAND_PROFILE_ID", false) || null,
    session_id: readEnv(required.session_id || "INTELLIGENCE_EVAL_SESSION_ID", true),
  };

  for (const scenario of catalog.scenarios || []) {
    await runLiveScenario({ scenario, baseUrl, token, values });
  }
}

async function runLiveScenario({ scenario, baseUrl, token, values }) {
  const body = resolvePlaceholders(scenario.body || {}, values);
  const res = await fetch(`${baseUrl}${scenario.path}`, {
    method: scenario.method || "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const expectedStatus = scenario.expect?.status || 200;
  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : await res.text();

  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  let passed = true;

  if (res.status !== expectedStatus) {
    passed = false;
    console.error(`LIVE FAIL ${scenario.id}: expected status ${expectedStatus}, got ${res.status}`);
  }

  for (const requiredPath of scenario.expect?.json_required_paths || []) {
    if (getPath(payload, requiredPath) == null) {
      passed = false;
      console.error(`LIVE FAIL ${scenario.id}: missing JSON path ${requiredPath}`);
    }
  }

  for (const [jsonPath, valuesAny] of Object.entries(scenario.expect?.json_contains_any || {})) {
    const value = String(getPath(payload, jsonPath) ?? "");
    if (!containsAny(value, valuesAny)) {
      passed = false;
      console.error(`LIVE FAIL ${scenario.id}: ${jsonPath} did not include any of ${valuesAny.join(", ")}`);
    }
  }

  for (const [jsonPath, valuesAny] of Object.entries(scenario.expect?.json_reject_any || {})) {
    const value = String(getPath(payload, jsonPath) ?? "");
    if (containsAny(value, valuesAny)) {
      passed = false;
      console.error(`LIVE FAIL ${scenario.id}: ${jsonPath} included rejected text`);
    }
  }

  if (scenario.expect?.text_contains_any && !containsAny(text, scenario.expect.text_contains_any)) {
    passed = false;
    console.error(`LIVE FAIL ${scenario.id}: response text did not include expected text`);
  }

  if (scenario.expect?.text_reject_any && containsAny(text, scenario.expect.text_reject_any)) {
    passed = false;
    console.error(`LIVE FAIL ${scenario.id}: response text included rejected text`);
  }

  if (passed) {
    console.log(`LIVE PASS ${scenario.id}`);
  } else {
    failures += 1;
    console.error(`  response: ${text.slice(0, 800)}`);
  }
}

function check(name, condition) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

function checkFile(name, file, needles) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const missing = needles.filter(needle => !text.includes(needle));
  check(name, missing.length === 0);
  for (const needle of missing) console.error(`  missing: ${needle}`);
}

function readEnv(name, required) {
  const value = process.env[name];
  if (required && !value) throw new Error(`Missing required env ${name}`);
  return value || "";
}

function resolvePlaceholders(value, values) {
  if (typeof value === "string" && value.startsWith("$")) {
    return values[value.slice(1)] ?? "";
  }
  if (Array.isArray(value)) return value.map(item => resolvePlaceholders(item, values));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolvePlaceholders(item, values)]));
  }
  return value;
}

function getPath(object, dottedPath) {
  if (!object || typeof object !== "object") return null;
  return dottedPath.split(".").reduce((current, key) => current?.[key], object);
}

function containsAny(value, needles) {
  const lower = String(value || "").toLowerCase();
  return (needles || []).some(needle => lower.includes(String(needle).toLowerCase()));
}
