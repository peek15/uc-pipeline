"use client";
// ═══════════════════════════════════════════════════════════
// AssistantContext.js — React context for the one assistant.
//
// page.js provides this context with { openAssistant }.
// Any client component in the tree can use useAssistant()
// to open the right-side panel with structured context.
//
// Usage:
//   const { openAssistant } = useAssistant();
//   openAssistant(buildAgentContext({ task_type: "billing_help", ... }));
// ═══════════════════════════════════════════════════════════

import { createContext, useContext } from "react";

export const AssistantContext = createContext({
  openAssistant: () => {},
});

export function useAssistant() {
  return useContext(AssistantContext);
}
