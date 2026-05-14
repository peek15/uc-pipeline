# Studio Foundation Notes — Sprint 11A

## A. Files changed / created

| File | Change |
|---|---|
| `src/app/studio/[contentItemId]/page.jsx` | New — Studio route page, fetches story from supabase |
| `src/components/studio/StudioWorkspace.jsx` | New — Full-screen Studio workspace component |
| `src/components/studio/studioMockData.js` | New — Mock blocks, versions, source labels, modifiability model |
| `src/components/CreateView.jsx` | Added "Open in Studio" link button in selected story header |
| `CLAUDE.md` | Added Studio section, bumped version reference to v3.55.0 |
| `src/app/page.js` | Version bump to 3.55.0 |
| `package.json` / `package-lock.json` | Version bump to 3.55.0 |

## B. Route added

`/studio/[contentItemId]` — dynamic Next.js App Router route.

- Reads `contentItemId` from `useParams()`
- Fetches story from `stories` table via supabase browser client
- Falls back gracefully if story not found (shows storyId as title)
- Renders `StudioWorkspace` which is fully functional as a standalone page
- Separate from the main app shell — no sidebar, no Create panel

## C. Create → Studio handoff

- "Open in Studio" button added to the selected content item header in CreateView
- Appears below the "Next action" Pill in the right-side header column
- Uses a plain `<a href={/studio/${selected.id}}>` link — navigates as a full page
- Button is ghost-styled, subtle, 11px, appears only when a content item is selected
- Title attribute: "Review and request precise changes."

## D. Studio layout

```
Studio Shell (min-height: 100vh)
  Header (64px, flex, space-between)
    Left: Back to Create | Studio label | Content title | Version picker | Status badge
    Right: Aspect toggle (Vertical/Horizontal) | Generate new version | Approve version
  Main grid (calc(100vh - 64px), grid 1fr 400px, gap 20px, padding 20-24px)
    Left column (flex column, overflow hidden)
      Player panel (flex 1, min-height 0, bg bg2, border, radius 12)
      Timeline (flex-shrink 0, ~134px, bg bg2, border, radius 10)
    Right column (400px, flex column, bg bg2, border, radius 12)
      Context card (flex-shrink 0, border-bottom)
      Tab bar (flex-shrink 0)
      Revision list (flex 1, overflow-y auto)
      Composer (flex-shrink 0, border-top)
```

## E. Player behavior

- Placeholder dark area with centered title + "Preview not rendered in Sprint 11A" note
- Play/pause toggle runs a JS setInterval incrementing currentTime (0.1s tick)
- Scrubber bar: click to seek, fills proportionally to currentTime/duration
- Duration derived from last block's `end` timecode (or 30s default)
- Vertical mode: `aspect-ratio: 9/16`, height-constrained, max-height 560px
- Horizontal mode: `aspect-ratio: 16/9`, width-constrained
- Aspect toggle in header updates `aspect` state; player re-renders

## F. Timeline block behavior

- Blocks from `story.metadata.studio_blocks` or `getMockBlocks()` fallback
- Mock blocks: Hook (00:00–00:04), Problem (00:04–00:11), Proof (00:11–00:18), CTA (00:18–00:25)
- Each block shows: label, time range, source badge
- Clicking a block → sets selectedBlockId, updates intervalStart/intervalEnd, seeks player to block start
- Orange dot indicator when a block has associated revisions
- Horizontal scroll if blocks overflow

## G. Revision queue behavior

- Revisions stored in local component state (not persisted)
- Each revision: id, timecodeStart, timecodeEnd, subject, comment, instruction, status, blockId, blockLabel
- "Add revision" button creates a revision from current composer text + selected interval
- Subject derived from first 6 words of comment (capitalized)
- Draft instruction: "Review requested: [comment]" — deterministic, clearly labeled "Draft instruction"
- Status starts as "pending"
- "Mark ready" promotes to "ready"
- "Remove" deletes from list
- Empty state prompts user to select a block

## H. Chat/composer behavior

- Textarea at the bottom of the right panel
- Placeholder: "Describe the change for the selected block or time range…"
- Cmd/Ctrl+Enter submits (same as Add revision button)
- Does NOT open the global AgentPanel — this is Studio-specific feedback only
- "Suggest fix" button present but disabled (Sprint 11B)

## I. Regeneration plan placeholder

- "Generate new version" button in header is enabled when `revisions` has pending/ready items
- Disabled with tooltip "Add revisions before generating a new version." when no revisions
- On click: shows `RegenPlanModal` overlay
- Plan lists: revision count, affected blocks, whether visuals/voice/captions may change, compliance note
- "Run generation" button in plan is disabled with title "Regeneration execution not implemented yet. (Sprint 11B)"

## J. Version placeholder

- `MOCK_VERSIONS` = `[{ id: "v1", label: "V1", version: 1, status: "review", note: "Created from initial generation", current: true }]`
- Version picker in header is a dropdown showing version list + note about Sprint 11B
- "Approve version" button always disabled in Sprint 11A (no real version to approve)
- Versions tab in right panel shows version cards with status badges

## K. Source type / modifiability model

```js
SOURCE_LABELS = { user_asset, ai_generated, licensed, text, voice, caption }
SOURCE_MODIFIABILITY = {
  user_asset:  { editable: false, hint: "User asset — replace or trim only, not AI-regenerate by default." }
  ai_generated:{ editable: true,  hint: null }
  licensed:    { editable: false, hint: "Licensed asset — limited edit or replace; rights-sensitive." }
  text:        { editable: true,  hint: null }
  voice:       { editable: true,  hint: null }
  caption:     { editable: true,  hint: null }
}
```

Modifiability hint shown in context card when a non-editable block is selected.
"Editable" / "Restricted" badge on context card.

## L. What is placeholder/local state only

- Video preview is a dark placeholder — no real video rendering
- Play/pause uses a JS timer, not a real media player
- Revisions are local React state — lost on navigation/refresh
- Draft instructions are deterministic text, no AI call
- Version history shows one hardcoded V1 entry
- Block data falls back to `getMockBlocks()` when `story.metadata.studio_blocks` is absent

## M. What was intentionally not implemented

- Real video rendering or media playback
- Provider API calls for regeneration
- Frame-by-frame or multi-track timeline editing
- Drag/drop block reorder
- Persisted revisions (supabase table)
- Persisted versions (supabase table)
- AI-interpreted revision instructions (requires agent call)
- Studio billing / cost event linkage
- Publishing automation
- Version comparison view
- Approval workflow with audit trail
- Authorization checks specific to Studio

## N. Recommended Sprint 11B data model

Tables to add:
- `content_versions` — version rows per story (version number, status, generation job id, created_at, approved_by)
- `studio_blocks` — block rows per version (id, version_id, story_id, label, start_ms, end_ms, source_type, editable, position)
- `edit_requests` — revision/feedback rows (id, story_id, version_id, block_id, timecode_start, timecode_end, user_comment, interpreted_instruction, status, created_by, resolved_at)
- `regeneration_jobs` — job tracking for generation runs (id, story_id, source_version_id, target_version_id, status, edit_request_ids, provider, cost_event_id, created_at)

All tables should be workspace-scoped with RLS.
`regeneration_jobs` should link to `ai_calls` for cost tracking.
Audit events should be added to `content_audit_events` on status transitions.

## O. Build results

```
✓ /studio/[contentItemId]  6.53 kB  157 kB  (dynamic)
Build: clean, 0 errors, 0 warnings
```

## P. Manual test checklist

- [ ] `npm run build` passes clean
- [ ] Main app at `/` loads — Home, Strategy, Ideas, Pipeline, Create, Calendar, Analyze all work
- [ ] Create tab: selecting a content item shows "Open in Studio" button
- [ ] "Open in Studio" navigates to `/studio/[id]`
- [ ] Studio route loads at `/studio/[anyValidId]` — shows Studio workspace
- [ ] Studio route loads at `/studio/fake-id` — shows graceful fallback (no crash)
- [ ] Back to Create button works (returns to `/?tab=create`)
- [ ] Aspect toggle: Vertical shows 9:16 player, Horizontal shows 16:9 player
- [ ] Play/pause button toggles — time increments on play
- [ ] Scrubber click seeks to position
- [ ] Version picker opens dropdown, shows V1 entry
- [ ] Timeline blocks display: Hook, Problem, Proof, CTA with source badges
- [ ] Clicking a timeline block selects it (border changes)
- [ ] Selected block updates right panel context card
- [ ] Context card shows label, timecode, source badge, editable/restricted badge
- [ ] Interval inputs update when block is selected
- [ ] Revision textarea accepts input
- [ ] "Add revision" creates a revision card in the list
- [ ] Revision card shows timecodeStart–End, subject, comment, Draft instruction, status pill
- [ ] "Mark ready" changes status to Ready
- [ ] "Remove" deletes revision card
- [ ] Empty state shown when no revisions
- [ ] "Generate new version" disabled when no revisions (tooltip visible)
- [ ] "Generate new version" enabled with revisions — opens regen plan modal
- [ ] Regen plan lists affected blocks and compliance note
- [ ] "Run generation" in plan is disabled
- [ ] Cmd/Ctrl+Enter in composer submits revision
- [ ] Versions tab shows V1 entry with Sprint 11B note
- [ ] No React hook order errors in console
- [ ] No broken imports or font issues
- [ ] Existing onboarding at `/onboarding` still works
- [ ] Existing pages (Strategy, Pipeline, Calendar, Analyze, Settings) still work

## Q. Remaining risks

- Studio revisions are in local state — refreshing loses work. Sprint 11B persistence is required before Studio is usable for real production.
- The supabase fetch in page.jsx uses the browser client which requires the user to be authenticated. Unauthenticated direct navigation to `/studio/[id]` will return no story data and show the fallback state — this is acceptable for Sprint 11A.
- `story.metadata.studio_blocks` is not populated by any existing workflow yet. Until Sprint 11B wires block creation into the generation flow, Studio always shows mock blocks.
- The player timer (`setInterval`) has no audio/video sync. It's cosmetic only.
- Right panel overflow is not tested at very small viewport heights — minimum usable height is approximately 700px.
