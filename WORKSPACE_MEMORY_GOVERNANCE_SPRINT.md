# Workspace Memory Governance Sprint
**Date:** 2026-05-13
**Version:** 3.52.0

## A. Files Changed
- `src/components/SettingsModal.jsx`
- `scripts/workspace-memory-eval.mjs`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`
- `package.json`
- `package-lock.json`
- `src/app/page.js`

## B. Goal
Creative Engine now uses durable workspace memory across operational AI calls. This sprint adds user-facing governance so memory is visible and controllable, and removes Brand Profile / Strategy / Programmes from Settings as primary sections.

## C. Workspace Memory UI
Settings now includes **Workspace Memory**.

Users can:
- refresh memory
- keep memory
- edit memory summaries
- archive memory
- mark memory wrong

The UI shows source, status, confidence, summary, and available source-citation metadata where present.

## D. Retrieval Behavior
No SQL migration was added.

Memory retrieval already only includes rows with status:
- `open`
- `reviewed`
- `applied`

The governance UI marks inactive memory as:
- `archived`
- `wrong`

Those statuses are excluded from prompt injection.

## E. Settings Repositioning
Settings no longer exposes Brand Profile, Strategy, or Programmes as primary sections.

Those surfaces live in the Strategy tab. Settings remains for:
- Workspace
- Rules & Alerts
- Appearance
- Workspace Memory
- Privacy & Data
- Providers
- Intelligence
- Billing
- Danger Zone

If a user had an old saved settings section of `brand`, `strategy`, or `programmes`, the modal redirects to Workspace.

## F. What Was Intentionally Not Changed
- No new database migration.
- No embeddings/vector retrieval.
- No memory compaction/dedupe worker.
- No automatic strategy mutation from memory.
- No removal of underlying legacy helper code needed by existing settings/schema compatibility.

## G. Validation
Run:
- `npm run eval:intelligence`
- `npm run lint --if-present`
- `npm run build`

## H. Remaining Risks
- Memory edit history is not versioned yet.
- Memory governance is still row-based, not clustered by topic.
- A future sprint should add semantic retrieval, decay, dedupe, and source grouping.
