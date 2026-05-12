# Commercial Hardening Sprint 10C

## A. Files Changed
- `src/app/onboarding/page.jsx`
- `src/components/CreateView.jsx`
- `src/components/OperationalUI.jsx`
- `src/app/globals.css`
- `src/app/page.js`
- `package.json`
- `package-lock.json`
- `CLAUDE.md`
- `ONBOARDING_AGENTIC_REBUILD_NOTES.md`
- `CREATE_SIMPLIFICATION_NOTES.md`
- `MICRO_INTERACTIONS_NOTES.md`

## B. Onboarding Audit
The onboarding route was full-screen, but the first interaction still exposed a large source intake block with website, upload, notes, manual signals, platforms, and formats at once. That made the experience feel form-like and too close to HR intake.

## C. New Onboarding Conversation Model
Onboarding now starts with a conversational assistant message and a bottom composer. Users add context through chat-like turns: website, uploaded file, pasted notes, or a guide request. Source messages appear in the stream instead of one large form.

## D. Source Intake Changes
Website URLs are saved from the composer. Notes and manual descriptions are appended as text notes. File upload remains browser-side V1 intake: text files are parsed, while PDF/images are stored and marked pending analysis.

## E. Dynamic Card Changes
Existing dynamic cards remain in the conversation after the agent acts: understanding, clarifications, draft strategy, programmes, risk checklist, ideas, and approval. WorkTrace is rendered as an assistant message while work is active.

## F. Approval Flow Changes
Approval-before-save is unchanged. The user still reviews the strategy draft and approves before final Brand Profile, Content Strategy, Programmes, and related settings are saved.

## G. Create Simplification Audit
Create foregrounded internal metadata too early, including archetype, era, raw format, reach score, and template workflow detail. This made the production surface feel like an internal metadata console.

## H. UC/Archetype Metadata Cleanup
Default Create rows and the selected item header now emphasize programme/campaign, current stage, next action, and readiness. Archetype/raw template details are moved out of the default hierarchy into collapsed metadata.

## I. Micro-Interaction Implementation
Shared interaction utility classes were added for cards, rows, chips, and secondary action reveal. Buttons now have restrained transitions. Create rows and onboarding chips/messages use these classes.

## J. What Was Intentionally Not Implemented
- Studio V1
- Publishing automation
- Advanced analytics
- New providers
- Billing changes
- CRM features
- Data model rewrite
- PDF/image parsing or OCR
- Advanced web crawling
- Second assistant backend or second visible assistant panel

## K. Build/Lint Results
- Passed: `npm run lint --if-present`
- Passed: `npm run build`

## L. Manual Test Checklist
- Onboarding loads full-screen.
- Onboarding no longer shows one large HR/form-like source intake block.
- Website and notes can be added through the composer.
- File upload appears as source messages/chips.
- PDF/image analysis is not faked.
- WorkTrace appears only while active work is running.
- Clarification and draft cards still appear inside the flow.
- Approval is required before saving.
- Post-approval handoff still works.
- Create foregrounds programme/campaign, current stage, next action, and readiness.
- UC/emotional archetype metadata no longer dominates generic Create UI.
- Home, Strategy, Ideas, Pipeline, Calendar, Analyze, Settings, Billing, Privacy, AgentPanel, and Compliance/Approval/Export still load.
- Focus-visible and hover/active states are present on key interactive items.

## M. Remaining Risks
- The onboarding analysis remains V1 and deterministic/API-backed; it is not a fully streaming assistant.
- The composer supports one primary website URL in the existing intake shape.
- Template metadata still exists and can be opened for power users; deeper profile-specific display rules remain future work.
