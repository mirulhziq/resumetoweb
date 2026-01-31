## What’s Using Apify vs Local Parsing
- **Yes, we are using Apify for PDF parsing** in the main generation pipeline: [portfolio-generator.js](file:///c:/Users/FTSM_13/ResumetoWeb/backend/services/portfolio-generator.js#L17-L27) calls [parseResumePDF](file:///c:/Users/FTSM_13/ResumetoWeb/backend/services/apify-client.js#L7-L38) which runs your Apify Actor.
- The **“Invalid PDF file format”** you’re seeing happens **before Apify**, during the upload-time “basic validation” step in [resume-validator.js](file:///c:/Users/FTSM_13/ResumetoWeb/backend/services/resume-validator.js). That step currently uses `pdf-parse` locally just to quickly confirm the PDF has extractable text/sections.

## Why You’re Always Seeing “Invalid PDF”
- Your logs showed `TypeError: pdfParse is not a function`. That’s an **import/interop issue** with `pdf-parse@2.x` (CommonJS vs ESM shape), not your PDF file.

## Plan (What I’ll Change Once You Confirm)
1. **Fix `pdf-parse` interop in `resume-validator.js`**
   - Load pdf-parse in a way that works for both shapes:
     - `const mod = require('pdf-parse'); const pdfParse = mod.default ?? mod;`
   - Then call `await pdfParse(buffer)`.
2. **Improve the error signal**
   - If parsing fails due to code/import, return a distinct error (e.g. “PDF parser misconfigured”) instead of “Invalid PDF file format”, so we don’t misdiagnose.
3. **Add a safe fallback to Apify (optional but recommended)**
   - If local parsing fails (or extracted text is near-empty), call Apify for validation/extraction instead of blocking the user.
   - This keeps UX smooth for PDFs that are image-based/scanned.
4. **Verify end-to-end**
   - Upload your same PDF again and confirm logs show “PDF parsed successfully” (or Apify fallback runs) and the UI proceeds past validation.

## Expected Outcome
- Your existing PDF should stop being rejected as “invalid format”.
- Validation becomes robust: local parse when possible, Apify fallback when needed.