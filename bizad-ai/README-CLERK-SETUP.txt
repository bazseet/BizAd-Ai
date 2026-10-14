BIZAD AI — CLERK AUTHENTICATION PHASE 1 (CORRECTED)

This bundle fixes the earlier issue where the old custom email/password screen was still being used.
It uses the current Clerk React SDK (@clerk/react) and Clerk Express integration (@clerk/express).
It also keeps the safe Video Phase 1 mock mode files so they are not regressed.

IMPORTANT
- Do NOT copy or replace server/.env.
- Do NOT upload or paste any secret keys here.
- Do NOT run `npm run db:push` or `npm run db:migrate` for this change.
- server.js performs a safe additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS clerk_user_id` at startup.
- Existing database users are linked to their Clerk account by email on first authenticated request; existing credits/plans/campaigns are preserved.

FILES TO REPLACE
- package.json
- vite.config.js
- src/main.jsx
- src/App.jsx
- src/Auth.jsx
- src/CreateAd.jsx
- src/WhatsAppMarketing.jsx
- src/Account.jsx
- server/package.json
- server/server.js
- server/db/schema.js
- server/test-video.js
- server/assets/bizad-demo-preview.mp4

ENVIRONMENT
Root: .env.local
VITE_CLERK_PUBLISHABLE_KEY=your_publishable_key

Server: server/.env
CLERK_PUBLISHABLE_KEY=your_publishable_key
CLERK_SECRET_KEY=your_secret_key

Keep all your other existing server/.env variables.

INSTALL
Open PowerShell in the main project:
  cd C:\Users\ABIOLA\Desktop\BizAd\bizad-ai
  npm install

Then:
  cd server
  npm install

RUN
Terminal 1:
  cd C:\Users\ABIOLA\Desktop\BizAd\bizad-ai
  npm run dev

Terminal 2:
  cd C:\Users\ABIOLA\Desktop\BizAd\bizad-ai\server
  npm start

VITE PROXY
The frontend now calls /api/... on the same origin and Vite proxies that traffic to http://localhost:5000.
This lets Clerk's browser session be available to the Express API without adding bearer-token logic to every existing component.

TEST
1. Open the Vite URL.
2. Click Sign In.
3. The old BizAd email/password form should NOT appear.
4. Clerk's SignIn UI should appear inside the BizAd card.
5. Create/sign into a test Clerk account.
6. After authentication, BizAd should return to the dashboard.
7. Open Account, My Ads, WhatsApp Marketing, and Create Ad to confirm protected API calls still work.
8. Existing account data should be retained when the Clerk email matches an existing BizAd database user.

VIDEO
VIDEO_MODE still defaults to mock unless BOTH are explicitly set:
  VIDEO_MODE=vercel
  ENABLE_BILLABLE_VIDEO=true
Do not enable billable mode during this authentication test.
