import fs from "fs";
import path from "path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assertContains(file, content, needle, label = needle) {
  if (!content.includes(needle)) {
    throw new Error(`${file} is missing ${label}`);
  }
}

const gatewayFile = "src/lib/ai/gateway.js";
const runnerFile = "src/lib/ai/runner.js";
const gateway = read(gatewayFile);
const runner = read(runnerFile);

assertContains(gatewayFile, gateway, "preparePrivacyCheckedAI", "privacy gateway integration");
assertContains(gatewayFile, gateway, "prepareGatewayPromptCall", "prompt gateway preparation");
assertContains(gatewayFile, gateway, "prepareGatewayMessageCall", "message gateway preparation");
assertContains(gatewayFile, gateway, "getCostFieldsForTask", "task cost mapping");
assertContains(gatewayFile, gateway, "getRecommendedModelForTask", "model routing metadata");
assertContains(gatewayFile, gateway, "payload_hash", "payload hash logging");
assertContains(gatewayFile, gateway, "raw_prompt_logged: false", "raw prompt logging guard");
assertContains(gatewayFile, gateway, "workspace_missing_privacy_check_skipped", "legacy workspace fallback");

assertContains(runnerFile, runner, "prepareGatewayPromptCall", "gateway runner integration");
assertContains(runnerFile, runner, "gateway.logFields", "gateway log fields");
assertContains(runnerFile, runner, "gateway: gateway.metadata", "gateway response metadata");

const budgetFile = "src/lib/ai/gatewayBudget.js";
const budget = read(budgetFile);
assertContains(budgetFile, budget, "AI_GATEWAY_DAILY_COST_LIMIT_USD", "daily cost cap env");
assertContains(budgetFile, budget, "AI_GATEWAY_DAILY_CALL_LIMIT", "daily call cap env");
assertContains(budgetFile, budget, "budget_check_failed_open", "budget fail-open behavior");
assertContains(budgetFile, budget, "AI_GATEWAY_BUDGET_BLOCKED", "budget block error code");

const claudeRoute = read("src/app/api/claude/route.js");
const agentRoute = read("src/app/api/agent/route.js");
const providerRoute = read("src/app/api/provider-call/route.js");
assertContains("src/app/api/claude/route.js", claudeRoute, "prepareGatewayPromptCall", "Claude route gateway integration");
assertContains("src/app/api/claude/route.js", claudeRoute, "assertGatewayBudget", "Claude route budget guard");
assertContains("src/app/api/agent/route.js", agentRoute, "prepareGatewayMessageCall", "agent route gateway integration");
assertContains("src/app/api/agent/route.js", agentRoute, "assertGatewayBudget", "agent route budget guard");
assertContains("src/app/api/agent/route.js", agentRoute, "gatewayMetadata", "agent route gateway metadata logging");
assertContains("src/app/api/provider-call/route.js", providerRoute, "prepareProviderGateway", "provider route gateway preparation");
assertContains("src/app/api/provider-call/route.js", providerRoute, "assertGatewayBudget", "provider route budget guard");
assertContains("src/app/api/provider-call/route.js", providerRoute, "logProviderCall", "provider route safe cost logging");
assertContains("src/app/api/provider-call/route.js", providerRoute, "raw_payload_logged: false", "provider route raw payload guard");

console.log("Universal AI Gateway eval passed.");
