# OCR Provider Integration Sprint

## A. Files Changed
- `src/lib/onboardingOcrProvider.js`
- `src/lib/onboardingDocumentIntelligence.js`
- `src/app/api/onboarding/ocr/route.js`
- `src/app/api/onboarding/source/route.js`
- `src/app/onboarding/page.jsx`
- `scripts/onboarding-eval.mjs`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`

## B. Sprint Goal
Make onboarding OCR real when a vision provider is configured, while preserving honest fallback behavior when it is not.

## C. Provider Behavior
Configured provider:
- `OPENAI_API_KEY`

Optional model override:
- `ONBOARDING_OCR_OPENAI_MODEL`

Default model:
- `gpt-4o-mini`

When configured, image uploads can be sent transiently to OpenAI vision OCR. Extracted text is analyzed and stored. Raw base64 image data is not stored.

## D. Supported Inputs
Supported now:
- text files
- markdown files
- readable-text PDFs through the existing lightweight parser
- image OCR when OpenAI vision is configured

Still not supported:
- scanned PDF page rendering into images
- multi-page OCR
- table/layout reconstruction
- handwritten text guarantees

## E. Source Intake
The onboarding client now keeps small image data transiently during intake. `/api/onboarding/source` can use that transient `image_base64` to run OCR and stores only:
- extracted text
- source intelligence summary
- evidence snippets
- OCR status
- provider metadata
- gateway metadata

## F. Privacy / Gateway
OCR calls use the Universal AI Gateway preparation path for OpenAI. Gateway metadata is stored, but raw image data is not logged or persisted.

Provider privacy policy remains conservative. Do not claim ZDR/no-retention OCR unless contract/runtime routing are verified.

## G. Honest Fallbacks
If OCR is not configured:
- images remain `requires_ocr`
- scanned PDFs remain `requires_ocr`
- UI/API responses tell the user to paste key text or upload text/markdown

If OCR runs but finds no useful text:
- status is `no_text`
- the source is not treated as analyzed

## H. What Is Intentionally Not Implemented
- No new OCR vendor UI.
- No scanned PDF rendering.
- No document layout extraction.
- No full asset library.
- No mandatory OCR processing for all files.
- No raw image/base64 persistence.

## I. Validation
Results:
- `npm run eval:intelligence` passed.
- `npm run lint --if-present` completed with no configured lint output.
- `npm run build` passed.

## J. Remaining Risks
- Image OCR requires `OPENAI_API_KEY`.
- Large images are not handed off inline.
- OCR accuracy is provider-dependent and must be reviewed by the user.
- Scanned PDFs still need a PDF-to-image renderer or dedicated document OCR provider.
