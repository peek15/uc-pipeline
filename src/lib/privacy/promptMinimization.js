import { DATA_CLASSES, normalizeDataClass, normalizePrivacyMode } from "./privacyTypes";
import { hashPayload, redactSecrets as redactSecretPatterns } from "./safeLogging";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const SECRET_RE = /\b(?:sk|pk|rk|ghp|xoxb|xoxp|AKIA|AIza|eyJ)[A-Za-z0-9._-]{12,}\b/g;

export function classifyTextSensitivity(text = "") {
  const value = String(text || "");
  if (SECRET_RE.test(value)) return DATA_CLASSES.D4_SECRET;
  if (EMAIL_RE.test(value) || PHONE_RE.test(value)) return DATA_CLASSES.D3_SENSITIVE;
  if (/\b(confidential|internal only|pricing|contract|launch plan|roadmap|margin|salary|financial)\b/i.test(value)) {
    return DATA_CLASSES.D2_CONFIDENTIAL;
  }
  return DATA_CLASSES.D1_BUSINESS_STANDARD;
}

export function redactPII(text = "", { redact = true } = {}) {
  if (!redact) return String(text || "");
  return String(text || "")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(PHONE_RE, "[REDACTED_PHONE]");
}

export function redactSecrets(text = "") {
  return redactSecretPatterns(String(text || "").replace(SECRET_RE, "[REDACTED_SECRET]"));
}

export function truncateToLimit(text = "", maxChars = 8000) {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[TRUNCATED_${value.length - maxChars}_CHARS]`;
}

export function minimizeMessages(messages = [], options = {}) {
  const {
    dataClass,
    privacyMode,
    operationType = "ai_call",
    maxCharsPerMessage = 8000,
  } = options;
  const klass = normalizeDataClass(dataClass);
  const mode = normalizePrivacyMode(privacyMode);
  const warnings = [];
  const redactionSummary = {
    pii_redacted: false,
    secrets_redacted: false,
    truncated_messages: 0,
    input_data_class: klass,
    privacy_mode: mode,
  };
  const redactPii = klass === DATA_CLASSES.D3_SENSITIVE || mode !== "standard" || operationType.includes("onboarding");

  const sanitizedMessages = (messages || []).map(message => {
    if (typeof message.content === "string") {
      const before = message.content;
      let text = redactSecrets(before);
      if (text !== before) redactionSummary.secrets_redacted = true;
      const beforePii = text;
      text = redactPII(text, { redact: redactPii });
      if (text !== beforePii) redactionSummary.pii_redacted = true;
      const truncated = truncateToLimit(text, maxCharsPerMessage);
      if (truncated !== text) redactionSummary.truncated_messages += 1;
      return { ...message, content: truncated };
    }

    if (Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.map(part => {
          if (part.type === "image") {
            warnings.push("Image payload omitted from minimization summary; do not log base64 image data.");
            return part;
          }
          const before = String(part.text || "");
          let text = redactSecrets(before);
          if (text !== before) redactionSummary.secrets_redacted = true;
          const beforePii = text;
          text = redactPII(text, { redact: redactPii });
          if (text !== beforePii) redactionSummary.pii_redacted = true;
          const truncated = truncateToLimit(text, maxCharsPerMessage);
          if (truncated !== text) redactionSummary.truncated_messages += 1;
          return { ...part, text: truncated };
        }),
      };
    }

    return message;
  });

  return {
    sanitizedMessages,
    redactionSummary,
    payloadHash: hashPayload(sanitizedMessages),
    warnings,
  };
}

export function buildProviderSafePayload({ messages = [], system = "", dataClass, privacyMode, operationType }) {
  const minimized = minimizeMessages(messages, { dataClass, privacyMode, operationType });
  const safeSystem = truncateToLimit(redactPII(redactSecrets(system), { redact: normalizePrivacyMode(privacyMode) !== "standard" }), 5000);
  return {
    ...minimized,
    sanitizedSystem: safeSystem,
    payloadHash: hashPayload({ system: safeSystem, messages: minimized.sanitizedMessages }),
  };
}
