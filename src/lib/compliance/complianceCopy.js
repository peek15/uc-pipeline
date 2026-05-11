export const ACKNOWLEDGEMENT_TEXT =
  "I understand that I am responsible for reviewing claims, asset rights, publication, advertising use, and legal/platform compliance before using or publishing this content.";

export const COMPLIANCE_DISCLAIMER =
  "Creative Engine compliance checks are warnings and workflow support, not legal advice or a guarantee of legal/platform compliance.";

export function warningLabel(count) {
  if (!count) return "No warnings";
  return `${count} warning${count === 1 ? "" : "s"}`;
}

