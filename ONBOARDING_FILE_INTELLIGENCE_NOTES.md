# Onboarding File Intelligence Notes
**Date:** 2026-05-12  
**Scope:** Smart onboarding Sprint 4

## What Changed
- `/api/onboarding/source` now attaches a `source_intelligence` object to each saved onboarding source.
- Text-like sources (`text_note`, `markdown`, `manual_answer`) are chunked, summarized, classified through the privacy document intake helpers, and marked with simple confidence/evidence metadata.
- PDF/image uploads remain accepted as source records, but are explicitly marked pending because automated extraction/OCR is not implemented.

## Source Intelligence Shape
- `status`: `analyzed` for parsed text, `pending` for unsupported deep parsing.
- `summary`: concise source summary or honest limitation.
- `confidence`: deterministic `low`, `medium`, or `high` based on available text volume.
- `evidence_snippets`: short source sentences selected from text-like sources.
- `selected_for_ai`: whether privacy-safe snippets were selected for AI context.
- `limitation`: explicit explanation when a source is stored but not parsed.

## Honesty Rules
- Do not claim PDF/image analysis unless real text extraction/OCR exists.
- Do not treat stored website/file records as verified source analysis by themselves.
- When a file cannot be analyzed, ask the user to paste key text or upload MD/TXT.

## Privacy Alignment
- The route continues using Sprint 7 document intake helpers:
  - `classifyDocumentSource`
  - `chunkText`
  - `selectSnippetsForAI`
- Raw uploaded text is capped in source metadata and should not be logged elsewhere.

## Remaining Risks
- Website source intelligence is handled by the onboarding web research path, not by `/api/onboarding/source`.
- PDF/image OCR is still intentionally not implemented.
- Evidence selection is lightweight and deterministic, not a legal or factual verification system.
