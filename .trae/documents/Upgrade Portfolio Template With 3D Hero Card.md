## What I’ll change (professional + recruiter-friendly)
- Make the generated portfolio feel like a real premium site: better typography, spacing, section hierarchy, and a clean narrative.
- Add a **3D hero profile card** that:
  - Auto-rotates horizontally (rotateY)
  - Slows down on hover
  - Toggles stop/start on click
  - Shows headshot + key info

## Important constraint (rechecked)
- Your current resume parsing is text-only; it does **not** extract a photo from the PDF ([apify-actor main.js](file:///c:/Users/FTSM_13/ResumetoWeb/apify-actor/src/main.js)).
- So: if the user “has a pic”, the correct way is **optional headshot upload**. If they don’t upload one, we’ll use a built-in professional placeholder (no external image dependency).

## Updated plan
### 1) Professionalize the generated site structure
- Update [portfolio-template.html](file:///c:/Users/FTSM_13/ResumetoWeb/backend/templates/portfolio-template.html) layout to include:
  - Hero (name, headline, 3–5 highlights)
  - Experience (clean cards, results-oriented bullets)
  - Projects (with tech pills + outcomes)
  - Skills (grouped/pills)
  - Education
  - Footer CTA

### 2) Add the 3D hero card component
- Implement a “scene” (CSS perspective) and a “card” with:
  - Keyframes: continuous rotateY
  - Hover: slow down (increase animation duration)
  - Click: pause/resume (toggle a class → animation-play-state)
- Card content:
  - Headshot (uploaded) or placeholder
  - Name + Claude headline
  - 2–3 quick facts (email/LinkedIn/primary role)

### 3) Optional headshot upload (minimal UX impact)
- Frontend: add optional image picker next to the PDF upload.
- Backend: accept multipart with `resume` + optional `photo`, store both, return `photoFilename`.
- Save `photoFilename` with the order so generation can include it.

### 4) Improve Claude enhancement so the site feels “special”
- Update [claude-enhancer.js](file:///c:/Users/FTSM_13/ResumetoWeb/backend/services/claude-enhancer.js) to output strict JSON fields used by the template:
  - `headline`
  - `highlights` (3–5 bullets, no invented facts)
  - `about` (short and strong)
  - `enhancedExperience` (existing, but more impact-driven)
  - optional improved project summaries
- Keep your existing fallback behavior if Claude fails.

### 5) Wire new data into HTML generation
- Update [template-builder.js](file:///c:/Users/FTSM_13/ResumetoWeb/backend/services/template-builder.js) to render the new sections and inject `photoUrl` (uploaded photo URL or placeholder).

### 6) Verify
- Generate a local preview HTML and confirm:
  - 3D card rotates, slows on hover, pauses on click
  - Placeholder headshot works
  - Layout looks clean on desktop + mobile
  - Existing generation flow still works

If you approve this plan, I’ll implement it end-to-end in the current repo.