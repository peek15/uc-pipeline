# Product Experience Audit

## Prototype-Feel Issues
- Navigation is still architecture-led rather than user-workflow-led. Campaigns is a useful object, but target navigation wants Home/Strategy/Ideas/Pipeline/Create/Calendar/Analyze.
- Strategy is mostly hidden inside Settings, even though it is now a core product control center.
- Research still has code-level and UX-level wording tied to "stories" and legacy research behavior.
- Pipeline has powerful filters but can feel dense because many controls compete with stage flow.
- Create carries historical Script/Production naming and mode behavior.
- Calendar can feel disconnected from approval/export readiness unless the user opens item detail.
- Analyze uses "Intelligence Layer", "Predictive Scoring", and stage language that can overpromise for V1.
- Loading often uses spinners or pulses where skeletons/generating cards would feel more product-grade.
- Some UI still relies on hard-coded color values instead of semantic tokens.

## UC-Specific Language Audit
Must remain for UC profile/content data:
- Uncle Carter as saved workspace/brand name.
- NBA/team/player values when the active UC workspace intentionally uses them.
- Historical story fields in data schema where renaming would be high-risk.

Should become generic globally over time:
- "Research" -> "Ideas" in user-visible navigation and future docs.
- "Stories" -> "Content items" where the UI is generic.
- "Script" -> "Draft" or "Copy" depending context.
- "Archetype" -> "Angle", "format", or brand taxonomy term.
- "Players" -> "Subjects" for generic content.
- "Produced" -> "Ready" or "Produced" depending whether actual production artifacts exist.
- "Intelligence Layer" -> "Workspace signals" or "Learning signals".
- "Predictive Scoring" -> "Predicted score" only where enough data exists and caveated.

Can be postponed:
- Database column names like `stories`, `players`, `archetype`, and `scripted`.
- Existing prompt internals where `brandConfigForPrompt` already makes generic settings available.
- Keyboard shortcut groups labeled Script/Pipeline until the Create/Pipeline redesign.

## UI Inconsistency Audit
- Multiple components define local card/button styles instead of shared primitives.
- `SharedUI.jsx` and `OperationalUI.jsx` overlap in empty/skeleton/card concepts.
- Border radii range from 5 to 14 px; Sprint 9A adds CE radius tokens for future normalization.
- Accent usage still includes gold as a legacy token. Sprint 9A adds neutral `--accent` placeholders but does not remove gold yet.
- Mono font declarations were repeated as raw `ui-monospace` strings; Sprint 9A introduces IBM Plex Mono token.
- Some loading components use spinners where skeletons would better preserve layout.

## Analyze Framing Audit
Analyze should be framed as transparency and workspace learning signals:
- what content exists
- what was approved/exported
- what compliance signals are recurring
- what performance snapshots exist
- what patterns might be emerging

Avoid claiming:
- mature ML
- reliable prediction with low data
- automated strategy intelligence
- legal/compliance certainty

## Home Direction Audit
There is no true Home cockpit yet. The existing default tab is Pipeline, supported by ProductionAlert and onboarding prompt. Sprint 9B should add Home as a next-action surface without turning it into a landing page or boot screen.

