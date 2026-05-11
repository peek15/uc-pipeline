# Commercial Hardening Sprint 8

Compliance / Approval / Export Flow for Creative Engine / Uncle Carter Pipeline.

## A. Files Changed
- `supabase-sprint8-compliance-approval-export.sql`
- `src/lib/compliance/*`
- `src/app/api/compliance/check/route.js`
- `src/app/api/compliance/acknowledge/route.js`
- `src/app/api/approval/approve/route.js`
- `src/app/api/approval/revoke/route.js`
- `src/app/api/export/content/route.js`
- `src/components/DetailModal.jsx`
- `src/app/page.js`
- `src/lib/agent/taskTypes.js`
- `src/lib/agent/agentContext.js`
- `src/lib/privacy/dataLifecycle.js`
- `CLAUDE.md`
- `package.json`
- `package-lock.json`

## B. Existing Content / Status Audit
Current content moves through the existing `stories` model:

Research creates candidate stories, applies the Quality Gate, and inserts accepted items into Pipeline. Pipeline manages story status transitions through `accepted`, `approved`, `scripted`, `produced`, and `published`, with `rejected` and `archived` as side states. Create/Script writes scripts and production fields back onto `stories`. Calendar schedules existing stories and avoids quality-gate blocked items. Analyze imports metrics and updates story performance context.

Existing Quality Gate fields remain on `stories`: `quality_gate`, `quality_gate_status`, `quality_gate_blockers`, `quality_gate_warnings`, and `quality_gate_checked_at`. Sprint 8 does not replace this model. Compliance/approval/export is layered alongside it using workspace-scoped tables keyed by `story_id`.

## C. SQL Migration / Schema Changes
Added `supabase-sprint8-compliance-approval-export.sql` with:
- `content_compliance_checks`
- `content_approvals`
- `content_exports`
- `content_audit_events`

Each table is workspace-scoped, indexed by workspace/brand/story/status/created time where relevant, and protected with workspace-member RLS policies using the existing `is_workspace_member(workspace_id)` pattern.

The migration must be applied manually before persistence works in Supabase.

## D. Compliance Check Model
Compliance checks are V1 rule-based and AI-ready. They check generated story/script/caption metadata for claims and export risks, then store a check row with status, risk score, risk level, warnings, summary, and model marker `rule-based-v1`.

Statuses:
- `clear`
- `warning`
- `needs_acknowledgement`
- `blocked`
- `failed`

## E. Risk Scoring Model
Risk scoring is deterministic:
- low warnings add small score
- medium warnings add moderate score
- high warnings require acknowledgement
- critical warnings block approval/export

Checked topics include unverified performance claims, health/medical claims, financial claims, environmental claims, legal/regulatory claims, direct comparisons, guarantees, aggressive paid-ad language, missing asset-rights confirmation, and brand strategy sensitivities.

## F. API Routes Added
- `POST /api/compliance/check`
- `POST /api/compliance/acknowledge`
- `POST /api/approval/approve`
- `POST /api/approval/revoke`
- `POST /api/export/content`

All routes require an authenticated user, require workspace membership, verify story/workspace scope, and use service-role writes only after authorization.

## G. UI Changes
The existing `DetailModal` now includes a Compliance section:
- run/re-run compliance check
- show AI audit status, risk score, summary, and warning count
- show acknowledgement copy when required
- approve for export
- generate export package preview

This is a minimal integration point inside the existing content detail flow. No second AI panel was created.

## H. Assistant Integration
Warnings expose a single `Ask assistant` action that opens the existing right-side assistant via `openAssistant(buildAgentContext(...))`.

Context includes workspace, brand, `source_view: compliance`, `source_entity_type: compliance_check`, the audit snapshot, compact content snapshot, brand snapshot, and suggested actions:
- explain warning
- rewrite safely
- suggest safer CTA
- reduce claim risk
- prepare approval summary

Task registry additions:
- `suggest_safer_cta`
- `reduce_claim_risk`
- `prepare_approval_summary`
- `export_help`

## I. Acknowledgement Flow
High-risk checks return `needs_acknowledgement`. The UI shows:

> I understand that I am responsible for reviewing claims, asset rights, publication, advertising use, and legal/platform compliance before using or publishing this content.

Acknowledgement is stored as a pending `content_approvals` row with acknowledgement metadata, warning snapshot, user id, and timestamp. Acknowledgement does not approve final content by itself.

## J. Approval Flow
`Approve for export` is allowed when:
- latest compliance check is clear/warning, or
- high-risk warnings were acknowledged, or
- the export is internal/draft only

Blocked checks cannot be approved. Approval writes `approval_status: approved`, `approved_by`, `approved_at`, warning snapshot, and metadata. Revoke API is implemented for low-risk rollback.

## K. Export Package Behavior
V1 export types:
- `copy_package`
- `markdown`
- `json`
- `internal`

Export packages include title, story id, brand reference, script/text, hook, caption, CTA, visual direction, platform notes, compliance summary, warnings, approval metadata, acknowledgement text, and export timestamp. There is no publishing automation and no platform API connection.

## L. Privacy / Data Protection Alignment
Sprint 8 uses rule-based local checks by default, so no external AI provider receives content for compliance checks. Safe logging helpers are used for server-side error handling. Sprint 7 export manifests now include compliance/approval/export/audit tables.

If future AI compliance assistance is added, it must use the Sprint 7 privacy gateway, prompt minimization/redaction, and safe cost logging before provider calls.

## M. Cost Logging Behavior
No AI provider is used for the V1 compliance check, acknowledgement, approval, or export package generation. Therefore no AI cost events are written for rule-based checks.

Assistant explanations or rewrites still route through the existing assistant system and task registry, where cost centers/categories are available for logging.

## N. What Is Intentionally Not Implemented
- Studio V1
- publication automation
- platform API publishing
- new AI providers
- billing/pricing/credits/overages
- CRM features
- exhaustive legal/platform compliance rules
- legal validation guarantees
- mandatory Peek Media human review
- advanced privacy controls beyond Sprint 7 foundation

## O. Build / Lint Results
- `npm run build` passed.
- `npm run lint --if-present` completed with exit code 0. No lint script output was produced.

## P. Manual Test Checklist
- App builds clean: passed.
- Compliance section appears in content detail modal: build-verified.
- Right-side assistant is reused from compliance warning: implemented through `openAssistant(ctx)`.
- No second AI panel created: confirmed.
- API routes reject unauthenticated requests: implemented through `getAuthenticatedUser`.
- API routes require `workspace_id`: implemented.
- API routes require workspace membership: implemented.
- Compliance check can run on a story: requires applying Sprint 8 SQL migration.
- Clear content can be approved: requires DB migration/manual runtime check.
- Warning content requires acknowledgement before approval/export: implemented, requires DB migration/manual runtime check.
- Approval stores user/timestamp metadata: implemented.
- Export package is generated after approval: implemented.
- Internal export bypass path exists: implemented.
- Existing Research/Pipeline/Create/Calendar/Analyze flows compile.
- Settings, Privacy, Onboarding, and Billing compile.
- RLS cross-workspace protection: migration policy added; should be tested after applying SQL.
- No raw full content is written to logs by Sprint 8 routes.
- No React hook order issues detected by build.

## Q. Remaining Risks
- `supabase-sprint8-compliance-approval-export.sql` must be applied before UI/API persistence can work.
- V1 compliance is rule-based and intentionally incomplete. It surfaces warnings, not legal conclusions.
- Asset-rights detection depends on explicit story metadata or visual fields; users still need a real rights workflow later.
- The UI does not yet preload historical compliance/approval/export rows when opening a story.
- Export package download/copy controls are preview-only in the modal; full file download UX can be expanded later.
- ZDR/no-retention routing remains a Sprint 7 placeholder and is not claimed active here.
