# Creative Engine Subprocessor Registry — Internal

**Status:** implementation registry, not public legal copy. Unknowns require provider/legal validation.

| Provider | Category | Purpose | Data Processed | Personal Data Possible | Confidential Data Possible | Default Enabled | Retention | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase | Database/storage/auth | Primary app data, auth, storage | Workspace content, uploads, auth identifiers | Yes | Yes | Yes | Provider policy | RLS and signed URLs required. |
| Vercel | Hosting | Runtime and deployment hosting | Requests, sanitized logs, operational metadata | Yes | No by default | Yes | Provider policy | Runtime logs must remain sanitized. |
| Stripe | Billing | Payments and subscriptions | Billing identity, payment metadata | Yes | No | Yes | Provider policy | Billing/legal retention applies. |
| Resend | Email | Transactional email | Email address and transactional content | Yes | No by default | No | Provider policy | Future email integration. |
| Sentry | Monitoring | Error monitoring | Sanitized errors and metadata | Yes | No by default | No | Provider policy | Do not send raw prompts/documents. |
| PostHog | Analytics | Product analytics | Usage events and identifiers | Yes | No | No | Provider policy | Avoid client content. |
| Trigger.dev | Jobs | Long-running job orchestration | Minimized job metadata | Yes | No by default | No | Provider policy | Payload minimization required. |
| n8n Cloud | Automation | Workflow automation placeholder | TBD minimized workflow data | Yes | TBD | No | Unknown | Conservative placeholder. |
| OpenAI | AI provider | LLM inference | Prompts/context during inference | Yes | Yes | Optional | Limited/provider policy | D2/D3 require approved no-retention route. |
| Anthropic | AI provider | LLM inference | Prompts/context during inference | Yes | Yes | Optional | Limited/provider policy | D2/D3 require approved no-retention route. |
| Google/Vertex/Gemini | AI provider | Future LLM inference | TBD | Yes | Yes | No | Unknown | Placeholder only. |
| AWS Bedrock | AI provider | Future LLM inference | TBD | Yes | Yes | No | Unknown | Placeholder only. |
| ElevenLabs | Voice | Voice generation | Script text, voice settings, possible likeness data | Yes | Yes | Optional | Provider policy | Consent/risk checks required for likeness. |
| Replicate | Visual AI | Image generation | Visual prompts and metadata | Possible | Yes | Optional | Provider policy | Prompt minimization required. |
| Pexels | Licensed media | Stock media search | Search query and result metadata | No by default | No by default | Optional | Provider policy | Queries should be minimized. |
| Documenso | Documents | Future document signing | TBD | Yes | Yes | No | Unknown | Placeholder. |
| Tally | Forms | Future intake forms | TBD | Yes | Yes | No | Unknown | Placeholder. |
| Cal.com | Scheduling | Future scheduling | Names, emails, booking metadata | Yes | No by default | No | Unknown | Placeholder. |
| Airtable | Ops database | Legacy/internal sync | Content metadata where configured | Yes | Yes | Optional | Unknown | Keep tenant scoped. |

Use `src/lib/privacy/subprocessors.js` as the code registry for UI/provider transparency.
