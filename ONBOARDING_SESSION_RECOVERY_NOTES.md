# Onboarding Session Recovery Notes
**Date:** 2026-05-12  
**Scope:** Smart onboarding Sprint 5

## What Changed
- Added `/api/onboarding/state` for persisted onboarding state snapshots.
- The onboarding UI now restores the latest active session state before falling back to transcript memory.
- State snapshots are persisted at major transitions:
  - agent turn updates
  - source analysis complete
  - clarification phase
  - draft generation
  - draft refinement
  - approval

## Persisted State
Snapshots include:
- phase
- intake
- saved sources
- facts
- confidence
- clarifications
- answers
- draft
- limitations
- setup brief
- suggested replies

## Storage Model
- State snapshots are stored in `onboarding_agent_memory` as system events with `payload_json.state_snapshot`.
- No new migration was required beyond the existing onboarding agent memory table.
- The endpoint requires authenticated workspace membership and verifies the onboarding session belongs to the workspace.

## Restore Behavior
- On `/onboarding`, the UI looks for the latest active session.
- If a state snapshot exists, the UI restores functional state from it.
- If no state snapshot exists, the UI falls back to transcript memory and agent summary where available.

## Limitations
- This is a practical recovery snapshot, not a full replayable state machine.
- Oversized snapshot fields are trimmed server-side.
- If `supabase-sprint10-onboarding-agent-memory.sql` is not applied, state persistence is unavailable and the UI falls back gracefully.
