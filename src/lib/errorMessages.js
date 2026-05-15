// Shared user-facing error message mapper.
// Converts raw API/provider error strings into actionable copy.

export function friendlyAiError(message) {
  const msg = String(message || "");
  if (/api.?key|not configured|ANTHROPIC|OPENAI/i.test(msg))
    return "No AI provider is configured. Add a key in Settings → Providers.";
  if (/rate.?limit|429/i.test(msg))
    return "Rate limit reached. Wait a moment and try again.";
  if (/timeout|timed out|ETIMEDOUT/i.test(msg))
    return "The request timed out. Try again or use a shorter context.";
  if (/network|ECONNREFUSED|failed to fetch/i.test(msg))
    return "Network error. Check your connection and try again.";
  if (/context.?length|too many token/i.test(msg))
    return "The request is too long. Try with a shorter context or fewer items.";
  if (/parse.?fail|invalid json|unexpected token/i.test(msg))
    return "The AI response was unexpected. Try again.";
  if (/unauthorized|401/i.test(msg))
    return "Authentication failed. Try refreshing the page.";
  return msg || "Something went wrong. Try again.";
}
