import { analyzeDocumentText, extractPdfText } from "@/lib/onboardingDocumentIntelligence";
import { prepareGatewayMessageCall } from "@/lib/ai/gateway";
import { DEFAULT_DATA_CLASS, DEFAULT_PRIVACY_MODE } from "@/lib/privacy/privacyTypes";

export function getOnboardingOcrProviderStatus() {
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  return {
    provider: openaiConfigured ? "openai_vision" : "none",
    configured: openaiConfigured,
    supports_images: openaiConfigured,
    supports_scanned_pdfs: false,
    supports_text_pdf: true,
    model: openaiConfigured ? (process.env.ONBOARDING_OCR_OPENAI_MODEL || "gpt-4o-mini") : null,
    note: openaiConfigured
      ? "OpenAI vision OCR is configured for image uploads. Scanned PDF page rendering is not implemented yet."
      : "No OCR/vision provider is configured. Creative Engine can only reuse text, markdown, and readable PDF text.",
  };
}

export async function runOnboardingOcr({
  text = "",
  rawPdfText = "",
  imageBase64 = "",
  mimeType = "",
  sourceType = "",
  workspaceId = null,
  brandProfileId = null,
  userId = null,
  dataClass = DEFAULT_DATA_CLASS,
  privacyMode = DEFAULT_PRIVACY_MODE,
} = {}) {
  const extractedPdfText = rawPdfText ? extractPdfText(rawPdfText) : "";
  const analyzableText = extractedPdfText || text;
  if (analyzableText && analyzableText.trim().length > 40) {
    return {
      status: "analyzed",
      extraction_method: extractedPdfText ? "pdf-light" : "stored-text",
      intelligence: analyzeDocumentText(analyzableText),
      text: analyzableText,
      provider_status: getOnboardingOcrProviderStatus(),
      limitation: null,
    };
  }

  const requiresOcr = /image/i.test(mimeType) || sourceType === "image" || /pdf/i.test(mimeType) || sourceType === "pdf";
  const providerStatus = getOnboardingOcrProviderStatus();
  if (requiresOcr && imageBase64 && providerStatus.configured && /image/i.test(mimeType || sourceType)) {
    return runOpenAiVisionOcr({
      imageBase64,
      mimeType: mimeType || "image/png",
      workspaceId,
      brandProfileId,
      userId,
      dataClass,
      privacyMode,
      providerStatus,
    });
  }

  return {
    status: requiresOcr ? "requires_ocr" : "no_text",
    extraction_method: "none",
    intelligence: null,
    text: "",
    provider_status: providerStatus,
    limitation: requiresOcr
      ? providerStatus.configured
        ? "This source requires OCR/vision extraction, but the file data was not available to the OCR processor. Upload the image again or paste the key text."
        : "This source requires OCR/vision extraction, but no OCR provider is configured yet."
      : "No readable text was available for this source.",
  };
}

async function runOpenAiVisionOcr({
  imageBase64,
  mimeType,
  workspaceId,
  brandProfileId,
  userId,
  dataClass,
  privacyMode,
  providerStatus,
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: "requires_ocr",
      extraction_method: "none",
      intelligence: null,
      text: "",
      provider_status: providerStatus,
      limitation: "No OCR/vision provider is configured.",
    };
  }

  const data = stripDataUrlPrefix(imageBase64);
  const gateway = await prepareGatewayMessageCall({
    type: "ocr_extraction",
    providerKey: "openai",
    model: providerStatus.model,
    maxTokens: 1200,
    dataClass,
    privacyMode,
    context: {
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId,
      user_id: userId,
      task_type: "general_help",
      cost_center: "onboarding",
      cost_category: "ocr_extraction",
      operation_type: "ocr_extraction",
    },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Extract readable business or brand text from this image. Return only the extracted text. If there is no useful readable text, say: NO_READABLE_TEXT." },
        { type: "image", mimeType, data },
      ],
    }],
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: gateway.model || providerStatus.model,
      max_tokens: gateway.maxTokens,
      messages: gateway.messages.map(message => ({
        role: message.role,
        content: Array.isArray(message.content)
          ? message.content.map(part => {
              if (part.type === "image") {
                return { type: "image_url", image_url: { url: `data:${part.mimeType || mimeType};base64,${part.data}` } };
              }
              return { type: "text", text: part.text || "" };
            })
          : message.content,
      })),
    }),
  });

  if (!res.ok) {
    return {
      status: "failed",
      extraction_method: "openai-vision",
      intelligence: null,
      text: "",
      provider_status: providerStatus,
      limitation: `OCR provider returned ${res.status}. Paste key text or retry later.`,
      gateway: gateway.metadata,
    };
  }

  const json = await res.json();
  const extracted = String(json.choices?.[0]?.message?.content || "").trim();
  if (!extracted || /^NO_READABLE_TEXT\b/i.test(extracted)) {
    return {
      status: "no_text",
      extraction_method: "openai-vision",
      intelligence: null,
      text: "",
      provider_status: providerStatus,
      limitation: "OCR ran, but no useful readable text was found in this image.",
      gateway: gateway.metadata,
    };
  }

  return {
    status: "analyzed",
    extraction_method: "openai-vision",
    intelligence: analyzeDocumentText(extracted),
    text: extracted,
    provider_status: providerStatus,
    limitation: null,
    gateway: gateway.metadata,
  };
}

function stripDataUrlPrefix(value) {
  return String(value || "").replace(/^data:[^;]+;base64,/i, "");
}
