import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;

checkFile("Generic intelligence job helper exists", "src/lib/intelligenceJobs.js", [
  "enqueueIntelligenceJob",
  "listIntelligenceJobs",
  "processIntelligenceJobs",
  "onboarding_research",
  "ocr_extraction",
  "processOcrExtractionJob",
  "runOnboardingOcr",
  "delete safe.image_base64",
  "No processor implemented",
]);

checkFile("Intelligence jobs API is workspace scoped", "src/app/api/intelligence-jobs/route.js", [
  "requireWorkspaceMember",
  "workspace_id",
  "action === \"process\"",
  "enqueueIntelligenceJob",
  "processIntelligenceJobs",
]);

checkFile("Intelligence jobs SQL migration exists", "supabase-sprint11-intelligence-jobs.sql", [
  "CREATE TABLE IF NOT EXISTS intelligence_jobs",
  "ENABLE ROW LEVEL SECURITY",
  "workspace members can read intelligence jobs",
  "workspace members can create intelligence jobs",
  "workspace members can update intelligence jobs",
]);

checkFile("Current state audit mentions jobs", "CURRENT_STATE_AUDIT.md", [
  "intelligence_jobs",
  "src/lib/intelligenceJobs.js",
]);

checkFile("Onboarding source intake enqueues OCR jobs", "src/app/api/onboarding/source/route.js", [
  "enqueueIntelligenceJob",
  "jobType: \"ocr_extraction\"",
  "ocr_job_status",
  "ocr_jobs",
]);

if (failures) {
  console.error(`\n${failures} intelligence jobs eval check${failures === 1 ? "" : "s"} failed.`);
  process.exit(1);
}

console.log("Intelligence jobs eval passed.");

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
