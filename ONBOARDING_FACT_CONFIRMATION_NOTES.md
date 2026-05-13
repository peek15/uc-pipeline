# Onboarding Fact Confirmation Notes

## What Changed
- Added `supabase-sprint10-onboarding-fact-confirmation.sql`.
- Added `/api/onboarding/fact` for reading and writing reviewed onboarding facts.
- Onboarding facts can now be marked:
  - `inferred`
  - `confirmed`
  - `edited`
  - `rejected`
  - `unsure`
- Confirmed/edited facts are written to `onboarding_extracted_facts` with `accepted_by_user = true`.
- Rejected/unsure facts are also stored so the agent can stop treating those inferences as reliable.
- The setup brief and understanding card now expose small confirm/unsure/reject controls for inferred facts.

## Agent Behavior
- `src/lib/onboardingAgentStep.js` loads latest reviewed fact memory for the active onboarding session.
- Confirmed/edited facts override automatic inference.
- Rejected/unsure facts are cleared from the working fact set so the agent asks instead of repeating a rejected assumption.
- Reviewed fact memory is included in the onboarding prompt context.

## Migration Required
Apply:

```sql
supabase-sprint10-onboarding-fact-confirmation.sql
```

This extends `onboarding_extracted_facts` with status, reviewer, timestamp, and metadata fields.

## Remaining Risks
- There is no unique constraint per `session_id + field_key`; the app uses latest row by `created_at`.
- Fact review is available inside onboarding, but not yet exposed as a dedicated audit/history panel.
- Rejected facts clear the field for the agent, but a future source may infer the same value again unless the rejection is specific enough.
