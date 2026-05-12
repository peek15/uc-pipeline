# Micro Interactions Notes

## Direction
Sprint 10C adds subtle productive interaction feedback inspired by Claude, VS Code, and Codex. The intent is responsiveness, not decoration.

## Implemented
- Added shared utility classes in `src/app/globals.css`:
  - `ce-interactive`
  - `ce-interactive-row`
  - `ce-interactive-card`
  - `ce-action-chip`
  - `ce-secondary-action`
- Added restrained transitions to shared button styles.
- Added optional `className` support to `Panel` so future surfaces can use shared interaction states.
- Applied row/chip/card interaction classes in onboarding and Create.
- Existing focus-visible styling remains in place for keyboard accessibility.

## Motion Rules
- Transitions are 140ms and limited to background, border, color, opacity, shadow, and restrained active feedback.
- No glow, bounce, gradient, AI shimmer hover, animated icons, or marketing-style motion.
- Active feedback uses a small pressed-state translate only.

## Future Use
Use these classes for clickable cards, list rows, source chips, review buttons, and composer tools when a surface needs subtle responsiveness without adding visual noise.
