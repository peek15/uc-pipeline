# Privacy / Data Protection Test Plan

## A. No Raw Prompt Logging
1. Send an AI request containing a unique canary phrase.
2. Verify `ai_calls`, `cost_events`, and `audit_log` do not contain the canary phrase.
3. Verify only metadata, `payload_hash`, data class, privacy mode, provider, model, tokens, and sanitized errors exist.

## B. D4 Secret Redaction
1. Send text containing fake keys such as `sk-test-12345678901234567890`.
2. Expected: D4-classified payload is blocked, or secret patterns are redacted before provider call.
3. Verify logs do not contain fake secrets.

## C. D2 Confidential Routing
1. Mark payload as `D2_CONFIDENTIAL`.
2. Attempt standard Anthropic/OpenAI route in `standard` or `confidential` mode.
3. Expected: blocked unless a verified no-retention provider profile is enabled.

## D. D3 Sensitive Routing
1. Mark payload as `D3_SENSITIVE`.
2. Attempt standard provider route.
3. Expected: blocked from standard providers.

## E. Provider Profile Enforcement
1. Try provider key with no privacy profile.
2. Expected: blocked with provider profile missing.
3. Try D4 against every AI/media profile.
4. Expected: blocked.

## F. Upload Minimization
1. Upload or simulate a long MD/TXT source in onboarding.
2. Verify full document is chunked/truncated for AI availability.
3. Verify PDF/image sources are accepted but not falsely analyzed.

## G. Export Safety
1. Call `/api/privacy/export` as owner/admin.
2. Verify manifest excludes provider secret values and raw credentials.
3. Verify editor/viewer cannot create export request.

## H. Deletion Request Safety
1. Call `/api/privacy/delete-request`.
2. Verify request row/marker is created.
3. Verify no destructive deletion occurs.

## I. Privacy Settings Permissions
1. Owner/admin can update privacy mode.
2. Editor/viewer can read but cannot update.
3. Cross-workspace user cannot read or update.

## J. Provider Transparency
1. Open Settings → Privacy & Data Handling.
2. Verify provider table shows purpose, data processed, retention, no-training status, and Enhanced Privacy compatibility.
3. Verify unknowns are not presented as safe.

## Automation Candidates
- Unit tests for `canSendToProvider()`, `redactSecrets()`, `minimizeMessages()`, and `buildWorkspaceExportManifest()`.
- Route tests for `/api/privacy/settings`, `/api/privacy/export`, and `/api/privacy/delete-request` once a test harness exists.
