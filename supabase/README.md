# Supabase

This directory holds everything the Supabase CLI manages for the project:
schema migrations, Postgres functions, RLS policies, and Edge Functions.

## Layout

```text
config.toml              CLI config (auth/storage settings, function metadata)
migrations/              SQL migrations applied in lexical order
  0001_initial_schema.sql   10 tables + submissions storage bucket
  0002_rls_policies.sql     RLS deny-by-default + role-aware policies + guard trigger
  0003_functions.sql        Postgres functions for atomic / authorisation-sensitive ops
functions/
  _shared/                cors.ts, auth.ts (userClient, adminClient, getCallerRole)
  submit-attempt/         POST /functions/v1/submit-attempt — submit + render PDF
  import-questions-csv/   POST /functions/v1/import-questions-csv — CSV bulk import
  admin-user-management/  POST /functions/v1/admin-user-management — admin user CRUD
  get-attempt-pdf/        POST /functions/v1/get-attempt-pdf — sign a 1-hour download URL
```

## Local development

Requires the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
supabase start                # Postgres + Auth + Storage + Studio on :54321 / :54323
supabase db reset             # apply every migration from scratch
supabase functions serve      # serve all edge functions on :54321/functions/v1/*
```

Point the frontend at the local stack by setting:

```dotenv
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<copy from `supabase start` output>
```

## Deployment

CI (`.github/workflows/deploy.yml`) runs on push to `main`:

```bash
supabase link --project-ref $SUPABASE_PROJECT_REF
supabase db push
supabase functions deploy submit-attempt
supabase functions deploy import-questions-csv
supabase functions deploy admin-user-management
supabase functions deploy get-attempt-pdf
```

Required GitHub secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
`SUPABASE_DB_PASSWORD`.

## Authoring guide

### Migrations

- New SQL goes into `migrations/NNNN_description.sql` with a fresh,
  monotonic 4-digit prefix.
- Prefer `create or replace function` so re-applying a migration is a
  no-op when iterating.
- For new tables, remember to:
  1. `enable row level security` on the table.
  2. Add explicit policies — there is no implicit allow.
  3. `revoke select on public.<table> from anon` to keep it out of the
     anon GraphQL schema.

### Edge functions

Every function should:

1. Import `_shared/cors.ts` and call `preflight(req)` at the top so OPTIONS
   requests get a 200 with proper CORS headers.
2. Use `getCallerRole(req)` to authenticate the caller; reject if `null` or
   if the role doesn't match the gate (`isAdmin`, `isStaff`).
3. Use `userClient(req)` for any read or write that should be RLS-gated.
4. Use `adminClient()` only for operations that intentionally bypass RLS:
   storage signed-URL minting, the submission trigger bypass, admin user
   provisioning, etc.
5. Return responses through `jsonResponse(req, status, body)` so CORS
   headers are attached uniformly.

### Postgres functions

- Mark `security definer` and `set search_path = public` to avoid RLS
  recursion and search-path attacks.
- Validate `auth.uid()` and `auth_role()` inside the function — never
  rely on the caller's RLS context to enforce authorisation.
- After defining the function, immediately
  `revoke execute on function ... from public, anon` and
  `grant execute on function ... to authenticated`. Supabase's defaults
  grant EXECUTE to both `anon` and `authenticated` explicitly, so a single
  revoke from `public` is not sufficient.
