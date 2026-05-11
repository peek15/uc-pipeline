export const SENSITIVE_KEYS = [
  "api_key",
  "apikey",
  "apiToken",
  "api_token",
  "secret",
  "token",
  "authorization",
  "password",
  "service_role",
  "prompt",
  "raw_prompt",
  "raw_response",
  "messages",
  "document_text",
  "file_text",
  "voice_sample",
  "base64",
  "audio_base64",
  "image_base64",
  "content",
  "text",
];

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,
  /\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
];

export function redactSecrets(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    return SECRET_PATTERNS.reduce((text, re) => text.replace(re, "[REDACTED_SECRET]"), value);
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === "object") return stripSensitiveFields(value);
  return value;
}

export function stripSensitiveFields(object) {
  if (!object || typeof object !== "object") return object;
  if (Array.isArray(object)) return object.map(stripSensitiveFields);
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.some(s => lower.includes(s.toLowerCase()))) {
      out[key] = "[REDACTED]";
    } else if (value && typeof value === "object") {
      out[key] = stripSensitiveFields(value);
    } else if (typeof value === "string") {
      out[key] = redactSecrets(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function summarizeError(error) {
  const msg = error?.message || String(error || "Unknown error");
  return {
    error_type: error?.code || error?.name || "error",
    error_message: redactSecrets(msg).slice(0, 500),
  };
}

export function hashPayload(value) {
  const normalized = typeof value === "string" ? value : JSON.stringify(value ?? null);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

export function safeLogEvent(label, payload = {}, level = "info") {
  const safePayload = stripSensitiveFields(payload);
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  logger(label, safePayload);
}
