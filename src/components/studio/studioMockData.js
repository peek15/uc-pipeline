export const SOURCE_LABELS = {
  user_asset:  "User asset",
  ai_generated:"AI-generated",
  licensed:    "Licensed",
  text:        "Text",
  voice:       "Voice",
  caption:     "Caption",
};

export const SOURCE_MODIFIABILITY = {
  user_asset:  { editable: false, hint: "User asset — replace or trim only, not AI-regenerate by default." },
  ai_generated:{ editable: true,  hint: null },
  licensed:    { editable: false, hint: "Licensed asset — limited edit or replace; rights-sensitive." },
  text:        { editable: true,  hint: null },
  voice:       { editable: true,  hint: null },
  caption:     { editable: true,  hint: null },
};

export function getMockBlocks() {
  return [
    { id: "b1", label: "Hook",    start: "00:00", end: "00:04", sourceType: "ai_generated", editable: true,  lockedReason: null, status: "ok" },
    { id: "b2", label: "Problem", start: "00:04", end: "00:11", sourceType: "text",          editable: true,  lockedReason: null, status: "ok" },
    { id: "b3", label: "Proof",   start: "00:11", end: "00:18", sourceType: "user_asset",    editable: false, lockedReason: "User asset — replace or trim only.", status: "ok" },
    { id: "b4", label: "CTA",     start: "00:18", end: "00:25", sourceType: "ai_generated",  editable: true,  lockedReason: null, status: "ok" },
  ];
}

export const MOCK_VERSIONS = [
  { id: "v1", label: "V1", version: 1, status: "review", note: "Created from initial generation", current: true },
];

export const REVISION_STATUSES = {
  pending:     { label: "Pending",     color: "var(--t4)" },
  interpreted: { label: "Interpreted", color: "var(--t3)" },
  ready:       { label: "Ready",       color: "var(--warning)" },
  queued:      { label: "Queued",      color: "var(--t2)" },
  applied:     { label: "Applied",     color: "var(--success)" },
  rejected:    { label: "Rejected",    color: "var(--error)" },
};

export function deriveSubject(comment) {
  if (!comment) return "Revision";
  const words = comment.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
