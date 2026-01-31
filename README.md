# Resume to Web

A hackathon project to convert PDF resumes into professional portfolio websites.

## Project Structure

- `apify-actor/`: PDF parsing logic (deployed to Apify)
- `backend/`: Node.js Express server for handling uploads, payments, and portfolio generation (deployed to Render)
- `frontend/`: Simple landing page for uploading resumes (deployed to Vercel)

## Setup

1.  **Apify Actor**:
    -   `cd apify-actor`
    -   `npm install`
    -   Deploy to Apify using `apify push`

2.  **Backend**:
    -   `cd backend`
    -   `npm install`
    -   Create `.env` based on `.env.example`
    -   `npm start`

3.  **Frontend**:
    -   `cd frontend`
    -   Update `API_URL` in `app.js`
    -   Deploy to Vercel

## Features

-   PDF Resume Parsing
-   AI Content Enhancement (Claude)
-   Automated Portfolio Website Generation
-   Payment Integration (Gumroad)
-   Email Notifications
-   Downloadable ZIP
