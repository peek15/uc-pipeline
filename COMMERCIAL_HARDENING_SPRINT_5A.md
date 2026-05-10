# Commercial Hardening Sprint 5A — Agent Orchestration Foundation

**Version:** 3.25.0
**Date:** 2026-05-10

## Goal

Transform the existing right-side agent panel into an orchestration foundation for all future AI assistance. One visible assistant, multiple internal capabilities. Architecture sprint only — no feature expansion.

## Non-negotiable constraints

- **One assistant panel.** No scattered AI flows, no second panel.
- **Context is passed in, not discovered.** Components call `openAssistant(buildAgentContext({...}))` — the panel doesn't scrape the DOM.
- **Task types are internal.** Users see one assistant. Capabilities, tiers, and cost routing are invisible.
- **Build must pass without new env vars.**

---

## New files

### `src/lib/agent/taskTypes.js`
Task type registry with 18 task types across capabilities: `support`, `strategy`, `content`, `compliance`, `production`, `billing`, and future stubs. Each task type carries: `key`, `label`, `description`, `capability`, `cost_center`, `cost_category`, `risk_level`, `requires_approval`.

Exports: `CAPABILITIES`, `TASK_TYPES`, `TASK_TYPE_KEYS`, `getTaskType(key)`, `getCostFieldsForTask(task_type)`.

### `src/lib/agent/agentContext.js`
Structured agent context builder. `buildAgentContext({...})` accepts workspace/brand tenant context, UI source (view, component, entity type/ID, selected content), task context (task_type, task_intent, priority, risk_level), payload snapshots (brand, content, audit, billing, provider), and action context (suggested_actions, allowed_actions, apply_target).

Exports: `buildAgentContext`, `getViewLabel`, `getEntityLabel`, `getContextSummary`, `buildBillingSnapshot`, `buildProviderSnapshot`, `buildBrandSnapshot`.

### `src/lib/agent/AssistantContext.js`
React context for `openAssistant(ctx)`. Wraps the entire app in `page.js` so any component can call `useAssistant().openAssistant(context)` without prop drilling.

### `src/lib/agent/modelRouting.js`
Model routing placeholder. Maps task_type → capability → tier (fast/medium/strong) → model ID suggestion. Tiers: fast = Haiku 4.5, medium/strong = Sonnet 4.6. Used by AgentPanel model picker as a suggestion only — user selection takes precedence.

---

## Modified files

### `src/components/AgentPanel.jsx`
- New props: `agent_context = null`, `onClearContext = null`
- `buildContextBlock(agentCtx)`: builds ACTIVE CONTEXT section appended to system prompt
- `buildSystem()` passes agent context to produce structured context block
- `send()` now posts `task_type`, `source_view`, `source_entity_type`, `source_entity_id` from agent_context
- Context strip rendered below header when context is present (shows task label + view summary, with clear button)
- Empty state respects `agent_context.suggested_actions` when provided; falls back to `DEFAULT_SUGGESTIONS`
- Textarea placeholder adapts: "Ask about {contextSummary}…" when context is active

### `src/app/api/agent/route.js`
- **Bug fix:** `workspace_id: null` corrected to `workspaceId` in both `callAnthropic` and `callOpenAI` ai_calls inserts
- POST body now extracts `task_type`, `source_view`, `source_entity_type`, `source_entity_id`
- `getCostFieldsForTask(task_type)` resolves `cost_center` / `cost_category` per task
- Both providers write `cost_center` and `cost_category` to ai_calls (Sprint 3 columns)
- `callOpenAI` now also receives and forwards `workspaceId`

### `src/app/page.js`
- Imports `AssistantContext` from `@/lib/agent/AssistantContext`
- Adds `agentContext` state (null by default)
- Adds `openAssistant(ctx)` useCallback — sets context + opens panel
- Wraps return in `<AssistantContext.Provider value={{ openAssistant }}>`
- Passes `agent_context={agentContext}` and `onClearContext={() => setAgentContext(null)}` to AgentPanel

### `src/components/SettingsModal.jsx`
- Imports `useAssistant` from `@/lib/agent/AssistantContext`, `buildAgentContext` from `@/lib/agent/agentContext`
- `BillingSection` calls `useAssistant()` and renders an "Ask about plans" button that opens the assistant with `billing_help` task type and a billing snapshot

### `src/components/ProvidersSection.jsx`
- Imports `useAssistant` and `buildAgentContext`
- Calls `useAssistant()` in the component body
- Renders "Ask assistant" button in the tab bar with `provider_help` task type

---

## Architecture summary

```
Any component
  └─ useAssistant().openAssistant(buildAgentContext({ task_type, source_view, ... }))
       └─ AssistantContext.Provider (page.js)
            └─ AgentPanel (agent_context prop)
                 └─ buildContextBlock() → system prompt
                 └─ send() → POST /api/agent { task_type, source_view, ... }
                      └─ getCostFieldsForTask() → cost_center/cost_category → ai_calls
```

## Entry points wired in this sprint

| Component | Task type | Trigger |
|-----------|-----------|---------|
| SettingsModal BillingSection | `billing_help` | "Ask about plans" button |
| ProvidersSection | `provider_help` | "Ask assistant" button in tab bar |

More entry points (ResearchView, PipelineView story cards, CalendarView, etc.) are documented in the Sprint 5B roadmap.
