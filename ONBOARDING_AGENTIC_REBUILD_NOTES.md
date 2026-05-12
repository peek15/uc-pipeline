# Onboarding Agentic Rebuild Notes

## Audit
The previous Sprint 9C onboarding route used the right full-screen context, but the first user interaction still rendered a single large source intake card. Website URL, upload, pasted notes, manual brand fields, platform chips, and format chips appeared together, which made the experience feel like a form or application intake rather than an agent conversation.

## What Changed
- Replaced the upfront source form with a message stream and bottom composer.
- The first assistant message now asks the user to describe the business, paste a website, or upload a file conversationally.
- Website URLs, pasted notes, files, and guide requests appear as user/source messages inside the conversation.
- The composer supports:
  - Add website
  - Upload file
  - Paste notes
  - I'm not sure — guide me
- WorkTrace appears as an assistant message only while analysis, drafting, or approval work is active.
- The existing Sprint 6/9C onboarding API flow is preserved.

## Source Honesty
- Text/MD/TXT files are parsed when the browser can read their text.
- PDF/image files are accepted as source records but remain marked `pending analysis`.
- The UI does not claim PDF/image analysis occurred when no parser ran.
- Source/work review stays on demand through the existing review drawer.

## Remaining Limits
- This does not add open-web crawling, Drive/bucket connection, PDF OCR, image analysis, or a new assistant backend.
- The backend still uses the existing deterministic/V1 onboarding analysis path.
