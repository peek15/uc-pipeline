# Onboarding Experience Notes

## Current Audit
Sprint 6 onboarding already had the right backend foundation:
- onboarding sessions
- source records
- extracted facts
- clarifications
- drafts
- approval before save
- first content ideas

What felt too form-like:
- separate visual steps
- source intake as a form page
- progress bar framing
- static cards disconnected from conversation
- limited sense that Creative Engine was "working"

What was reused:
- `/api/onboarding/session`
- `/api/onboarding/source`
- `/api/onboarding/analyze`
- `/api/onboarding/clarification`
- `/api/onboarding/approve`
- deterministic fact inference and draft generation in `src/lib/onboarding.js`
- source status honesty for PDF/image/text files

## New Flow
The page is now a full-screen conversational onboarding mode:
1. Assistant asks for sources.
2. User provides website/files/notes/manual signals inside a source card.
3. WorkTrace/generating card appears while analysis runs.
4. "What Creative Engine understood" appears as a reviewable card.
5. Clarifications appear as focused conversational cards.
6. Draft strategy appears as structured generated cards.
7. User approves before saving.
8. Completion state routes to Strategy, Ideas, Create, or Home.

## UX Rules
- No right-side AgentPanel during onboarding.
- No fake source analysis.
- No progress bar or boot copy.
- No chain-of-thought.
- PDF/images are accepted but marked pending if not parsed.
- Source/work trace is on demand.
- Approval is required before final strategy writes.

