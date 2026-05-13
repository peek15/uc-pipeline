// ═══════════════════════════════════════════════════════════
// gatewayBudget.js — opt-in Universal AI Gateway budget guards.
//
// Defaults are fail-open unless explicit environment caps are configured.
// This gives the product a policy boundary without surprising existing users.
// ═══════════════════════════════════════════════════════════

function readNumberEnv(name) {
  const value = process.env[name];
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sinceIso(hours = 24) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export async function assertGatewayBudget({
  svc,
  workspaceId,
  operationType = "ai_call",
  estimatedCost = 0,
  lookbackHours = 24,
} = {}) {
  const dailyCostLimit = readNumberEnv("AI_GATEWAY_DAILY_COST_LIMIT_USD");
  const dailyCallLimit = readNumberEnv("AI_GATEWAY_DAILY_CALL_LIMIT");

  if (!dailyCostLimit && !dailyCallLimit) {
    return { ok: true, status: "not_configured", operationType };
  }
  if (!svc || !workspaceId) {
    return { ok: true, status: "workspace_missing_budget_check_skipped", operationType };
  }

  try {
    const { data, error } = await svc
      .from("ai_calls")
      .select("cost_estimate")
      .eq("workspace_id", workspaceId)
      .gte("created_at", sinceIso(lookbackHours))
      .limit(2000);

    if (error) {
      return { ok: true, status: "budget_check_failed_open", operationType, warning: error.message };
    }

    const rows = data || [];
    const currentCost = rows.reduce((sum, row) => sum + (Number(row.cost_estimate) || 0), 0);
    const projectedCost = currentCost + (Number(estimatedCost) || 0);
    const currentCalls = rows.length;
    const projectedCalls = currentCalls + 1;

    if (dailyCostLimit && projectedCost > dailyCostLimit) {
      const error = new Error("AI gateway daily cost limit reached for this workspace.");
      error.code = "AI_GATEWAY_BUDGET_BLOCKED";
      error.details = { currentCost, projectedCost, dailyCostLimit, operationType };
      throw error;
    }

    if (dailyCallLimit && projectedCalls > dailyCallLimit) {
      const error = new Error("AI gateway daily call limit reached for this workspace.");
      error.code = "AI_GATEWAY_BUDGET_BLOCKED";
      error.details = { currentCalls, projectedCalls, dailyCallLimit, operationType };
      throw error;
    }

    return {
      ok: true,
      status: "allowed",
      operationType,
      currentCost,
      projectedCost,
      dailyCostLimit,
      currentCalls,
      projectedCalls,
      dailyCallLimit,
    };
  } catch (error) {
    if (error.code === "AI_GATEWAY_BUDGET_BLOCKED") throw error;
    return { ok: true, status: "budget_check_failed_open", operationType, warning: error?.message || String(error) };
  }
}

