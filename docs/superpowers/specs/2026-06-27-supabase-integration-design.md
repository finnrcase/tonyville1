# Supabase Integration — Design

- **Date:** 2026-06-27
- **Status:** Approved (design); pending spec review
- **Author:** Finn Case (with Claude Code)
- **Branch:** `supabase-integration` (off `main`, which now includes the ATTOM feature)

## Goal

Connect Tonyville to its Supabase project (`tonyville`, ref `kxkhhjynhavushindnaa`) to add
user accounts, saved searches, saved parcels, a public "Contact Tony" lead form, and an
admin-friendly leads view — without breaking the existing Mapbox/Regrid/mock search flow.

## Non-goals (YAGNI / scope guard)

- No change to the Mapbox map, Regrid provider, mock fallback, or the LandFit scoring engine.
- No password auth, OAuth, or anonymous auth — magic-link email only.
- Tiny-home models are **not** made the source of truth for scoring (see Decision 4).
- No service-role server admin path — admin access is via RLS + an admin login.
- No payments, messaging, or AI features (the other `future/` stubs stay untouched).

## Key decisions (resolved during brainstorming)

1. **Auth = magic-link email** (passwordless `signInWithOtp`). Minimal UI, real per-user
   accounts so saved features persist and RLS works; supports buyer/admin roles.
2. **Data access = browser client + RLS (approach A).** `@supabase/ssr` for cookie-based
   auth; per-user CRUD goes directly from the browser, authorized by Row Level Security.
   A server client is added only for server components / the admin page.
3. **Migrations applied to the live (empty) project now, and committed** as
   `supabase/migrations/*.sql`.
4. **Models: static for scoring, seeded catalog table.** Search/scoring keep using the
   static `tinyHomes.ts` models (no risk to the working flow). `tony_tiny_home_models` is an
   admin-managed marketing catalog (price/description/image/active), seeded from the static
   models with placeholders for fields that do not exist yet.
5. **ATTOM merged to `main` first**, then Supabase built on a branch off it.
6. **Service-role key optional** — not required; admin works through RLS + login.

## Review findings being corrected

- **`.env` is malformed.** Line 4 is `SUPABASE_URL=NEXT_PUBLIC_SUPABASE_URL=https://...`
  (two assignments merged), and the keys lack the `NEXT_PUBLIC_` prefix the browser client
  needs. Fix to clean `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  align `.env.example`.
- **ATTOM was unmerged / not on GitHub.** Merged into `main` locally (user pushes).
- **Supabase project is empty** — no tables yet; migrations create everything.

## Architecture & data flow

```
Existing search/map/scoring  ── unchanged ──────────────────────────────────┐
                                                                            │
Browser Supabase client (@supabase/ssr, cookie auth)                        │
  ├─ saved_searches / saved_parcels CRUD  ── RLS: user_id = auth.uid() ─────┤
  ├─ tony_tiny_home_models  ── RLS: public SELECT (active) ─────────────────┤
  └─ leads INSERT (anonymous allowed)  ── RLS: anon INSERT, admin SELECT ────┤
                                                                            │
Server Supabase client (cookies)                                            │
  └─ /admin/leads page  ── RLS: admin-only SELECT/UPDATE ────────────────────┘

Auth: magic link → /auth/callback exchanges code → session cookie → middleware refresh
Profile row auto-created by `handle_new_user` trigger on first sign-in
```

If Supabase env vars are absent, a readiness guard disables the saved/lead/auth UI and the
core search experience continues to work.

## Files

| File | Action | Responsibility |
| --- | --- | --- |
| `.env`, `.env.example` | fix | Correct `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`; service-role optional. |
| `package.json` | modify | Add `@supabase/supabase-js`, `@supabase/ssr`. |
| `supabase/migrations/0001_init.sql` | create | Tables, indexes, RLS, `is_admin()`, `handle_new_user` trigger. |
| `supabase/migrations/0002_seed_models.sql` | create | Seed `tony_tiny_home_models` from static models. |
| `src/lib/supabase/client.ts` | create | Browser client (`createBrowserClient`). |
| `src/lib/supabase/server.ts` | create | Server client (cookie-aware `createServerClient`). |
| `src/lib/supabase/types.ts` | create | Generated DB types. |
| `src/lib/supabase/readiness.ts` | create | Env readiness guard (replaces `future/supabase.ts`). |
| `src/middleware.ts` | create | Session refresh per `@supabase/ssr` (verify vs modified Next.js docs). |
| `src/lib/data/profiles.ts` | create | `getProfile`, `isAdmin`. |
| `src/lib/data/savedSearches.ts` | create | list / create / delete (replaces `future/savedSearches.ts`). |
| `src/lib/data/savedParcels.ts` | create | list / toggle / updateNotes (replaces `future/savedProperties.ts`). |
| `src/lib/data/leads.ts` | create | createLead (anon), listLeads / updateStatus (admin) (replaces `future/contactTony.ts`). |
| `src/lib/data/models.ts` | create | listActiveModels (replaces `future/tonyTinyHomeModels.ts`). |
| `src/lib/data/mappers.ts` | create | Pure row↔domain mappers + lead validation (unit-tested). |
| `src/app/auth/sign-in/page.tsx` | create | Magic-link email form. |
| `src/app/auth/callback/route.ts` | create | Code → session exchange. |
| `src/components/AuthMenu.tsx` | create | Header sign-in/out + email display. |
| `src/components/ContactTonyModal.tsx` | create | Lead form (works logged-out). |
| `src/components/SavedSearchesMenu.tsx` | create | Save current search + re-apply list. |
| `src/app/admin/leads/page.tsx` | create | Admin-only leads table. |
| `src/components/TonyvilleApp.tsx` | modify | Supabase-backed saved parcels; wire Contact + Save-search; mount AuthMenu. |
| `src/components/ParcelDetailPanel.tsx` | modify | Wire Save / Ask-Tony buttons to real handlers. |
| `src/lib/future/{auth,userProfiles,savedSearches,savedProperties,contactTony,tonyTinyHomeModels,supabase}.ts` | delete | Superseded by real modules. Unrelated stubs (financing, costEstimator, sitePreparation, aiParcelRecommendations) remain. |

## Schema (snake_case; RLS on every table)

```sql
-- helper: avoids recursive RLS when checking admin role on profiles
create function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null default 'buyer' check (role in ('buyer','admin')),
  created_at timestamptz not null default now()
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location text,
  radius numeric,
  max_price numeric,
  selected_tiny_home_model integer,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.saved_parcels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parcel_id text not null,
  parcel_address text,
  parcel_data jsonb not null default '{}',
  score integer,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, parcel_id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  selected_parcel_id text,
  selected_model text,
  message text not null,
  status text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now()
);

create table public.tony_tiny_home_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  square_feet integer,
  base_price numeric,
  minimum_lot_size numeric,
  utility_requirements jsonb not null default '[]',
  description text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

### RLS policies (summary)

- `profiles`: SELECT/UPDATE where `id = auth.uid()`; SELECT all where `is_admin()`.
- `saved_searches`, `saved_parcels`: ALL where `user_id = auth.uid()` (using + with check).
- `leads`: INSERT allowed for `anon` and `authenticated` (with check `true`); SELECT/UPDATE
  only where `is_admin()`.
- `tony_tiny_home_models`: SELECT where `active` (public) or `is_admin()`; INSERT/UPDATE/
  DELETE where `is_admin()`.

### Profile auto-creation

`handle_new_user` trigger on `auth.users` AFTER INSERT inserts a `profiles` row
(`id`, `email`, `name` from `raw_user_meta_data`, default role `buyer`).

### Admin bootstrap

Documented one-liner to promote Tony:
`update public.profiles set role = 'admin' where email = '<tony-email>';`

## Auth flow (magic-link)

1. `/auth/sign-in` — email field → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <origin>/auth/callback } })`.
2. `/auth/callback/route.ts` — `exchangeCodeForSession(code)`, then redirect home.
3. `middleware.ts` — refreshes the session cookie on navigation.
4. `AuthMenu` — shows "Sign in" or the user's email + "Sign out".

> Modified-Next.js note: `@supabase/ssr` uses `cookies()` and middleware. Before writing
> `middleware.ts`, the server client, and the callback route, read the relevant guides in
> `node_modules/next/dist/docs/` (middleware, cookies, route handlers) and heed deprecations.

## UI wiring (additive; nothing existing removed)

- **Save property** (existing button) → `savedParcels.toggle`; if not signed in, route to
  `/auth/sign-in`. `TonyvilleApp` loads the user's saved parcel ids on mount and updates
  optimistically (replacing the in-memory `Set`).
- **Ask Tony about this lot** (existing button) → opens `ContactTonyModal` prefilled with the
  selected parcel id/address and current model; submit → `leads.createLead` (works
  logged-out). Success + error states shown inline.
- **Save this search** (new control near filters) → `savedSearches.create` from current
  `SearchFilters` + sort; `SavedSearchesMenu` lists saved searches and re-applies one.
- **`/admin/leads`** — server component using the server client; lists leads with status,
  allows status change (`new`→`contacted`→`closed`). RLS makes it empty/forbidden for
  non-admins; the page also guards by checking the session's profile role.

## Error handling & graceful degradation

- `readiness.ts` reports whether `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  are present. When absent: AuthMenu, Save, Contact, Save-search, and `/admin` render a
  disabled/“not configured” state; search/map/scoring are unaffected.
- All data calls return typed `{ data | error }`; UI surfaces friendly messages and never
  throws into the render tree.
- No `dangerouslySetInnerHTML`; all user-entered text rendered through React escaping.

## Security

- Only the **anon** key is exposed to the browser (by design; RLS is the enforcement layer).
- RLS denies cross-user reads/writes; leads are write-only for the public and readable only
  by admins.
- Lead form input validated client- and policy-side (required name/email/message, email
  shape, length caps).
- Service-role key not used or shipped.

## Testing (Vitest — already configured)

Unit-test the pure, high-value logic (DB/network mocked or not needed):
- `mappers.ts`: row→domain and domain→insert for saved searches, saved parcels, leads,
  models; round-trip of `filters`/`parcel_data` JSON.
- Lead validation: rejects missing name/email/message and malformed email; accepts valid.
- Model seed mapping: static `tonyTinyHomeModels` → `tony_tiny_home_models` insert rows.
- `readiness.ts`: configured vs missing-env outcomes.

(RLS itself is enforced and verified at the database layer, plus `get_advisors` security
check after migration — not in Vitest.)

## Implementation phasing (single spec, two-phase plan)

- **Phase A — Foundation:** env fix, deps, browser/server clients, migrations applied + RLS
  + seed + advisors check, generated types, readiness guard, magic-link auth (sign-in,
  callback, middleware, AuthMenu), profile trigger.
- **Phase B — Features:** models read, saved parcels wiring, saved searches + menu, contact
  modal, admin leads page; delete superseded `future/` stubs; tests.

## Open items for implementation

- Obtain Tony's admin email to run the bootstrap update (or leave documented for later).
- Confirm `@supabase/ssr` middleware/cookie API against the modified Next.js docs before
  writing `middleware.ts` and the server client.
- Run `get_advisors` (security) after applying the migration and resolve any findings.
