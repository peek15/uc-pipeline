import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;

checkFile("Adaptive scoring helper exists", "src/lib/adaptiveScoring.js", [
  "buildAdaptiveScoringProfile",
  "scoreContentReadiness",
  "getAdaptiveScore",
  "attachAdaptiveScore",
  "market_fit",
  "brand_fit",
  "compliance_readiness",
]);

checkFile("Score prompt is adaptive to market and content context", "src/lib/ai/prompts/score-story.js", [
  "adaptive Creative Engine content scorer",
  "Market/industry",
  "Business/content goals",
  "adaptive_total",
  "market_fit",
  "compliance_readiness",
]);

checkFile("Reach prompt is not UC-specific", "src/lib/ai/prompts/reach-score.js", [
  "adaptive reach potential",
  "buyer/customer context",
  "target platforms",
  "without overclaiming",
]);

checkFile("Research persists adaptive score metadata", "src/components/ResearchView.jsx", [
  "attachAdaptiveScore",
  "adaptive_score",
  "metadata",
]);

checkFile("Pipeline reads adaptive score", "src/components/PipelineView.jsx", [
  "getAdaptiveScore",
  "Adaptive score",
  "Market fit",
  "Brand fit",
]);

checkFile("Detail modal shows adaptive score", "src/components/DetailModal.jsx", [
  "getAdaptiveScore",
  "Adaptive score",
  "Market fit",
  "Compliance",
]);

if (failures) {
  console.error(`\n${failures} adaptive scoring eval check${failures === 1 ? "" : "s"} failed.`);
  process.exit(1);
}

console.log("Adaptive scoring eval passed.");

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

