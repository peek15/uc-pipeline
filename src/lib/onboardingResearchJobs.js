import { researchCompanyFromText, researchWebsiteUrl } from "@/lib/onboardingWebResearch";
import { assertOnboardingBudget } from "@/lib/onboardingGuardrails";

const MAX_ATTEMPTS = 3;

export async function runOnboardingResearchJob({
  svc = null,
  workspaceId,
  brandProfileId = null,
  sessionId = null,
  userId = null,
  mode = "company",
  query = "",
  url = "",
  company = "",
} = {}) {
  const budget = await assertOnboardingBudget({ svc, sessionId, workspaceId, operation: "research_job" });
  if (!budget.ok) {
    return {
      job_id: null,
      status: "failed",
      attempts: [],
      error: budget.message,
      result: null,
      budget,
    };
  }
  const job = await createResearchJob({ svc, workspaceId, brandProfileId, sessionId, userId, mode, query, url, company });
  return processResearchJob({
    svc,
    jobId: job?.id || null,
    workspaceId,
    mode,
    query,
    url,
    company,
  });
}

export async function enqueueOnboardingResearchJob({
  svc = null,
  workspaceId,
  brandProfileId = null,
  sessionId = null,
  userId = null,
  mode = "company",
  query = "",
  url = "",
  company = "",
} = {}) {
  const budget = await assertOnboardingBudget({ svc, sessionId, workspaceId, operation: "research_job" });
  if (!budget.ok) return { queued: false, status: "failed", error: budget.message, budget };
  const job = await createResearchJob({ svc, workspaceId, brandProfileId, sessionId, userId, mode, query, url, company });
  return {
    queued: Boolean(job?.id),
    job_id: job?.id || null,
    status: job?.id ? "queued" : "unavailable",
  };
}

export async function processQueuedOnboardingResearchJobs({ svc, workspaceId, sessionId = null, limit = 3 } = {}) {
  if (!svc || !workspaceId) return { processed: [], unavailable: true };
  let query = svc
    .from("onboarding_research_jobs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", ["queued", "retrying", "partial"])
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 3, 10)));
  if (sessionId) query = query.eq("session_id", sessionId);
  const { data, error } = await query;
  if (error) return { processed: [], unavailable: true, error: error.message };

  const processed = [];
  for (const job of data || []) {
    const input = job.input_json || {};
    processed.push(await processResearchJob({
      svc,
      jobId: job.id,
      workspaceId,
      mode: input.mode || (job.job_type === "website_research" ? "url" : "company"),
      query: input.query || "",
      url: input.url || "",
      company: input.company || "",
    }));
  }
  return { processed, unavailable: false };
}

async function processResearchJob({ svc, jobId, workspaceId, mode, query, url, company }) {
  const startedAt = new Date().toISOString();
  await updateResearchJob({ svc, jobId, workspaceId, status: "running", attempts: 0, startedAt });

  const attempts = [];
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      const result = mode === "url"
        ? await researchWebsiteUrl(url || query, { company, discovery: "provided_url" })
        : await researchCompanyFromText(query || company);
      attempts.push({
        attempt,
        status: result?.url || result?.summary ? "success" : "partial",
        duration_ms: Date.now() - attemptStartedAt,
        result_status: result?.status || "unknown",
        confidence: result?.confidence || "low",
      });
      await updateResearchJob({
        svc,
        jobId,
        workspaceId,
        status: result?.url || result?.summary ? "completed" : "partial",
        attempts: attempt,
        result,
        metadata: { attempts },
        completedAt: new Date().toISOString(),
      });
      return {
        job_id: jobId || null,
        status: result?.url || result?.summary ? "completed" : "partial",
        attempts,
        result,
      };
    } catch (error) {
      lastError = error;
      attempts.push({
        attempt,
        status: "failed",
        duration_ms: Date.now() - attemptStartedAt,
        error: safeError(error),
      });
      await updateResearchJob({
        svc,
        jobId,
        workspaceId,
        status: attempt === MAX_ATTEMPTS ? "failed" : "retrying",
        attempts: attempt,
        error: safeError(error),
        metadata: { attempts },
      });
      if (attempt < MAX_ATTEMPTS) await wait(250 * attempt);
    }
  }

  return {
    job_id: jobId || null,
    status: "failed",
    attempts,
    error: safeError(lastError),
    result: null,
  };
}

async function createResearchJob({ svc, workspaceId, brandProfileId, sessionId, userId, mode, query, url, company }) {
  if (!svc || !workspaceId || !sessionId) return null;
  const { data, error } = await svc
    .from("onboarding_research_jobs")
    .insert({
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId || null,
      session_id: sessionId,
      job_type: mode === "url" ? "website_research" : "company_research",
      status: "queued",
      input_json: { mode, query: truncate(query, 500), url: truncate(url, 500), company: truncate(company, 200) },
      attempts: 0,
      created_by: userId || null,
    })
    .select("id")
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateResearchJob({ svc, jobId, workspaceId, status, attempts, result = undefined, error = null, metadata = undefined, startedAt = undefined, completedAt = undefined }) {
  if (!svc || !jobId || !workspaceId) return;
  const patch = {
    status,
    attempts,
    updated_at: new Date().toISOString(),
  };
  if (result !== undefined) patch.result_json = result;
  if (error) patch.error_message = error;
  if (metadata !== undefined) patch.metadata_json = metadata;
  if (startedAt) patch.started_at = startedAt;
  if (completedAt) patch.completed_at = completedAt;
  await svc
    .from("onboarding_research_jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("workspace_id", workspaceId);
}

function safeError(error) {
  return String(error?.message || error || "Research job failed").slice(0, 500);
}

function truncate(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}...`;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
