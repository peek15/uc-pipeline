# Onboarding Agent Hardening Notes
**Date:** 2026-05-13  
**Version:** 3.37.8  
**Scope:** Non-UI onboarding agent intelligence hardening.

## What Changed
- Added `src/lib/onboardingPlanner.js` as an explicit planning core for onboarding turns.
- Added `src/lib/onboardingDocumentIntelligence.js` for lightweight text/PDF document extraction and evidence snippets.
- Wired planner state into `src/lib/onboardingAgentStep.js`.
- Wired planner/evidence metadata into `/api/onboarding/analyze`.
- Extended onboarding memory snapshots with `agentPlan` and `factEvidence`.

## Planner Core
The planner now produces:
- current stage
- current goal
- next action
- field states
- missing required fields
- uncertain required fields
- source coverage
- fact-to-evidence map
- draft readiness
- clarification queue
- guardrails

This gives the agent a concrete operating state instead of relying only on generic prompt instructions.

## Source-To-Fact Traceability
- Each inferred field can now carry evidence snippets from:
  - user notes
  - uploaded text/markdown files
  - lightweight PDF text extraction when readable
  - website pages/evidence from source intelligence
- `/api/onboarding/analyze` writes fact metadata with planner stage, field state, and evidence where the fact confirmation migration is available.

## Document Intelligence
- Text and markdown files remain parsed directly.
- PDFs now receive a dependency-free lightweight text extraction attempt.
- If PDF text extraction works, the file is marked parsed with low/medium confidence.
- If PDF text extraction fails, it is stored as pending with clear limitations.
- Images remain stored only; OCR/image understanding is not implemented.

## Clarification Intelligence
- The planner chooses the next action based on source coverage, missing required fields, confidence, and uncertainty.
- Missing required fields are prioritized over nice-to-have fields.
- The prompt now follows planner state:
  - `collect_source`
  - `ask_missing_required`
  - `review_then_draft`
  - `draft_strategy`

## Memory Alignment
- Existing confirmed/edited fact memory still overrides inference.
- Rejected/unsure facts are cleared so the agent asks instead of repeating bad assumptions.
- Agent memory snapshots now expose planner and evidence data to recovery paths.

## What Is Still Not Implemented
- Full OCR for images.
- Robust PDF parsing for scanned/image-only PDFs.
- Background research jobs or durable queues.
- Automated evaluation runner.
- Contractually verified provider privacy routing.
- Broad market intelligence, competitor scan, social scan, or platform API research.

## Validation
- `npm run lint --if-present`: passed
- `npm run build`: passed
