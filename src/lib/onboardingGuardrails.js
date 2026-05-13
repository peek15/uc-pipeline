export const ONBOARDING_LIMITS = {
  maxAgentTurnsPerSession: 40,
  maxResearchJobsPerSession: 12,
  maxResearchAttemptsPerJob: 3,
  maxSourcesPerSession: 30,
};

export async function getOnboardingUsage({ svc, sessionId, workspaceId } = {}) {
  if (!svc || !sessionId || !workspaceId) return emptyUsage();
  const [memory, jobs, sources] = await Promise.all([
    svc.from("onboarding_agent_memory").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("session_id", sessionId),
    svc.from("onboarding_research_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("session_id", sessionId),
    svc.from("onboarding_sources").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
  ]);
  return {
    agent_turns: memory.error ? 0 : memory.count || 0,
    research_jobs: jobs.error ? 0 : jobs.count || 0,
    sources: sources.error ? 0 : sources.count || 0,
    unavailable: Boolean(memory.error || jobs.error || sources.error),
  };
}

export async function assertOnboardingBudget({ svc, sessionId, workspaceId, operation }) {
  const usage = await getOnboardingUsage({ svc, sessionId, workspaceId });
  if (operation === "agent_turn" && usage.agent_turns >= ONBOARDING_LIMITS.maxAgentTurnsPerSession) {
    return blocked("agent_turn_limit", "This onboarding session has reached the V1 agent-turn limit. Start a new onboarding refresh to continue.");
  }
  if (operation === "research_job" && usage.research_jobs >= ONBOARDING_LIMITS.maxResearchJobsPerSession) {
    return blocked("research_job_limit", "This onboarding session has reached the V1 research-job limit. Continue manually or start a new refresh.");
  }
  if (operation === "source" && usage.sources >= ONBOARDING_LIMITS.maxSourcesPerSession) {
    return blocked("source_limit", "This onboarding session has reached the V1 source limit. Continue with the current sources or start a new refresh.");
  }
  return { ok: true, usage };
}

export function onboardingPrivacyNotice({ externalAI = false, webResearch = false, ocr = false } = {}) {
  return {
    external_ai_used: Boolean(externalAI),
    web_research_used: Boolean(webResearch),
    ocr_used: Boolean(ocr),
    note: externalAI
      ? "Creative Engine may process selected onboarding context with configured commercial AI providers."
      : "This step used local/rule-based onboarding logic only.",
  };
}

function blocked(code, message) {
  return { ok: false, code, message };
}

function emptyUsage() {
  return { agent_turns: 0, research_jobs: 0, sources: 0, unavailable: true };
}
