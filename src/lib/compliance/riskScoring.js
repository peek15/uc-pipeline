const LEVEL_POINTS = {
  low: 8,
  medium: 20,
  high: 36,
  critical: 65,
};

export function scoreWarnings(warnings = []) {
  const total = warnings.reduce((sum, warning) => sum + (LEVEL_POINTS[warning.risk_level] || 0), 0);
  const capped = Math.min(100, total);
  const hasCritical = warnings.some(w => w.risk_level === "critical");
  const hasHigh = warnings.some(w => w.risk_level === "high");
  const hasMedium = warnings.some(w => w.risk_level === "medium");

  let risk_level = "low";
  if (hasCritical || capped >= 85) risk_level = "critical";
  else if (hasHigh || capped >= 55) risk_level = "high";
  else if (hasMedium || capped >= 20) risk_level = "medium";

  let status = "clear";
  if (risk_level === "critical") status = "blocked";
  else if (risk_level === "high") status = "needs_acknowledgement";
  else if (warnings.length) status = "warning";

  return { risk_score: capped, risk_level, status };
}

