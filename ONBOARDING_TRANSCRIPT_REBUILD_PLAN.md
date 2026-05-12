# Onboarding Transcript Rebuild Plan

## Goal

Make `/onboarding` feel like a real conversation with Creative Engine, closer to Claude or ChatGPT:

- one continuous transcript
- bottom composer as the primary input
- assistant replies that pace the experience
- generated cards inserted as assistant message artifacts
- WorkTrace shown as tool/work status inside the transcript
- no form-like phase blocks
- approval still required before saving strategy
- existing onboarding APIs and database model preserved

## Current Problem

The current onboarding UI has improved visual chat treatment, but the implementation is still phase-driven:

- `phase` controls separate render blocks: intake, understood, clarify, draft, approved
- `chatEvents` only represents part of the conversation
- `UnderstandingCard`, `ClarificationCards`, `DraftCards`, and `ApprovedState` are rendered outside the transcript model
- actions are separate from message state
- source review appears as component actions rather than message-attached artifacts

This is why it still feels like a styled wizard instead of a live agent conversation.

## Keep

Reuse these pieces:

- `/api/onboarding/session`
- `/api/onboarding/source`
- `/api/onboarding/analyze`
- `/api/onboarding/clarification`
- `/api/onboarding/approve`
- `blankOnboardingIntake`
- `inferFactsFromIntake`
- `buildClarifications`
- `buildDraftStrategy`
- `mergeDraftIntoSettings`
- V1 honesty around PDF/image analysis
- existing session/source/fact/clarification/draft database tables

## Replace

Replace the current UI state shape:

```js
phase
chatEvents
facts
clarifications
draft
loadingTask
pendingAction
```

with a transcript-first shape:

```js
messages = [
  {
    id,
    role: "assistant" | "user" | "system",
    type: "text" | "source" | "work_trace" | "understanding_card" | "clarification_card" | "draft_card" | "approval_card" | "completion_card" | "error",
    text,
    artifact,
    actions,
    status,
    createdAt
  }
]
```

`phase` can remain as a small internal guard, but the UI should render only `messages`.

## Message Types

### `assistant:text`

Normal CE replies.

Examples:

- "Tell me what business or brand we are setting up."
- "Got it. I’ll use this as a source for the first pass."
- "I found a first picture of the brand."

### `user:text`

User composer submissions.

Examples:

- pasted notes
- manual description
- clarification answers

### `user:source`

Source submissions shown as user-side source messages.

Artifact:

```js
{
  sourceType: "website" | "file" | "notes",
  title,
  status: "stored" | "parsed" | "pending_analysis" | "unsupported" | "failed",
  note
}
```

### `assistant:work_trace`

High-level work trace, not chain-of-thought.

Artifact:

```js
{
  steps: [
    { label: "Saving sources", status: "done" },
    { label: "Reading text notes", status: "active" },
    { label: "Preparing clarification questions", status: "pending" }
  ]
}
```

### `assistant:understanding_card`

The "What Creative Engine understood" card.

Artifact:

```js
{
  facts,
  confidence,
  limitations,
  sourceTrace
}
```

Actions:

- confirm
- edit fact
- review work
- continue

### `assistant:clarification_card`

One or two clarification questions at a time.

Artifact:

```js
{
  questions,
  answers,
  hiddenQuestionCount
}
```

Actions:

- answer with chip
- answer with free text
- I'm not sure, suggest for me
- submit answers

### `assistant:draft_card`

Draft strategy artifact.

Artifact:

```js
{
  brandProfile,
  contentStrategy,
  programmes,
  riskChecklist,
  firstContentIdeas,
  uncertainties,
  sourceTrace
}
```

Actions:

- edit before saving
- refine
- review work
- approve and save

### `assistant:completion_card`

Post-approval handoff.

Actions:

- Review Strategy
- Open Ideas
- Create first content
- Go Home

## Conversation Flow

### 1. Start

Append:

```js
assistant:text
"Tell me what business or brand we are setting up. You can paste a website, upload a file, or describe it in your own words."
```

Composer only:

- text area
- Add website
- Upload file
- Paste notes
- I'm not sure, guide me

No separate starter prompt row.

### 2. User Adds Source

Append:

```js
user:source or user:text
assistant:typing
assistant:text acknowledgement
assistant:text with action: "Understand this business"
```

Important: the "Understand this business" action should be attached to the assistant message, not rendered separately.

### 3. Analyze

When user clicks "Understand this business":

Append:

```js
assistant:text "I’m going to read what you gave me now..."
assistant:work_trace
```

Run:

- create session
- save sources
- analyze

Update `work_trace` statuses while calls complete if low-risk.

Append:

```js
assistant:text "I found a first picture of the brand."
assistant:understanding_card
```

### 4. Understanding Review

User confirms or edits facts inside `understanding_card`.

When continuing:

- build clarification list from edited facts

If clarifications exist:

```js
assistant:text "I’m missing one or two things before I draft this."
assistant:clarification_card
```

If none:

```js
assistant:text "I have enough to draft a first strategy."
assistant:work_trace
assistant:draft_card
```

### 5. Clarifications

Show max two questions per card.

When answered:

Append a user message summarizing answers:

```js
user:text "Priority audience: New prospects. Platform: LinkedIn."
```

Then:

```js
assistant:text "Thanks. I’ll fold that into the draft."
assistant:work_trace
assistant:draft_card
```

### 6. Draft Review

Draft card contains:

- Brand Profile
- Content Strategy
- Programmes
- Risk/claims checklist
- First ideas
- Uncertainties

No raw JSON display.

Actions:

- approve and save strategy
- edit before saving
- review work

### 7. Approval

On approve:

Append:

```js
assistant:text "I’ll save the approved strategy now."
assistant:work_trace
```

Run `/api/onboarding/approve`.

Append:

```js
assistant:completion_card
```

## Component Plan

Create or refactor inside `src/app/onboarding/page.jsx` first. Extract later only if it stabilizes.

### New Components

- `OnboardingTranscript`
- `TranscriptMessage`
- `AssistantTextMessage`
- `UserTextMessage`
- `SourceMessage`
- `WorkTraceMessage`
- `UnderstandingArtifact`
- `ClarificationArtifact`
- `DraftStrategyArtifact`
- `CompletionArtifact`
- `Composer`

### Replace Current Components

- `SourceConversationMessages` becomes generic transcript rendering.
- `UnderstandingCard` becomes `UnderstandingArtifact`.
- `ClarificationCards` becomes `ClarificationArtifact`.
- `DraftCards` becomes `DraftStrategyArtifact`.
- `ApprovedState` becomes `CompletionArtifact`.

## State Management Plan

Use `useReducer` to avoid fragile scattered `setState` calls.

Reducer actions:

- `append_message`
- `replace_message`
- `update_message_artifact`
- `set_typing`
- `set_work_trace`
- `set_intake`
- `set_session`
- `set_sources`
- `set_facts`
- `set_draft`
- `set_error`
- `set_runtime`

Runtime state can remain separate:

```js
runtime = {
  tenant,
  user,
  session,
  intake,
  facts,
  clarifications,
  draft,
  loadingTask
}
```

But render should depend on `messages`, not phase blocks.

## Action Handler Plan

### `handleComposerSubmit`

- parse input as URL or notes
- update intake
- append user message
- queue assistant acknowledgement
- append assistant action message

### `handleFileUpload`

- classify files
- update intake
- append source messages
- queue honest assistant acknowledgement
- append assistant action message

### `handleAnalyze`

- append assistant text
- append work trace
- call session/source/analyze APIs
- replace/update work trace
- append understanding card

### `handleUnderstandingContinue`

- persist edited facts locally
- generate clarifications
- append clarification card or draft work trace

### `handleClarificationSubmit`

- append user answer summary
- call clarification route
- call analyze with keyed answers
- append draft card

### `handleApprove`

- append approval work trace
- call approve route
- append completion card

## UI Rules

- Full-width transcript, but text content should still have readable line length inside cards.
- No duplicated controls.
- Composer is the only persistent input surface.
- Action buttons belong to assistant messages/cards.
- No hover highlight on chat bubbles.
- Send button darkens on hover.
- Sources/work review appears only inside relevant artifacts.
- No fake source analysis.
- No right-side AgentPanel.

## Risk Points

- Avoid losing edited fact state when replacing message artifacts.
- Keep React hooks above early returns.
- Keep file upload honest for PDF/images.
- Ensure approval uses the latest draft artifact, not stale `draft` state.
- Ensure Build still prerenders `/onboarding`.
- Avoid changing API contracts in this pass.

## Suggested Implementation Order

1. Add transcript message schema helpers.
2. Add reducer and transcript renderer.
3. Convert initial assistant message and composer submissions to transcript messages.
4. Convert source upload and source acknowledgement.
5. Convert analysis flow to append WorkTrace and Understanding artifact.
6. Convert understanding edits to update message artifact and runtime facts.
7. Convert clarifications to transcript artifact.
8. Convert draft to transcript artifact.
9. Convert approval/completion to transcript artifact.
10. Remove old phase-rendered blocks.
11. Run lint/build.
12. Manual test onboarding from empty workspace and existing brand refresh.

