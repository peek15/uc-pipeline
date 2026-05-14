import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;

checkFile("Workspace memory helper exists", "src/lib/workspaceMemory.js", [
  "buildStrategyMemoryItems",
  "writeWorkspaceMemoryBatch",
  "retrieveWorkspaceMemory",
  "formatWorkspaceMemoryForPrompt",
  "intelligence_insights",
  "category: MEMORY_CATEGORY",
]);

checkFile("Onboarding approval writes workspace memory", "src/app/api/onboarding/approve/route.js", [
  "buildStrategyMemoryItems",
  "writeWorkspaceMemoryBatch",
  "memory",
]);

checkFile("Onboarding agent retrieves workspace memory", "src/lib/onboardingAgentStep.js", [
  "retrieveWorkspaceMemory",
  "Durable workspace memory",
  "workspace_memory",
]);

checkFile("Workspace memory API is workspace scoped", "src/app/api/workspace-memory/route.js", [
  "requireWorkspaceMember",
  "retrieveWorkspaceMemory",
  "writeWorkspaceMemoryBatch",
  "workspace_id",
]);

checkFile("Settings exposes governed workspace memory", "src/components/SettingsModal.jsx", [
  "WorkspaceMemoryPanel",
  "Workspace Memory",
  "Mark wrong",
  "Archive",
  "onUpdateSummary",
]);

checkAbsent("Settings primary nav no longer owns Strategy surfaces", "src/components/SettingsModal.jsx", [
  "{ key:\"brand\",       label:\"Brand profile\" }",
  "{ key:\"strategy\",    label:\"Strategy\" }",
  "{ key:\"programmes\",  label:\"Programmes\" }",
]);

checkFile("Runner injects workspace memory into operational AI prompts", "src/lib/ai/runner.js", [
  "MEMORY_AWARE_TYPES",
  "getWorkspaceMemoryForPrompt",
  "withMemoryLogFields",
  "workspace_memory_context",
  "workspace_memory_source_groups",
  "/api/workspace-memory",
]);

checkFile("Assistant route retrieves durable workspace memory", "src/app/api/agent/route.js", [
  "retrieveWorkspaceMemory",
  "appendWorkspaceMemoryToSystem",
  "workspace_memory_used",
  "Durable workspace memory",
]);

checkFile("Workspace memory retrieval is hardened", "src/lib/workspaceMemory.js", [
  "selectRelevantMemories",
  "effective_confidence",
  "memory_source_group",
  "source_groups",
  "memory_context",
  "STATUS_WEIGHT",
]);

checkFile("Privacy export manifest includes intelligence memory tables", "src/lib/privacy/dataLifecycle.js", [
  "\"intelligence_insights\"",
  "\"intelligence_jobs\"",
  "\"onboarding_agent_memory\"",
  "\"agent_feedback\"",
  "\"privacy_requests\"",
]);

checkFile("Create generation receives workspace memory context", "src/components/CreateView.jsx", [
  "workspace_id: tenant?.workspace_id",
  "brand_profile_id: tenant?.brand_profile_id",
  "generate-script",
]);

checkFile("Research and scoring receive workspace memory context", "src/components/ResearchView.jsx", [
  "scoreStories(stories, settings, tenant)",
  "workspace_id: tenant?.workspace_id",
  "suggest_content_ideas",
]);

checkFile("Operational prompts consume workspace memory", "src/lib/ai/prompts/generate-script.js", [
  "workspace_memory_context",
  "Durable workspace memory",
  "approved positioning",
]);

checkFile("OCR deferred work remains tracked", "CURRENT_STATE_AUDIT.md", [
  "durable file reference/storage path",
  "Scanned PDF rendering",
]);

if (failures) {
  console.error(`\n${failures} workspace memory eval check${failures === 1 ? "" : "s"} failed.`);
  process.exit(1);
}

console.log("Workspace memory eval passed.");

function checkFile(name, file, needles) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const missing = needles.filter(needle => !text.includes(needle));
  if (missing.length) {
    failures += 1;
    console.error(`FAIL ${name}`);
    for (const needle of missing) console.error(`  missing: ${needle}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

function checkAbsent(name, file, needles) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const present = needles.filter(needle => text.includes(needle));
  if (present.length) {
    failures += 1;
    console.error(`FAIL ${name}`);
    for (const needle of present) console.error(`  still present: ${needle}`);
  } else {
    console.log(`PASS ${name}`);
  }
}
