// ═══════════════════════════════════════════════════════════
// gateway.js — Universal AI Gateway policy layer.
//
// Sprint 2 scope:
// - normalize task/cost/model metadata for runner-based AI calls
// - apply privacy minimization for prompt and message-based calls
// - keep concrete provider execution unchanged
// ═══════════════════════════════════════════════════════════

import { getCostFieldsForTask, getTaskType, TASK_TYPES } from "@/lib/agent/taskTypes";
import { getRecommendedModelForTask, getTaskTier } from "@/lib/agent/modelRouting";
import { preparePrivacyCheckedAI } from "@/lib/privacy/aiPrivacyGateway";
import { DEFAULT_DATA_CLASS, DEFAULT_PRIVACY_MODE } from "@/lib/privacy/privacyTypes";
import { hashPayload } from "@/lib/privacy/safeLogging";

export const GATEWAY_PROVIDER_KEY = "anthropic";

const PROMPT_TASK_TYPE_MAP = {
  "score-story": "explain_score",
  "reach-score": "explain_score",
  "generate-script": "rewrite_script",
  "translate-script": "rewrite_script",
  "research-stories": "suggest_content_ideas",
  "programme-discuss": "suggest_programmes",
  "rules-suggest": "improve_brand_profile",
  "rules-audit": "improve_brand_profile",
  "rules-conflict-resolve": "improve_brand_profile",
  "alerts-suggest": "support_request",
  "summarize-content": "general_help",
  "strategy-audit": "improve_brand_profile",
  "onboarding-chat": "onboarding_generate_clarifications",
  "feedback-patterns": "general_help",
  "agent-call": "general_help",
  "voice.generate": "rewrite_script",
  "visual.generate": "improve_story",
  "licensed.search": "suggest_content_ideas",
};

function resolveTaskType(type, context = {}) {
  const explicit = context.task_type || context.taskType;
  if (explicit && TASK_TYPES[explicit]) return explicit;
  const mapped = PROMPT_TASK_TYPE_MAP[type];
  if (mapped && TASK_TYPES[mapped]) return mapped;
  if (type && TASK_TYPES[type]) return type;
  return "general_help";
}

function resolveCostFields(taskType, context = {}) {
  const registryFields = getCostFieldsForTask(taskType);
  return {
    cost_center: context.cost_center || context.costCenter || registryFields.cost_center || null,
    cost_category: context.cost_category || context.costCategory || registryFields.cost_category || null,
  };
}

function contentToPrompt(content, fallback) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.text) return part.text;
        if (part?.content) return part.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return fallback;
}

function extractPromptFromPrepared(prepared, fallback) {
  const userMessage = prepared?.messages?.find((message) => message.role === "user") || prepared?.messages?.[0];
  return contentToPrompt(userMessage?.content, fallback);
}

function resolveProviderModel(providerKey, model) {
  if (providerKey !== "anthropic") return model || null;
  if (!model || model === "sonnet") return "claude-sonnet-4-6";
  if (model === "haiku") return "claude-haiku-4-5-20251001";
  if (model === "opus") return "claude-opus-4-7";
  if (model.startsWith?.("claude-")) return model;
  return "claude-sonnet-4-6";
}

function buildGatewayMetadata({
  type,
  taskType,
  taskConfig,
  tier,
  recommendedModel,
  providerKey,
  model,
  maxTokens,
  stream,
  privacyStatus,
  prepared = null,
  warnings = [],
}) {
  return {
    gateway_version: "universal_gateway_sprint_1",
    gateway_policy: "runner_prompt_policy_v1",
    prompt_type: type,
    task_type: taskType,
    task_label: taskConfig?.label || null,
    task_capability: taskConfig?.capability || null,
    task_tier: tier,
    recommended_model: recommendedModel,
    provider_key: providerKey,
    execution_provider: providerKey,
    model,
    max_tokens: maxTokens,
    stream: Boolean(stream),
    privacy_status: privacyStatus,
    provider_privacy_profile: prepared?.providerProfile?.provider_key || null,
    payload_hash: prepared?.payloadHash || null,
    redaction_summary: prepared?.metadata?.redaction_summary || null,
    warnings,
    raw_prompt_logged: false,
  };
}

export async function prepareGatewayPromptCall({
  type,
  prompt,
  context = {},
  maxTokens,
  model,
  stream = false,
  providerKey = GATEWAY_PROVIDER_KEY,
  dataClass,
  privacyMode,
}) {
  const messages = [{ role: "user", content: prompt }];
  const prepared = await prepareGatewayMessageCall({
    type,
    messages,
    context,
    maxTokens,
    model,
    stream,
    providerKey,
    dataClass,
    privacyMode,
  });

  return {
    ...prepared,
    prompt: extractPromptFromPrepared({ messages: prepared.messages }, prompt),
  };
}

export async function prepareGatewayMessageCall({
  type,
  messages = [],
  system = "",
  context = {},
  maxTokens,
  model,
  stream = false,
  providerKey = GATEWAY_PROVIDER_KEY,
  dataClass,
  privacyMode,
}) {
  const taskType = resolveTaskType(type, context);
  const taskConfig = getTaskType(taskType);
  const tier = getTaskTier(taskType);
  const recommendedModel = getRecommendedModelForTask(taskType);
  // Sprint 1 keeps concrete provider execution unchanged. The recommended model
  // is logged for future routing, while legacy calls still default to "sonnet".
  const resolvedModel = resolveProviderModel(providerKey, model || (providerKey === "anthropic" ? "sonnet" : null));
  const resolvedMaxTokens = maxTokens || 1000;
  const costFields = resolveCostFields(taskType, context);
  const normalizedDataClass = dataClass || context.data_class || context.dataClass || DEFAULT_DATA_CLASS;
  const normalizedPrivacyMode = privacyMode || context.privacy_mode || context.privacyMode || DEFAULT_PRIVACY_MODE;

  let safeMessages = messages;
  let safeSystem = system;
  let prepared = null;
  let privacyStatus = "workspace_missing_privacy_check_skipped";
  let privacyWarnings = [];

  if (context.workspace_id || context.workspaceId) {
    prepared = preparePrivacyCheckedAI({
      workspaceId: context.workspace_id || context.workspaceId,
      brandProfileId: context.brand_profile_id || context.brandProfileId || null,
      userId: context.user_id || context.userId || null,
      operationType: context.operation_type || context.operationType || taskType,
      providerKey,
      model: resolvedModel,
      messages,
      system,
      dataClass: normalizedDataClass,
      privacyMode: normalizedPrivacyMode,
      costCenter: costFields.cost_center,
      costCategory: costFields.cost_category,
      metadata: {
        prompt_type: type,
        task_type: taskType,
        source_entity_type: context.source_entity_type || context.sourceEntityType || null,
        source_entity_id: context.source_entity_id || context.sourceEntityId || null,
      },
    });
    safeMessages = prepared.messages;
    safeSystem = prepared.system;
    privacyStatus = "privacy_checked";
    privacyWarnings = prepared?.metadata?.warnings || [];
  }

  const payloadHash = prepared?.payloadHash || hashPayload({ messages, system });
  const gatewayMetadata = buildGatewayMetadata({
    type,
    taskType,
    taskConfig,
    tier,
    recommendedModel,
    providerKey,
    model: resolvedModel,
    maxTokens: resolvedMaxTokens,
    stream,
    privacyStatus,
    prepared,
    warnings: privacyWarnings,
  });

  return {
    messages: safeMessages,
    system: safeSystem,
    model: resolvedModel,
    maxTokens: resolvedMaxTokens,
    taskType,
    costFields,
    dataClass: normalizedDataClass,
    privacyMode: normalizedPrivacyMode,
    providerPrivacyProfile: prepared?.providerProfile?.provider_key || null,
    payloadHash,
    metadata: {
      ...gatewayMetadata,
      payload_hash: payloadHash,
    },
    logFields: {
      task_type: taskType,
      cost_center: costFields.cost_center,
      cost_category: costFields.cost_category,
      data_class: normalizedDataClass,
      privacy_mode: normalizedPrivacyMode,
      provider_privacy_profile: prepared?.providerProfile?.provider_key || null,
      payload_hash: payloadHash,
      metadata_json: {
        ...gatewayMetadata,
        payload_hash: payloadHash,
      },
    },
  };
}
