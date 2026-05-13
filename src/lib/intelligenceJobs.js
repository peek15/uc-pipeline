import { runOnboardingResearchJob } from "@/lib/onboardingResearchJobs";
import { runOnboardingOcr } from "@/lib/onboardingOcrProvider";

export const INTELLIGENCE_JOB_TYPES = {
  onboarding_research: "onboarding_research",
  document_extraction: "document_extraction",
  ocr_extraction: "ocr_extraction",
  gateway_eval: "gateway_eval",
  provider_task: "provider_task",
  generic: "generic",
};

export const INTELLIGENCE_JOB_STATUSES = {
  queued: "queued",
  running: "running",
  retrying: "retrying",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

const MAX_PROCESS_LIMIT = 10;

export async function enqueueIntelligenceJob({
  svc,
  workspaceId,
  brandProfileId = null,
  sessionId = null,
  userId = null,
  jobType = INTELLIGENCE_JOB_TYPES.generic,
  input = {},
  priority = 5,
  metadata = {},
  maxAttempts = 3,
} = {}) {
  if (!svc || !workspaceId) return unavailable("Missing service client or workspace");
  const normalizedJobType = normalizeJobType(jobType);
  const { data, error } = await svc
    .from("intelligence_jobs")
    .insert({
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId || null,
      session_id: sessionId || null,
      job_type: normalizedJobType,
      status: INTELLIGENCE_JOB_STATUSES.queued,
      priority: clampInt(priority, 1, 10, 5),
      input_json: sanitizeInput(input),
      metadata_json: metadata || {},
      max_attempts: clampInt(maxAttempts, 1, 10, 3),
      created_by: userId || null,
    })
    .select("id,job_type,status,priority,created_at")
    .maybeSingle();
  if (error) return unavailable(error.message);
  return { queued: Boolean(data?.id), job: data || null, unavailable: false };
}

export async function listIntelligenceJobs({
  svc,
  workspaceId,
  brandProfileId = null,
  sessionId = null,
  status = null,
  limit = 25,
} = {}) {
  if (!svc || !workspaceId) return { jobs: [], unavailable: true, error: "Missing service client or workspace" };
  let query = svc
    .from("intelligence_jobs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(clampInt(limit, 1, 100, 25));
  if (brandProfileId) query = query.eq("brand_profile_id", brandProfileId);
  if (sessionId) query = query.eq("session_id", sessionId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return { jobs: [], unavailable: true, error: error.message };
  return { jobs: data || [], unavailable: false };
}

export async function processIntelligenceJobs({
  svc,
  workspaceId,
  sessionId = null,
  workerId = "api-worker",
  limit = 3,
} = {}) {
  if (!svc || !workspaceId) return { processed: [], unavailable: true, error: "Missing service client or workspace" };

  let query = svc
    .from("intelligence_jobs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", [INTELLIGENCE_JOB_STATUSES.queued, INTELLIGENCE_JOB_STATUSES.retrying])
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(clampInt(limit, 1, MAX_PROCESS_LIMIT, 3));
  if (sessionId) query = query.eq("session_id", sessionId);

  const { data, error } = await query;
  if (error) return { processed: [], unavailable: true, error: error.message };

  const processed = [];
  for (const job of data || []) {
    processed.push(await processSingleIntelligenceJob({ svc, job, workerId }));
  }
  return { processed, unavailable: false };
}

async function processSingleIntelligenceJob({ svc, job, workerId }) {
  const startedAt = new Date().toISOString();
  await updateJob(svc, job, {
    status: INTELLIGENCE_JOB_STATUSES.running,
    attempts: (job.attempts || 0) + 1,
    locked_at: startedAt,
    locked_by: workerId,
    started_at: job.started_at || startedAt,
  });

  try {
    const result = await executeJob({ svc, job });
    await updateJob(svc, job, {
      status: INTELLIGENCE_JOB_STATUSES.completed,
      result_json: result,
      error_message: null,
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    });
    return { job_id: job.id, job_type: job.job_type, status: "completed", result };
  } catch (error) {
    const attempts = (job.attempts || 0) + 1;
    const retrying = attempts < (job.max_attempts || 3);
    const status = retrying ? INTELLIGENCE_JOB_STATUSES.retrying : INTELLIGENCE_JOB_STATUSES.failed;
    await updateJob(svc, job, {
      status,
      attempts,
      error_message: safeError(error),
      completed_at: retrying ? null : new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    });
    return { job_id: job.id, job_type: job.job_type, status, error: safeError(error) };
  }
}

async function executeJob({ svc, job }) {
  const input = job.input_json || {};
  if (job.job_type === INTELLIGENCE_JOB_TYPES.onboarding_research) {
    return runOnboardingResearchJob({
      svc,
      workspaceId: job.workspace_id,
      brandProfileId: job.brand_profile_id,
      sessionId: job.session_id,
      userId: job.created_by,
      mode: input.mode === "url" ? "url" : "company",
      query: input.query || "",
      url: input.url || "",
      company: input.company || "",
    });
  }

  if (job.job_type === INTELLIGENCE_JOB_TYPES.ocr_extraction) {
    return processOcrExtractionJob({ svc, job, input });
  }

  throw new Error(`No processor implemented for intelligence job type: ${job.job_type}`);
}

async function processOcrExtractionJob({ svc, job, input }) {
  const sourceId = input.source_id;
  if (!sourceId) throw new Error("ocr_extraction requires input_json.source_id");

  const { data: source, error } = await svc
    .from("onboarding_sources")
    .select("*")
    .eq("id", sourceId)
    .eq("session_id", job.session_id)
    .maybeSingle();
  if (error) throw error;
  if (!source) throw new Error("OCR source not found");

  await updateSourceOcrMetadata({ svc, source, patch: { ocr_job_status: "running", ocr_job_id: job.id } });

  const metadata = source.metadata_json || {};
  const result = await runOnboardingOcr({
    text: metadata.text || source.summary || "",
    rawPdfText: metadata.raw_pdf_text || "",
    mimeType: source.mime_type || "",
    sourceType: source.source_type || "",
    workspaceId: job.workspace_id,
    brandProfileId: job.brand_profile_id,
    userId: job.created_by,
    dataClass: source.data_class,
    privacyMode: input.privacy_mode,
  });

  const sourcePatch = {
    metadata_json: {
      ...metadata,
      ocr_job_id: job.id,
      ocr_job_status: result.status,
      ocr_status: result.status === "analyzed" ? "ocr_extracted" : result.status,
      ocr_provider: result.provider_status || null,
      ocr_gateway: result.gateway || null,
      ocr_limitation: result.limitation || null,
    },
  };

  if (result.status === "analyzed") {
    sourcePatch.status = "analyzed";
    sourcePatch.summary = result.intelligence?.summary || source.summary;
    sourcePatch.metadata_json = {
      ...sourcePatch.metadata_json,
      text: String(result.text || "").slice(0, 20000),
      source_intelligence: {
        status: "analyzed",
        summary: result.intelligence?.summary || "",
        confidence: result.intelligence?.confidence || "low",
        evidence_snippets: result.intelligence?.evidence_snippets || [],
        word_count: result.intelligence?.word_count || 0,
        extraction_method: result.extraction_method,
        limitation: null,
      },
    };
  } else if (result.status === "failed") {
    sourcePatch.status = "failed";
  } else {
    sourcePatch.status = source.status || "pending";
  }

  await svc
    .from("onboarding_sources")
    .update(sourcePatch)
    .eq("id", source.id)
    .eq("session_id", source.session_id);

  return {
    source_id: source.id,
    status: result.status,
    extraction_method: result.extraction_method,
    limitation: result.limitation || null,
    provider_status: result.provider_status || null,
  };
}

async function updateSourceOcrMetadata({ svc, source, patch }) {
  const metadata = source.metadata_json || {};
  await svc
    .from("onboarding_sources")
    .update({
      metadata_json: {
        ...metadata,
        ...patch,
      },
    })
    .eq("id", source.id)
    .eq("session_id", source.session_id);
}

async function updateJob(svc, job, patch) {
  const { error } = await svc
    .from("intelligence_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("workspace_id", job.workspace_id);
  if (error) throw error;
}

function normalizeJobType(jobType) {
  return Object.values(INTELLIGENCE_JOB_TYPES).includes(jobType)
    ? jobType
    : INTELLIGENCE_JOB_TYPES.generic;
}

function sanitizeInput(input) {
  const safe = { ...(input || {}) };
  for (const key of ["text", "query", "url", "company"]) {
    if (safe[key]) safe[key] = truncate(safe[key], key === "text" ? 4000 : 800);
  }
  delete safe.api_key;
  delete safe.token;
  delete safe.authorization;
  delete safe.base64;
  delete safe.image_base64;
  delete safe.audio_base64;
  return safe;
}

function unavailable(error) {
  return { queued: false, job: null, unavailable: true, error };
}

function safeError(error) {
  return String(error?.message || error || "Intelligence job failed").slice(0, 500);
}

function truncate(value, limit) {
  const text = String(value || "");
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trim()}...`;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
