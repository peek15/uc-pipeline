# Onboarding Source Review Notes

## Source Statuses
Website URL:
- stored
- no advanced crawl/web research in Sprint 9C

Pasted notes:
- parsed as text
- used in deterministic fact extraction

MD/TXT files:
- parsed as text when browser file reading succeeds
- included in source payload text

PDF/images:
- stored as source records
- marked `pending analysis`
- not represented as analyzed

Unsupported files:
- stored where possible
- marked unsupported or not parsed

## Review Work Pattern
Onboarding uses the Sprint 9A `SourceReviewButton` and drawer pattern.

It can show:
- website URL used
- pasted notes used
- uploaded files used
- manual answers used
- source records saved
- high-level work performed
- setup confidence/uncertainty

If no source trace exists:
> No detailed source trace is available for this action.

## No Fake Sources
The UI never invents sources. If the backend does not return a detailed trace, the drawer only displays intake-derived trace and high-level work steps.

