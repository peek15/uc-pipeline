# Onboarding Source Intelligence Notes

## What Changed
- `src/lib/onboardingWebResearch.js` now performs a small source-intelligence pass instead of a single homepage fetch.
- It can:
  - detect a company name from the user message
  - rank likely official website candidates
  - read the selected/provided website homepage
  - discover up to three same-domain pages with About/Product/Services/Solutions-style signals
  - extract short evidence snippets from readable page text
  - assign a simple source confidence: `low`, `medium`, or `high`
- `src/lib/onboardingAgentStep.js` now passes pages read, evidence snippets, source confidence, and limitations into tool artifacts and onboarding memory.
- The onboarding UI exposes these as concise tool artifacts, not as a large research report.

## Intentional Limits
- This is not broad web crawling.
- This is not competitor scanning.
- This is not market intelligence.
- This is not legal/compliance validation.
- Social platforms are still excluded from automatic source fetching.
- The source confidence score is deterministic and directional only.

## User Experience Impact
- If a user says “I own company X,” Creative Engine can try to anchor the setup to a likely official source.
- If a user provides a website, Creative Engine can read the homepage and a few likely same-domain context pages.
- The agent can ask fewer generic questions because source snippets now provide better offer/audience/product signals.
- The user can see source confidence and evidence count in the agent work cards.

## Remaining Risks
- Official-site detection can still pick the wrong domain for ambiguous names.
- Some sites block server-side fetches or render important text client-side.
- Evidence snippets are heuristic sentence matches.
- Source intelligence should be followed by user confirmation before saving final strategy.
