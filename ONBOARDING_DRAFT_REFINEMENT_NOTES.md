# Onboarding Draft Refinement Notes

## What Changed
- Added `/api/onboarding/refine-draft`.
- Users can refine the draft strategy before approval with natural instructions such as:
  - "make this more B2B"
  - "focus on LinkedIn"
  - "less salesy"
  - "change the programmes"
- Refinement returns a revised draft plus a short change summary.
- Previous `onboarding_drafts` rows for the session are marked `superseded`.
- New draft rows are inserted with `status = draft`.
- Approval is still required before anything writes to final Brand Profile, Content Strategy, Programmes, or Risk/Claims Guidance.

## Agent Behavior
- The refinement route uses the existing AI runner with an `agent-call` prompt.
- It preserves the draft shape:
  - `brand_profile`
  - `content_strategy`
  - `programmes`
  - `alternatives`
  - `risk_checklist`
  - `first_content_ideas`
- The fallback path captures the refinement request in the strategy if AI is unavailable.

## UI Behavior
- Draft cards now include a "Refine before approval" input.
- Revised drafts show a "What changed" summary.
- Approval button remains separate and explicit.

## Remaining Risks
- Refinement is whole-draft JSON replacement, not field-level diffing.
- There is no dedicated draft version timeline yet.
- AI output is normalized back to the required draft shape, but semantic quality still depends on model output.
