# Creative Engine Data Retention Policy — Internal Draft

**Status:** Sprint 7 implementation foundation. Not public legal copy.

## Default Rules
- **Raw uploads:** configurable retention. Sprint 7 default helper uses 60 days for raw uploads.
- **Extracted text/chunks:** retain while workspace is active unless deleted or scheduled for deletion.
- **Generated deliverables:** retain while workspace is active unless user deletes them.
- **Cost/usage records:** retain for billing, legal, accounting, abuse prevention, and pricing intelligence. Must not contain raw prompts/responses or secrets.
- **AI call metadata:** retain for audit/cost/debug with no raw prompt/response by default.
- **Audit logs:** retain minimum operational trail required for accountability and security.
- **Provider secrets:** never exported as values. Store only in `provider_secrets`; exports may include metadata/flags only.
- **Deleted workspace:** schedule deletion for client content with accounting/legal/security exceptions.

## Deletion Safety
Sprint 7 adds request scaffolds only:
- `/api/privacy/delete-request`
- `privacy_requests`
- retention markers

No destructive deletion is performed by the request route. A separate reviewed job must handle actual deletion, legal holds, billing exceptions, and storage cleanup.

## Export Safety
Sprint 7 adds manifest scaffolding:
- `/api/privacy/export`
- `buildWorkspaceExportManifest()`

Exports must exclude:
- provider secret values;
- service-role keys;
- D4 secrets;
- raw provider credentials;
- raw AI provider request/response bodies;
- raw logs containing prompt/response payloads.

## Retention Statuses
- `active`
- `delete_requested`
- `scheduled_for_deletion`
- `deleted`
- `legal_hold`

## Tables Needing Lifecycle Awareness
- `workspaces`
- `brand_profiles`
- `stories`
- `story_documents`
- `source_documents`
- `document_chunks`
- `asset_library`
- `visual_assets`
- `onboarding_*`
- `ai_calls`
- `cost_events`
- `audit_log`
- `privacy_requests`
