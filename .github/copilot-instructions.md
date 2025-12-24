# Copilot instructions for quicker-checker-inner

Purpose: short, actionable notes so an AI coding agent can be productive immediately in this repo.

Big picture
- Backend proxy: `server/index.ts` (Express + TypeScript). It proxies two MyTime APIs:
  - Marketplace/user-scoped via `mytimeRequest`
  - Partner/location-wide via `partnerApiRequest`
- Frontend: Vite app with `index.html` and `src/app.ts`. API client is `src/api/client.ts` (talks to `/api/*`).
- Photo enrichment: `server/supabase.ts` (Supabase client reads repo-root `.env`).
- Local cache: IndexedDB implemented in `src/api/cache.ts` (DB name `QuickerCheckerDB`, store `dogs`, search uses a lowercase `searchName` field).

How to run and debug
- Put runtime env at repo root `.env` (server loads `join(__dirname, '..', '.env')`). Key vars: `MYTIME_API_KEY`, `MYTIME_COMPANY_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional `MYTIME_BASE_URL`.
- Dev: `npm run dev` (runs server + client concurrently). Server only: `npm run server`. Client only: `npm run client`.
- Build: `npm run build`, Preview: `npm run preview`.
- Useful debug endpoints: GET `/api/debug/verify-config`, `/api/debug/employees` (see `server/index.ts`). Check console logs — server and supabase modules log informative prefixes.

Project-specific patterns & important places to edit
- Hard-coded IDs & rules live in `server/index.ts`:
  - `DAYCARE_VARIATIONS`, `EMPLOYEE_IDS`, `RESOURCE_MAP`, `ADD_ON_VARIATION_IDS`, `FALLBACK_DURATIONS`, `SPA_PRIMARY_SERVICE_ID`.
  - `loadVariationsCache()` populates `variationCache` from Partner API at startup; fallback durations are used because Partner API often reports incorrect spa durations.
- Frontend service logic and UX live in `src/app.ts`:
  - Service type selection (`serviceType`), daycare date selection, spa bundle logic, and the check-in flow that calls `/api/appointments/direct`.
  - `src/api/constants.ts` contains `DAYCARE_VARIATIONS`, `SPA_SERVICE_NAMES`, and other constants mirrored in backend.
- API surface: `src/api/client.ts` defines the browser-side wrappers. All fetches go to `/api/*` on the Express server.

Integration points and gotchas
- Two MyTime integrations: Marketplace (user auth, bookings) vs Partner API (location-wide operations). Use the proper helper in `server/index.ts`.
- Booking validation is strict: the Partner API expects summed durations of non-add-ons. Backend computes a "strict API end" and a separate "real" duration using fallbacks — keep this in mind when changing durations or add-ons.
- Daycare bookings: server injects a mock open slot when the API returns empty for daycare (see `/api/open-times`). Changing daycare hours needs edits in `server/index.ts`.
- Supabase photo enrichment is optional: if `SUPABASE_URL` or `SUPABASE_ANON_KEY` missing the code logs a warning and skips enrichment.

Editing examples (quick pointers)
- Add a new spa add-on: add the variation ID to `ADD_ON_VARIATION_IDS` and update `FALLBACK_DURATIONS` if needed (edit `server/index.ts`), and add the human name in `src/api/constants.ts` under `SPA_SERVICE_NAMES`.
- Change daycare mapping: update `DAYCARE_VARIATIONS` in both `server/index.ts` and `src/api/constants.ts` and verify `getDaycareVariationId()` behavior.

Developer tips
- Search/local cache: `src/api/cache.ts` supports local search — use it in tests to avoid hitting Partner API repeatedly. IndexedDB can be inspected in browser devtools under `QuickerCheckerDB`.
- Session keys: front-end saves `authToken` and `user` to sessionStorage; to simulate sessions, set these in devtools.
- Server uses `console.log` heavily; check terminal where `npm run server` runs for the authoritative logs.

If something is missing or outdated, tell me which file or flow you want expanded and I will update this guide.
