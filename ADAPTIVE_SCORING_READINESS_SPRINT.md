# Adaptive Generic Scoring Sprint
**Date:** 2026-05-13  
**Version:** 3.50.0

## A. Files Changed
- `src/lib/adaptiveScoring.js`
- `src/lib/ai/prompts/score-story.js`
- `src/lib/ai/prompts/reach-score.js`
- `src/components/ResearchView.jsx`
- `src/components/PipelineView.jsx`
- `src/components/DetailModal.jsx`
- `scripts/adaptive-scoring-eval.mjs`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`

## B. Goal
Creative Engine needed scoring that adapts to the user's content, market, audience, platform mix, and brand strategy instead of foregrounding Uncle Carter-era storytelling dimensions as the generic product model.

## C. Adaptive Scoring Model
Added `src/lib/adaptiveScoring.js` with:
- `buildAdaptiveScoringProfile(settings)`
- `scoreContentReadiness(story, settings)`
- `getAdaptiveScore(story, settings)`
- `attachAdaptiveScore(story, settings, aiScore)`

The model uses Brand Profile / Strategy data when available:
- industry and market context
- target audience
- content goals
- target platforms
- active programmes
- content pillars
- compliance sensitivities

V1 components:
- idea quality
- brand fit
- market fit
- production readiness
- compliance readiness

Weights adapt for B2B, regulated, education, social-first, and LinkedIn-oriented contexts.

## D. Prompt Changes
`score-story.js` now asks the model to score as an adaptive Creative Engine content scorer and return both legacy compatibility dimensions and adaptive dimensions.

`reach-score.js` now scores adaptive reach potential for the user's market, buyer/customer context, and platforms instead of relying on sports/name-recognition framing.

## E. Persistence
No SQL migration was added.

Adaptive score detail is stored under:
`story.metadata.adaptive_score`

Legacy fields remain for compatibility:
- `score_total`
- `score_emotional`
- `score_obscurity`
- `score_visual`
- `score_hook`
- `reach_score`

## F. UI Behavior
Pipeline now foregrounds adaptive score in rows and expanded detail. Detailed mode can still surface legacy score metadata.

Detail modal now shows:
- overall adaptive score
- Brand fit
- Market fit
- Production
- Compliance
- Reach and legacy scores as secondary compatibility rows

## G. What Was Intentionally Not Changed
- No ranking/scoring table migration.
- No change to generation logic.
- No change to billing/provider behavior.
- No claim that adaptive score predicts real performance.
- No removal of legacy UC score fields or data.
- No automatic mutation of strategy from scores.

## H. Validation
Run:
- `npm run eval:intelligence`
- `npm run lint --if-present`
- `npm run build`

## I. Remaining Risks
- Adaptive scoring V1 is rule/AI hybrid and should be treated as a readiness/fit signal, not a proven performance model.
- Existing saved stories without `metadata.adaptive_score` rely on deterministic fallback until re-scored.
- Some legacy UI labels may still exist in low-level compatibility paths.
