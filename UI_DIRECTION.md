# Creative Engine UI Direction

North star: calm, premium, source-aware AI operations.

Creative Engine should feel like a serious AI content operations workspace for B2B clients. It should be source-aware and transparent without feeling like a technical demo. It should be agentic without becoming gimmicky. The product outcome can feel agency-like, but the interface should feel software-like: clear state, clear ownership, clear next actions.

## Product Identity
- Creative Engine is not Uncle Carter.
- Avoid Uncle Carter, NBA, sports, clock, pocket-watch, or storytelling-specific metaphors as generic product identity.
- Use neutral operational language: workspace, brand, strategy, ideas, content item, draft, approval, export, source, signal.
- Keep UC-specific language only where a UC workspace/profile intentionally supplies it as content data.

## Visual Principles
- 90-95% neutral UI.
- 5-10% accent maximum.
- Accent is a placeholder token, not a final brand lock.
- Use color for state, focus, selection, warning, approval, compliance, or rare highlights.
- Avoid AI gradients, rainbow effects, colorful clutter, decorative animations, and prototype-style oversized elements.
- Prefer quiet surfaces, crisp hierarchy, compact controls, and strong whitespace rhythm.

## Typography
- Main UI: Instrument Sans.
- Mono: IBM Plex Mono when available, with sober system fallbacks.
- Keep a strict scale: small metadata, compact labels, readable body, restrained page headings.
- Do not add extra decorative fonts to product UI.

## Agentic Process UI
Use a Claude/Codex-like pattern:
- conversational task flow
- visible but high-level work trace
- structured outputs
- generating cards for pending content
- source/work review on demand
- user approval before final writes/exports

Do not show chain-of-thought. WorkTrace should show product-safe steps such as "Reading sources", "Checking claims", or "Preparing export".

## Source / Work Review
Sources should be available on demand, not displayed everywhere.

Preferred affordances:
- View sources
- Review work
- Used 3 sources

Drawer/popover content:
- sources used
- internal context used
- uploaded files used
- user answers used
- high-level work performed
- confidence/uncertainty

If no trace exists, say: "No detailed source trace is available for this action."

## Loading
Preferred:
- skeletons and subtle shimmer
- WorkTrace for long agentic tasks
- generating cards for drafts
- streaming where real streaming exists
- background task toasts for non-blocking operations
- failed states with alternatives

Avoid:
- progress bars unless a real percentage exists
- spinners everywhere
- fake analysis
- visible timestamp-heavy streams everywhere

## Home Direction
Home should feel operational, not like a boot screen.

Use:
- short controlled reveal
- next-action cards
- readiness signals
- quiet workspace state

Avoid:
- WorkTrace by default
- "system starting" copy
- progress bars
- UC/clock/sports metaphors

