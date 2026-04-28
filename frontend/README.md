# Frontend (React + Vite)

The SPA half of the SMU exam app. Talks directly to Supabase via
`@supabase/supabase-js` — there is no separate API server.

## Run locally

```bash
npm install
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` (see the
top-level [README](../README.md) for the full setup).

## Build

```bash
npm run build       # outputs to dist/
npm run preview     # serves the built bundle locally for sanity checks
```

## Deploy

Netlify auto-deploys this directory on push; the build config lives in
[netlify.toml](netlify.toml). Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in the Netlify site environment.
