# Commercial Hardening Sprint 9C

Conversational onboarding redesign.

## A. Files Changed
- `src/app/onboarding/page.jsx`
- `src/components/HomeView.jsx`
- `CLAUDE.md`
- `package.json`
- `package-lock.json`
- `ONBOARDING_EXPERIENCE_NOTES.md`
- `ONBOARDING_SOURCE_REVIEW_NOTES.md`
- `COMMERCIAL_HARDENING_SPRINT_9C.md`

## B. Current Onboarding Audit
Existing Sprint 6 onboarding had strong backend foundations and approval-before-save behavior. It used:
- sessions
- sources
- extracted facts
- clarifications
- drafts
- approval route

The UI was too static and form-like:
- source intake felt like a form page
- step/progress framing felt wizard-like
- WorkTrace/generating states were absent
- source review was not an on-demand conversational pattern
- completion did not feel like a handoff into the product workspace

Backend rewrite was not needed.

## C. New Conversational Flow
The onboarding page is now full-screen and conversation-first:
1. Creative Engine asks for business sources.
2. User provides website/files/notes/manual answers in a conversational source card.
3. A generating card/WorkTrace appears while analysis runs.
4. A "What Creative Engine understood" card appears.
5. Clarification cards ask only missing or uncertain questions.
6. Draft strategy cards appear.
7. User approves and saves strategy.
8. Completion state offers Strategy, Ideas, Create, and Home handoff.

The normal right-side AgentPanel is not shown on `/onboarding`.

## D. Source Intake Behavior
Supported V1 intake:
- website URL
- uploaded files
- pasted notes
- manual answers

Honest source statuses:
- MD/TXT/text: parsed when browser file reading succeeds
- pasted notes: parsed
- website URL: stored; no advanced open-web crawling
- PDF/images: stored but marked pending analysis
- unsupported files: stored where possible and marked unsupported

No PDF/image analysis is faked.

## E. WorkTrace Behavior
Onboarding uses Sprint 9A `GeneratingCard` / `WorkTrace` primitives for high-level task progress.

Example steps:
- Saving sources
- Reading text notes
- Extracting business facts
- Identifying products/services
- Identifying likely audiences
- Checking unclear claims
- Preparing clarification questions
- Drafting Brand Profile
- Drafting Content Strategy
- Drafting Programmes
- Preparing first content ideas

No chain-of-thought or timestamp-heavy activity stream is shown.

## F. Generating Card Behavior
Generating cards appear while analysis, drafting, or approval save is active. They show high-level work steps and avoid spinner-only states.

Structured outputs reveal as cards:
- Brand Profile draft
- Content Strategy draft
- Recommended Programmes
- Risk / claims checklist
- First 10 content ideas

## G. Clarification Behavior
Clarifications render as conversational cards.

Supported types:
- free text
- single choice
- multi choice
- choice plus other
- confirmation

The "I'm not sure — suggest for me" option is preserved where backend clarification options include it, and free-text questions also expose it as an action.

## H. Source / Work Review Behavior
Source/work review is on demand using `SourceReviewButton`.

It can show:
- sources used
- uploaded files used
- manual answers used
- high-level work performed
- confidence/uncertainty where available

If no detailed trace is available, the shared drawer says:
"No detailed source trace is available for this action."

## I. Approval Flow
Approval remains unchanged at the backend level:
- draft is reviewed by the user
- user clicks "Approve and save strategy"
- `/api/onboarding/approve` writes final Brand Profile / Content Strategy / Programmes settings
- local settings cache is updated
- phase becomes approved

Nothing is silently written before approval.

## J. Home / Strategy Handoff
Completion state now offers:
- Review in Strategy
- Open Ideas
- Create first content
- Go to Home

Home was also adjusted so incomplete brand setup points directly to onboarding rather than only to Strategy.

## K. Privacy / Data Handling Copy
Onboarding now uses lightweight privacy-aware copy:

"Creative Engine may process the sources you provide to draft your strategy. Only upload materials you are allowed to use. Privacy and data controls can be reviewed in Settings."

No ZDR/no-retention or provider privacy claims were added.

## L. What Was Intentionally Not Implemented
- Advanced web crawling
- Drive/bucket connection
- Studio V1
- Pipeline/Create/Calendar/Analyze redesigns
- New providers
- Publishing automation
- Billing features
- CRM
- PDF/image deep analysis
- Second assistant backend
- Right-side AgentPanel inside onboarding
- Chain-of-thought display

## M. Build / Lint Results
- Initial build checkpoint passed after replacing onboarding UI.
- `npm run lint --if-present` passed with exit code 0.
- `npm run build` passed cleanly.

## N. Manual Test Checklist
- App builds clean.
- Onboarding route loads.
- Onboarding is full-screen.
- Normal right-side AgentPanel is not shown during onboarding.
- Onboarding feels conversation-first, not form-first.
- Website URL intake stores source/fails gracefully.
- MD/TXT/notes intake works where supported.
- PDF/image upload does not fake analysis.
- Source status cards show honest states.
- WorkTrace appears during analysis/drafting.
- Generating cards appear for active work.
- "What Creative Engine understood" appears.
- Clarification cards work.
- "I'm not sure — suggest for me" works or is handled.
- Source/work review opens on demand.
- Final approval writes strategy as before.
- Post-approval CTA to Strategy/Home works.
- Home readiness does not break.
- Strategy does not break.
- Settings fallback still works.
- Privacy settings still work.
- Billing still works.
- Compliance/Approval/Export still works.
- Pipeline/Ideas/Create/Calendar/Analyze still work.
- No React hook order issues.
- No broken imports.
- No font/build issues.

## O. Remaining Risks
- Source trace is intake-derived and high-level; the backend does not yet return a full durable trace for every generated draft.
- Website URLs are stored but not deeply crawled.
- PDF/image files are not deeply analyzed.
- Draft cards are still JSON-like for Brand Profile / Strategy; future polish should make them editable structured cards.
- Regenerate behavior is limited to re-running analysis with clarification answers.
- Vercel font fetch is still not independently verified.
