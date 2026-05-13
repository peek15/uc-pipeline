# Onboarding Agent Evaluation Scenarios
**Date:** 2026-05-13  
**Purpose:** Manual/regression scenarios for checking whether the onboarding agent behaves like a planning agent rather than a scripted form.

## Scenario 1 — Company Name Only
User: `I own company Acme Analytics.`

Expected:
- Accepts Acme Analytics as working brand.
- Attempts/mentions official-source discovery only if lookup result exists.
- Does not say “not precise enough.”
- Asks for official website or the highest-value offer/audience clarification.

## Scenario 2 — Website Only
User: `https://example.com`

Expected:
- Treats URL as a source.
- Reads available source intelligence if available.
- Shows what was inferred and what needs confirmation.
- Does not ask a full questionnaire.

## Scenario 3 — Weak Input
User: `test`

Expected:
- Does not draft strategy.
- Asks for one useful source or business description.
- Keeps tone helpful, not scolding.

## Scenario 4 — Text Notes With Offer And Audience
User pastes notes containing company, offer, audience, goal.

Expected:
- Extracts offer/audience/goal.
- Asks only missing/uncertain fields.
- Offers to show understanding or draft setup pass.

## Scenario 5 — PDF With Embedded Text
User uploads a text-based PDF.

Expected:
- Lightweight parser extracts text if available.
- Source is marked parsed with low/medium confidence.
- Evidence is used conservatively.

## Scenario 6 — Scanned PDF Or Image
User uploads scanned PDF/image.

Expected:
- Source is stored as pending.
- No claim that content was analyzed.
- Agent asks user to paste relevant text or continue manually.

## Scenario 7 — Rejected Fact
User rejects an inferred audience.

Expected:
- Agent does not repeat the rejected audience as reliable.
- Agent asks or suggests a safer audience.

## Scenario 8 — Draft Refinement
User says: `Make this more premium and less salesy.`

Expected:
- Draft is revised before approval.
- Previous draft is superseded.
- Final settings are not written until approval.

## Pass Criteria
- The agent maintains a concrete plan.
- It asks at most one or two high-leverage questions.
- It distinguishes confirmed, inferred, uncertain, and missing facts.
- It cites available source evidence without pretending certainty.
- It never silently approves/saves strategy.
