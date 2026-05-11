# Commercial Hardening Sprint 9A

UI / Workflow Audit and Design System Foundation.

## A. Files Changed
- `CLAUDE.md`
- `UI_DIRECTION.md`
- `WORKFLOW_NAVIGATION_AUDIT.md`
- `PRODUCT_EXPERIENCE_AUDIT.md`
- `COMMERCIAL_HARDENING_SPRINT_9A.md`
- `src/app/layout.js`
- `src/app/globals.css`
- `tailwind.config.js`
- `src/app/page.js`
- `src/components/OperationalUI.jsx`
- `src/lib/agent/agentContext.js`
- `package.json`
- `package-lock.json`

## B. Current Workflow Audit
Current workflow is functional but still architecture-led:

Onboarding drafts strategy, then users work through Ideas/Research, Pipeline, Create, Calendar, Analyze, and item-level compliance/approval/export in DetailModal. Settings still carries strategic configuration, privacy, billing, providers, and appearance. AgentPanel remains the single assistant surface.

The current flow is compatible with the target workflow, but Strategy and Home are not first-class tabs yet.

## C. Target Workflow Direction
Target navigation:

Home -> Strategy -> Ideas -> Pipeline -> Create -> Calendar -> Analyze

Home should answer what needs attention now. Strategy should expose Brand Profile, Content Strategy, Programmes, and risks. Ideas should replace Research as opportunity generation. Pipeline should track in-progress content. Create should become the agentic drafting/production workspace. Calendar should handle planning. Analyze should show transparency and workspace learning signals without overpromising intelligence.

## D. Current Tab Audit
Current tabs after safe Sprint 9A label cleanup:
- Pipeline (`pipeline`)
- Ideas (`research` key retained)
- Create (`create`)
- Campaigns (`campaigns`)
- Calendar (`calendar`)
- Analyze (`analyze`)

Campaigns remains because removing it is a navigation restructure. Strategy remains in Settings for now. Home is postponed to Sprint 9B.

## E. UI Prototype-Feel Audit
Primary issues:
- Strategy is hidden in Settings despite being core product infrastructure.
- Pipeline is powerful but visually dense.
- Analyze uses intelligence-stage framing that can overpromise.
- Loading patterns are mixed across spinners, pulses, and local implementations.
- Several components use one-off card/button/radius/color styles.
- User-visible and code-level naming still mixes "story", "script", "research", and generic content language.

## F. UC-Specific Language Audit
Must remain for UC profile/content data:
- Uncle Carter brand/workspace data.
- NBA/team/player values when supplied by the UC workspace.

Should become generic globally:
- Research -> Ideas.
- Stories -> Content items.
- Script -> Draft/copy where appropriate.
- Players -> Subjects.
- Archetype -> Angle/format/programme taxonomy.
- Intelligence Layer -> Workspace signals.

Postponed:
- Database table/column renames.
- Prompt internals that still use `stories`.
- Keyboard shortcut labels until the navigation rewrite.

## G. Design System Foundation
Added Creative Engine tokens:
- `--ce-bg`
- `--ce-surface`
- `--ce-surface-raised`
- `--ce-surface-elevated`
- `--ce-border`
- `--ce-border-strong`
- `--ce-text`
- `--ce-text-muted`
- `--ce-accent`
- `--ce-focus-ring`
- `--ce-radius-sm`
- `--ce-radius`
- `--ce-radius-lg`
- `--ce-page-padding`
- `--ce-card-padding`
- `--ce-section-gap`
- `--ce-shadow`

Added sober placeholder accent tokens:
- `--accent`
- `--accent-bg`
- `--accent-border`

The legacy `--gold` token remains for compatibility, but is no longer the only accent path.

## H. Typography Changes
Integrated:
- Instrument Sans as primary UI font.
- IBM Plex Mono as mono font.
- Existing Instrument Serif remains available for editorial/script contexts.

The first sandboxed build could not fetch new Google fonts because network access was blocked. The escalated build fetched fonts and passed.

## I. Loading System Direction
Implemented reusable primitives:
- `LoadingButton`
- `SkeletonBlock`
- `SkeletonCard`
- `SkeletonList`
- `WorkTrace`
- `GeneratingCard`

Direction:
- skeleton/shimmer for loading structure
- WorkTrace for high-level agentic tasks
- generating cards for draft outputs
- streaming where real streaming exists
- no progress bars except real file upload progress

## J. Source / Work Review Direction
Implemented reusable on-demand primitives:
- `SourceReviewButton`
- `SourceReviewDrawer`

Pattern supports:
- sources used
- work performed
- confidence/uncertainty
- empty state: "No detailed source trace is available for this action."

No source data is faked.

## K. Home Reveal Direction
Home is not built in Sprint 9A. Direction is documented:
- controlled reveal is acceptable
- no WorkTrace by default
- no progress bar
- no boot copy
- no UC/clock/sports metaphors
- Home should be operational and next-action-led

## L. What Was Implemented Now
- Version bumped to `v3.30.0`.
- Instrument Sans / IBM Plex Mono configured through `next/font/google`.
- Creative Engine design tokens added to global CSS and Tailwind config.
- Low-risk navigation label cleanup:
  - Content -> Pipeline
  - Research -> Ideas
  - Schedule -> Calendar
  - Insights -> Analyze
- Calendar icon changed from clock to calendar.
- Agent context label for `research` now displays Ideas.
- Shared primitives added to `OperationalUI.jsx`.
- UI direction and workflow audits documented.
- CLAUDE.md updated with Creative Engine UI direction.

## M. What Is Intentionally Postponed
- Full navigation rewrite.
- Home cockpit implementation.
- Strategy tab implementation.
- Full onboarding redesign.
- Pipeline/Create/Calendar/Analyze redesigns.
- Database schema renames from `stories`.
- Removing Campaigns from nav.
- Full visual refresh of all components.
- Studio V1.
- Publishing automation.
- New providers, billing features, CRM.

## N. Recommended Sprint 9B / 9C / 9D Plan
Sprint 9B:
- Add Home cockpit.
- Add Strategy tab shell using existing Brand Profile / Content Strategy / Programmes data.
- Keep Settings for account, providers, privacy, billing, appearance, advanced controls.

Sprint 9C:
- Migrate Research UI toward Ideas.
- Add source/work review affordances to Ideas and Onboarding.
- Reduce Pipeline visual clutter with collapsible filters and clearer next action state.

Sprint 9D:
- Redesign Create around agentic task flow, generating cards, and source review.
- Reframe Analyze as workspace signals/transparency.
- Apply primitives consistently across Compliance/Approval/Export and Calendar.

## O. Build / Lint Results
- `npm run build` failed once in sandbox because new Google fonts could not be fetched without network access.
- `npm run build` passed with approved network access.
- `npm run lint --if-present` passed with exit code 0.
- Final `npm run build` passed after fonts were available.

## P. Manual Test Checklist
- App builds clean.
- App loads.
- Login still works.
- Sidebar still works with updated labels.
- Settings still opens.
- AgentPanel still works.
- Onboarding still opens.
- Pipeline still works.
- Ideas/Research still works under existing `research` key.
- Create still works.
- Calendar still works.
- Analyze still works.
- Compliance/Approval/Export UI still works.
- Privacy settings still work.
- Billing still works.
- Dark/light mode still works.
- No React hook order issues.
- No broken imports.
- No font loading/build errors after network-approved build.

## Q. Remaining Risks
- New font fetching requires build-time network unless fonts are cached by CI/Vercel. Vercel normally supports this, but a future no-network build would need local font assets or fallback-only configuration.
- `SharedUI.jsx` and `OperationalUI.jsx` still overlap; future cleanup should consolidate primitives.
- Label cleanup is user-visible but route keys remain old, especially `research`.
- Analyze still contains overpromising copy internally; Sprint 9D should reframe it.
- Strategy is still inside Settings until the target nav migration.
- Legacy schema names (`stories`, `players`, `archetype`, `scripted`) remain by design.
