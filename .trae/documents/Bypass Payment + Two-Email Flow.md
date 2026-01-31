## What’s True in the Current Code (rechecked)
- The frontend “payment” button calls `/api/simulate-payment` and sends `{ email, filename }`, but the backend currently only reads `filename` and ignores `email` ([server.js](file:///c:/Users/FTSM_13/ResumetoWeb/backend/server.js#L107-L149)).
- The backend starts generation with `generatePortfolio(filename, orderId)` which does not match the function signature `generatePortfolio(email, saleId, position, pdfFilename)` ([portfolio-generator.js](file:///c:/Users/FTSM_13/ResumetoWeb/backend/services/portfolio-generator.js#L11-L16)). This breaks the flow needed to ever reach the “portfolio ready” email.
- The frontend polls `GET /api/order/:saleId`, but the backend exposes `GET /api/status/:orderId` ([app.js](file:///c:/Users/FTSM_13/ResumetoWeb/frontend/app.js#L101-L153), [server.js](file:///c:/Users/FTSM_13/ResumetoWeb/backend/server.js#L151-L168)). So progress UI is also currently disconnected.
- Only 1 email exists today: `sendSuccessEmail` ([email-sender.js](file:///c:/Users/FTSM_13/ResumetoWeb/backend/services/email-sender.js#L13-L85)).

## What You Want
- Bypass payment for testing.
- Send 2 emails:
  1) “Purchase/Order confirmed” + invoice-like details + estimated completion time.
  2) “Completed” email with Vercel URL + ZIP download URL.
- Ideally be able to “see the actual email message” during testing.

## Recommended Approach (MVP + smooth UX)
- Keep it accountless for now: use a per-order token/link (already aligned with your download-token approach) instead of full authentication.
- Add a “TEST MODE” email preview so you can see the full HTML in the UI even if SMTP is flaky.

## Implementation Plan
### 1) Make payment fully bypassed but consistent
- Replace the current simulate-payment behavior so it becomes `POST /api/start` (or keep the same route name) and accepts `{ email, filename }`.
- Generate `orderId` and store order state with `updateStatus(orderId, 'queued', { email, filename, startedAt, etaMinutes })`.
- Return `{ success: true, orderId, etaMinutes }`.

### 2) Add the “Order Confirmed / Invoice” email
- Extend [email-sender.js](file:///c:/Users/FTSM_13/ResumetoWeb/backend/services/email-sender.js) with a new function `sendOrderConfirmedEmail({ email, orderId, amount, currency, etaMinutes })`.
- Invoice in hackathon MVP: include orderId, date/time, amount ($1 in production, $0 in test), and “Estimated completion: X minutes”.

### 3) Ensure the completion email works end-to-end
- Fix the generation call to match the real signature:
  - Determine `position` from the counter (or set a test value), and pass `pdfFilename` correctly.
  - Call `generatePortfolio(email, orderId, position, filename)`.

### 4) Make progress UI and timing believable
- Align polling endpoint and response shape:
  - Either add `GET /api/order/:orderId` alias to reuse the existing frontend URL, or update frontend to call `/api/status/:orderId`.
  - Store per-step timestamps in order-tracker so we can show “elapsed time” and a stable ETA.

### 5) “Show me the actual email message” in test
- Add a test-email mode:
  - If `EMAIL_PREVIEW_MODE=true`, don’t send SMTP; instead capture the generated HTML/subject and store it under the order record (e.g. `orders[orderId].emails.confirmation.html`, `orders[orderId].emails.completed.html`).
  - Add `GET /api/order/:orderId/emails` that returns those HTML strings so the frontend can render them in a modal/section.

### 6) Verification
- Local end-to-end test:
  - Upload resume → press the bypass button → see confirmation email preview + ETA → watch steps update → see completion email preview with working URLs.

## About Auth + Supabase (correcting assumptions)
- You’re not wrong, but auth is usually unnecessary friction for this product.
- If you want persistence, the real need is **object storage**, not user accounts.
  - Supabase Storage is a good option for storing ZIPs + serving signed URLs.
  - You can still keep it “no login” by issuing signed download links tied to the order token.
- Add authentication only if you need dashboards, re-download history, or profile edits.

If you confirm, I’ll implement this by editing existing files (server.js, email-sender.js, app.js, order-tracker.js) and verify locally.