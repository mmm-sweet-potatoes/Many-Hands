# Many-Hands
A trash pick-up app that connects users to organize community cleanups and maintain a leaderboard.

## Local setup

1. Place your Firebase service account JSON in the project root as `firebase-service-account.json` or set `GOOGLE_APPLICATION_CREDENTIALS` to its path.
2. Create a `.env` file to set runtime env vars (see Environment below).
3. Install dependencies:

```bash
npm install
```

4. Run locally (dev):

```bash
npm run dev
```

Server entry: `server.js`

## Environment variables
- `PORT` (optional)
- `FIREBASE_STORAGE_BUCKET` (optional; not required for Cloudinary flow)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — required for image uploads

Note: keep secrets out of Git. Add `.env` and any service account files to `.gitignore`.

## Authentication
This app expects users to sign in with email/password or Google. The client auto-upserts basic profile info to `POST /users/me` after sign-in.

## API Endpoints (server)
All protected endpoints require a Firebase ID token in `Authorization: Bearer <token>` except `/_debug`.

- `GET /users/me` — fetch your profile
- `POST /users/me` — upsert your profile (JSON body). If `username` is present the server will attempt to claim it transactionally.
- `POST /users/me/photo` — upload profile photo (multipart form field `image`), stored to Cloudinary and `users/{uid}.photo`; updates Auth `photoURL`.
- `GET /requests` — list recent requests (includes status/claimer)
- `GET /requests/mine` — list requests created by the authenticated user
- `POST /requests` — create a cleanup request (body: location, size, description, importance, amount, image)
- `POST /requests/:id/claim` — claim a request for 24 hours (sets `claimer`, `claimedAt`, `claimedExpiresAt`)
- `POST /requests/:id/complete` — complete a request (only the claimer may complete while claim is valid). Completers earn score.
- `POST /cloudinary/upload` — server-side image upload (multipart `image`) used by older client flows; profile and request flows use the dedicated endpoints above.
- `GET /usernames/:username` — check availability
- `POST /usernames/claim` — explicitly claim a username (transactional)

## Scoring
- When a request is created the server computes a `scoreDelta` (based on `importance` and `size`) and increments `users/{uid}.score` unless the client supplies an explicit `scoreDelta`.
- When a request is completed by its claimer the completer's `score` is incremented using the same scoring logic.

## Client (test UI)
- The `public/` UI supports:
	- Email/password sign-up and sign-in, and Google sign-in
	- Load/update profile (displayName, username, bio)
	- Upload profile photo
	- Create requests and upload images
	- View open requests, claim a request, and complete it

## Notes and maintenance
- Legacy Firebase Storage upload route (`/uploads`) was removed in favor of server-side Cloudinary uploads due to Firebase Spark plan limits.
- Image metadata is persisted on relevant documents (`users/{uid}.photo` or within a `request`), duplicate `images` collection writes were removed.
- If you plan to deploy, ensure `firebase-service-account.json` or equivalent secrets are provided to the runtime securely (environment variables or secret manager).

If you want, I can also add a short troubleshooting section (common permission issues, Cloudinary errors, or token verification failures).

