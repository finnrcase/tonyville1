# Supabase Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Tonyville to Supabase for accounts (magic-link), saved searches, saved parcels, a public Contact-Tony lead form, and an admin leads view — without touching the existing Mapbox/Regrid/mock/scoring flow.

**Architecture:** Browser Supabase client (`@supabase/ssr`) for per-user CRUD, authorized by Row Level Security; a server client for server components and the admin page; magic-link auth with a `proxy.ts` session refresh and an `/auth/callback` route. Schema + RLS + seed applied to the live project and committed as SQL. Graceful degradation when Supabase env is absent.

**Tech Stack:** Next.js 16 App Router (modified — **middleware is `proxy.ts`**, `cookies()` is async), TypeScript, React 19, Tailwind v4, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-27-supabase-integration-design.md`

**Critical modified-Next.js facts (verified in `node_modules/next/dist/docs/`):**
- Middleware is renamed **Proxy**: file is `src/proxy.ts`, exports `export function proxy(request: NextRequest)` (or default) + `export const config = { matcher }`.
- `cookies()` from `next/headers` is **async** — always `await cookies()`.
- Route handlers: standard `route.ts` with exported verbs.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `.env`, `.env.example` | fix | Correct `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| `package.json` | modify | Add `@supabase/supabase-js`, `@supabase/ssr`. |
| `supabase/migrations/0001_init.sql` | create | Tables, indexes, RLS, `is_admin()`, `handle_new_user` trigger. |
| `supabase/migrations/0002_seed_models.sql` | create | Seed `tony_tiny_home_models`. |
| `src/lib/supabase/readiness.ts` (+test) | create | `isSupabaseConfigured()` env guard. |
| `src/lib/supabase/client.ts` | create | Browser client. |
| `src/lib/supabase/server.ts` | create | Server client (async cookies). |
| `src/lib/supabase/types.ts` | create | Generated DB types. |
| `src/proxy.ts` | create | Session refresh (NOT `middleware.ts`). |
| `src/lib/data/mappers.ts` (+test) | create | Pure row↔domain mappers + lead validation. |
| `src/lib/data/profiles.ts` | create | `getProfile`, `isCurrentUserAdmin`. |
| `src/lib/data/models.ts` | create | `listActiveModels`. |
| `src/lib/data/savedParcels.ts` | create | list / toggle / updateNotes. |
| `src/lib/data/savedSearches.ts` | create | list / create / remove. |
| `src/lib/data/leads.ts` | create | createLead / listLeads / updateStatus. |
| `src/app/auth/sign-in/page.tsx` | create | Magic-link form. |
| `src/app/auth/callback/route.ts` | create | Code→session exchange. |
| `src/components/AuthMenu.tsx` | create | Header sign-in/out. |
| `src/components/ContactTonyModal.tsx` | create | Lead form (logged-out ok). |
| `src/components/SavedSearchesMenu.tsx` | create | Save + re-apply searches. |
| `src/app/admin/leads/page.tsx` | create | Admin leads table. |
| `src/components/TonyvilleApp.tsx` | modify | Supabase-backed saves; mount AuthMenu / SavedSearchesMenu / ContactTonyModal. |
| `src/components/ParcelDetailPanel.tsx` | modify | Add `onContact` prop; Save button already wired via props. |
| `src/lib/future/{auth,userProfiles,savedSearches,savedProperties,contactTony,tonyTinyHomeModels,supabase}.ts` | delete | Superseded. |

---

# Phase A — Foundation

## Task 1: Dependencies + fix `.env`

**Files:** `package.json`, `.env`, `.env.example`

- [ ] **Step 1: Install Supabase packages**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr
```
Expected: both added to `dependencies`, no errors.

- [ ] **Step 2: Fix `.env`** (it is currently malformed on the `SUPABASE_URL` line)

Replace the two broken Supabase lines so the file's Supabase entries read exactly (keep the existing Mapbox/Regrid/ATTOM lines unchanged; reuse the anon key value already present in your current `.env`):
```
NEXT_PUBLIC_SUPABASE_URL=https://kxkhhjynhavushindnaa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste the anon JWT already in your .env>
```
Remove the old `SUPABASE_URL=...` and `SUPABASE_ANON_KEY=...` lines.

- [ ] **Step 3: Align `.env.example`**

Set the Supabase section of `.env.example` to:
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Optional, only if a server-side admin path is added later:
# SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 4: Verify env loads**

Run: `grep -c '^NEXT_PUBLIC_SUPABASE_URL=https' .env`
Expected: `1`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add Supabase deps and fix env var names"
```
(`.env` is gitignored — not committed.)

---

## Task 2: Readiness guard

**Files:** `src/lib/supabase/readiness.ts`, test `src/lib/supabase/readiness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/supabase/readiness.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSupabaseConfigured } from "@/lib/supabase/readiness";

afterEach(() => vi.unstubAllEnvs());

describe("isSupabaseConfigured", () => {
  it("is true when url and anon key are present", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("is false when either is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(isSupabaseConfigured()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/supabase/readiness.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/supabase/readiness.ts
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/supabase/readiness.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/readiness.ts src/lib/supabase/readiness.test.ts
git commit -m "feat: add Supabase readiness guard"
```

---

## Task 3: Database migration (apply to live project + commit SQL)

**Files:** `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_seed_models.sql`, `src/lib/supabase/types.ts`

- [ ] **Step 1: Write `supabase/migrations/0001_init.sql`**

```sql
-- Tonyville Supabase schema + RLS

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null default 'buyer' check (role in ('buyer','admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- saved_searches
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
alter table public.saved_searches enable row level security;
create index saved_searches_user_idx on public.saved_searches(user_id);
create policy "saved_searches_owner" on public.saved_searches for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- saved_parcels
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
alter table public.saved_parcels enable row level security;
create index saved_parcels_user_idx on public.saved_parcels(user_id);
create policy "saved_parcels_owner" on public.saved_parcels for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- leads (public can insert; only admins read/update)
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
alter table public.leads enable row level security;
create policy "leads_insert_public" on public.leads for insert to anon, authenticated with check (true);
create policy "leads_select_admin" on public.leads for select using (public.is_admin());
create policy "leads_update_admin" on public.leads for update using (public.is_admin()) with check (public.is_admin());

-- tony_tiny_home_models (public reads active; admins manage)
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
alter table public.tony_tiny_home_models enable row level security;
create policy "models_select_active" on public.tony_tiny_home_models for select using (active or public.is_admin());
create policy "models_admin_write" on public.tony_tiny_home_models for all
  using (public.is_admin()) with check (public.is_admin());

-- auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name')
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Write `supabase/migrations/0002_seed_models.sql`**

```sql
insert into public.tony_tiny_home_models
  (name, square_feet, base_price, minimum_lot_size, utility_requirements, description, active)
values
  ('Tony 120 Studio', 120, null, 0.07, '["water","electricity"]',
    'Compact pad with 10 ft side setbacks.', true),
  ('Tony 140 Loft', 140, null, 0.09, '["water","electricity"]',
    'Small front porch and 12 ft side setbacks.', true),
  ('Tony 160 Classic', 160, null, 0.12, '["water","electricity","sewerSeptic"]',
    'Full utility run with 15 ft build envelope buffers.', true),
  ('Tony 200 Plus', 200, null, 0.16, '["water","electricity","sewerSeptic"]',
    'Larger pad, outdoor storage, and 20 ft frontage buffer.', true);
```

- [ ] **Step 3: Apply both migrations to the live project**

Using the Supabase MCP tool `apply_migration` against project `kxkhhjynhavushindnaa`:
- name `0001_init`, query = contents of `0001_init.sql`
- name `0002_seed_models`, query = contents of `0002_seed_models.sql`

Verify with `list_tables` (project `kxkhhjynhavushindnaa`, schema `public`): expect `profiles`, `saved_searches`, `saved_parcels`, `leads`, `tony_tiny_home_models`.

- [ ] **Step 4: Run the security advisors**

Use MCP `get_advisors` (project `kxkhhjynhavushindnaa`, type `security`). Expected: no ERROR-level findings (RLS is enabled on every table). Resolve any that appear.

- [ ] **Step 5: Generate TypeScript types**

Use MCP `generate_typescript_types` (project `kxkhhjynhavushindnaa`) and write the output to `src/lib/supabase/types.ts`. The file should export a `Database` type.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/lib/supabase/types.ts
git commit -m "feat: add Supabase schema, RLS, seed, and generated types"
```

---

## Task 4: Supabase clients + proxy session refresh

**Files:** `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/proxy.ts`

> No unit tests (these wrap framework/network glue); verified by typecheck + build + the live smoke check in Task 11.

- [ ] **Step 1: Browser client**

```ts
// src/lib/supabase/client.ts
"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Server client (async cookies)**

```ts
// src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component; safe to ignore (proxy refreshes)
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Proxy (renamed middleware) for session refresh**

```ts
// src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response; // graceful: Supabase not configured

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/client.ts src/lib/supabase/server.ts src/proxy.ts
git commit -m "feat: add Supabase browser/server clients and proxy session refresh"
```

---

## Task 5: Auth UI (magic-link) + profiles module

**Files:** `src/app/auth/sign-in/page.tsx`, `src/app/auth/callback/route.ts`, `src/components/AuthMenu.tsx`, `src/lib/data/profiles.ts`

- [ ] **Step 1: Sign-in page**

```tsx
// src/app/auth/sign-in/page.tsx
"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold text-[#111817]">Sign in to Tonyville</h1>
      {sent ? (
        <p className="text-sm text-[#56605a]">Check your email for a magic link.</p>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-2xl border border-[#e5e9e4] px-4 py-3 text-sm"
          />
          <button
            type="submit"
            className="rounded-2xl bg-[#203b2c] px-4 py-3 text-sm font-semibold text-white"
          >
            Send magic link
          </button>
          {error ? <p className="text-sm text-[#8b3f35]">{error}</p> : null}
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Callback route**

```ts
// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/auth/sign-in?error=auth`);
}
```

- [ ] **Step 3: Profiles data module**

```ts
// src/lib/data/profiles.ts
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getCurrentProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, role, created_at")
    .eq("id", user.id)
    .single();
  return data;
}

export async function isCurrentUserAdmin() {
  const profile = await getCurrentProfile();
  return profile?.role === "admin";
}
```

- [ ] **Step 4: AuthMenu (client header control)**

```tsx
// src/components/AuthMenu.tsx
"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/readiness";

export function AuthMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setEmail(session?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  if (!configured) return null;

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setEmail(null);
  }

  if (email) {
    return (
      <button
        type="button"
        onClick={signOut}
        className="inline-flex h-10 items-center rounded-2xl bg-white/90 px-3 text-sm font-semibold text-[#27302b] shadow-sm"
        title={email}
      >
        Sign out
      </button>
    );
  }

  return (
    <a
      href="/auth/sign-in"
      className="inline-flex h-10 items-center rounded-2xl bg-[#203b2c] px-3 text-sm font-semibold text-white"
    >
      Sign in
    </a>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.
```bash
git add src/app/auth src/components/AuthMenu.tsx src/lib/data/profiles.ts
git commit -m "feat: add magic-link auth UI, callback, and profiles module"
```

---

# Phase B — Features

## Task 6: Pure mappers + lead validation + models module

**Files:** `src/lib/data/mappers.ts` (+ test `src/lib/data/mappers.test.ts`), `src/lib/data/models.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/data/mappers.test.ts
import { describe, expect, it } from "vitest";
import {
  fromModelRow,
  toLeadInsert,
  toSavedParcelInsert,
  toSavedSearchInsert,
  validateLead,
} from "@/lib/data/mappers";
import type { ScoredParcel, SearchFilters } from "@/types/parcel";

const filters: SearchFilters = {
  location: "Austin, TX",
  radiusMiles: 55,
  maxPrice: 140000,
  modelSize: 160,
  utilities: { water: false, electricity: false, sewerSeptic: false },
  requiresRoadAccess: true,
  permitFriendliness: "any",
};

describe("validateLead", () => {
  it("rejects missing fields and bad email", () => {
    expect(validateLead({ name: "", email: "x", message: "" }).valid).toBe(false);
    expect(validateLead({ name: "A", email: "not-an-email", message: "hi" }).valid).toBe(false);
  });
  it("accepts a valid lead", () => {
    expect(validateLead({ name: "Ann", email: "a@b.com", message: "Interested" }).valid).toBe(true);
  });
});

describe("toSavedSearchInsert", () => {
  it("denormalizes filter columns and stores the blob", () => {
    const row = toSavedSearchInsert("u1", filters);
    expect(row).toMatchObject({
      user_id: "u1",
      location: "Austin, TX",
      radius: 55,
      max_price: 140000,
      selected_tiny_home_model: 160,
    });
    expect(row.filters).toEqual(filters);
  });
});

describe("toSavedParcelInsert", () => {
  it("maps id, address, score, and data", () => {
    const parcel = {
      id: "regrid-1",
      address: "1 A St",
      city: "Bastrop",
      state: "TX",
      fitScore: { total: 88 },
    } as unknown as ScoredParcel;
    const row = toSavedParcelInsert("u1", parcel);
    expect(row).toMatchObject({
      user_id: "u1",
      parcel_id: "regrid-1",
      parcel_address: "1 A St, Bastrop, TX",
      score: 88,
    });
    expect(row.parcel_data).toBe(parcel);
  });
});

describe("toLeadInsert + fromModelRow", () => {
  it("builds a lead row with default-safe fields", () => {
    const row = toLeadInsert({ name: "Ann", email: "a@b.com", message: "Hi", selectedParcelId: "regrid-1" });
    expect(row).toMatchObject({ name: "Ann", email: "a@b.com", message: "Hi", selected_parcel_id: "regrid-1" });
  });
  it("maps a model row to domain", () => {
    const model = fromModelRow({
      id: "m1", name: "Tony 160", square_feet: 160, base_price: null,
      minimum_lot_size: 0.12, utility_requirements: ["water"], description: "d",
      image_url: null, active: true, created_at: "2026-01-01",
    });
    expect(model).toMatchObject({ id: "m1", name: "Tony 160", squareFeet: 160, minimumLotSize: 0.12 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/data/mappers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mappers.ts`**

```ts
// src/lib/data/mappers.ts
import type { ScoredParcel, SearchFilters } from "@/types/parcel";

export type LeadInput = {
  name: string;
  email: string;
  message: string;
  phone?: string;
  selectedParcelId?: string;
  selectedModel?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLead(input: Partial<LeadInput>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!input.name?.trim()) errors.push("Name is required.");
  if (!input.email?.trim() || !EMAIL_RE.test(input.email)) errors.push("A valid email is required.");
  if (!input.message?.trim()) errors.push("A message is required.");
  return { valid: errors.length === 0, errors };
}

export function toLeadInsert(input: LeadInput) {
  return {
    name: input.name.trim(),
    email: input.email.trim(),
    message: input.message.trim(),
    phone: input.phone?.trim() || null,
    selected_parcel_id: input.selectedParcelId ?? null,
    selected_model: input.selectedModel ?? null,
  };
}

export function toSavedSearchInsert(userId: string, filters: SearchFilters) {
  return {
    user_id: userId,
    location: filters.location,
    radius: filters.radiusMiles,
    max_price: filters.maxPrice,
    selected_tiny_home_model: filters.modelSize,
    filters,
  };
}

export function fromSavedSearchRow(row: {
  id: string;
  filters: unknown;
  created_at: string;
}): { id: string; filters: SearchFilters; createdAt: string } {
  return { id: row.id, filters: row.filters as SearchFilters, createdAt: row.created_at };
}

export function toSavedParcelInsert(userId: string, parcel: ScoredParcel) {
  return {
    user_id: userId,
    parcel_id: parcel.id,
    parcel_address: `${parcel.address}, ${parcel.city}, ${parcel.state}`,
    parcel_data: parcel,
    score: parcel.fitScore.total,
    notes: null as string | null,
  };
}

export function fromModelRow(row: {
  id: string;
  name: string;
  square_feet: number | null;
  base_price: number | null;
  minimum_lot_size: number | null;
  utility_requirements: unknown;
  description: string | null;
  image_url: string | null;
  active: boolean;
  created_at: string;
}) {
  return {
    id: row.id,
    name: row.name,
    squareFeet: row.square_feet,
    basePrice: row.base_price,
    minimumLotSize: row.minimum_lot_size,
    utilityRequirements: (row.utility_requirements as string[]) ?? [],
    description: row.description,
    imageUrl: row.image_url,
    active: row.active,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/data/mappers.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `models.ts`**

```ts
// src/lib/data/models.ts
"use client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fromModelRow } from "@/lib/data/mappers";

export async function listActiveModels() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("tony_tiny_home_models")
    .select("*")
    .eq("active", true)
    .order("square_feet", { ascending: true });
  if (error || !data) return [];
  return data.map(fromModelRow);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/mappers.ts src/lib/data/mappers.test.ts src/lib/data/models.ts
git commit -m "feat: add data mappers, lead validation, and models reader"
```

---

## Task 7: Saved parcels (module + UI wiring)

**Files:** `src/lib/data/savedParcels.ts`, modify `src/components/TonyvilleApp.tsx`, `src/components/ParcelDetailPanel.tsx`

- [ ] **Step 1: Implement `savedParcels.ts`**

```ts
// src/lib/data/savedParcels.ts
"use client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toSavedParcelInsert } from "@/lib/data/mappers";
import type { ScoredParcel } from "@/types/parcel";

export async function listSavedParcelIds(): Promise<string[]> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.from("saved_parcels").select("parcel_id");
  return (data ?? []).map((r) => r.parcel_id);
}

export async function saveParcel(parcel: ScoredParcel): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from("saved_parcels")
    .insert(toSavedParcelInsert(user.id, parcel));
  return !error;
}

export async function unsaveParcel(parcelId: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("saved_parcels").delete().eq("parcel_id", parcelId);
  return !error;
}
```

- [ ] **Step 2: Wire `TonyvilleApp.tsx` — load saved ids + persist toggles**

In `src/components/TonyvilleApp.tsx`, add imports near the other `@/lib` imports:
```tsx
import { isSupabaseConfigured } from "@/lib/supabase/readiness";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { listSavedParcelIds, saveParcel, unsaveParcel } from "@/lib/data/savedParcels";
```

Replace the existing `toggleSaved` function:
```tsx
  const toggleSaved = (parcelId: string) => {
    setSavedParcelIds((current) => {
      const next = new Set(current);

      if (next.has(parcelId)) {
        next.delete(parcelId);
      } else {
        next.add(parcelId);
      }

      return next;
    });
  };
```
with a Supabase-backed version that loads ids on mount and persists optimistically:
```tsx
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    listSavedParcelIds().then((ids) => {
      if (active) setSavedParcelIds(new Set(ids));
    });
    const supabase = createSupabaseBrowserClient();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      listSavedParcelIds().then((ids) => active && setSavedParcelIds(new Set(ids)));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const toggleSaved = (parcelId: string) => {
    if (!isSupabaseConfigured()) return;
    const parcel = sortedParcels.find((item) => item.id === parcelId);
    const isSaved = savedParcelIds.has(parcelId);

    setSavedParcelIds((current) => {
      const next = new Set(current);
      if (isSaved) next.delete(parcelId);
      else next.add(parcelId);
      return next;
    });

    const op = isSaved
      ? unsaveParcel(parcelId)
      : parcel
        ? saveParcel(parcel)
        : Promise.resolve(false);

    op.then((ok) => {
      if (ok) return;
      // revert + send unauthenticated users to sign in
      setSavedParcelIds((current) => {
        const next = new Set(current);
        if (isSaved) next.add(parcelId);
        else next.delete(parcelId);
        return next;
      });
      if (!isSaved) window.location.href = "/auth/sign-in";
    });
  };
```

- [ ] **Step 3: Mount `AuthMenu` in the header**

In `TonyvilleApp.tsx`, add the import:
```tsx
import { AuthMenu } from "@/components/AuthMenu";
```
In the header actions block, immediately before the mobile "Filters" button (the `<button ... onClick={() => setMobileFiltersOpen(true)} ... md:hidden>`), add:
```tsx
          <AuthMenu />
```

- [ ] **Step 4: Add `onContact` prop to `ParcelDetailPanel.tsx`** (used in Task 9)

Extend the props type:
```tsx
type ParcelDetailPanelProps = {
  parcel?: ScoredParcel;
  saved: boolean;
  onToggleSave: (parcelId: string) => void;
  enrichment?: ParcelEnrichment;
  enrichmentStatus: EnrichmentStatus;
  onContact?: (parcel: ScoredParcel) => void;
};
```
Destructure `onContact`, and change the "Ask Tony about this lot" button to call it:
```tsx
        <button
          type="button"
          onClick={() => parcel && onContact?.(parcel)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#203b2c] px-4 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#2e523e]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Ask Tony about this lot
        </button>
```

- [ ] **Step 5: Typecheck, lint, test, commit**

Run: `npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -3`
Expected: all PASS.
```bash
git add src/lib/data/savedParcels.ts src/components/TonyvilleApp.tsx src/components/ParcelDetailPanel.tsx
git commit -m "feat: persist saved parcels via Supabase and mount auth menu"
```

---

## Task 8: Saved searches (module + menu)

**Files:** `src/lib/data/savedSearches.ts`, `src/components/SavedSearchesMenu.tsx`, modify `src/components/TonyvilleApp.tsx`

- [ ] **Step 1: Implement `savedSearches.ts`**

```ts
// src/lib/data/savedSearches.ts
"use client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fromSavedSearchRow, toSavedSearchInsert } from "@/lib/data/mappers";
import type { SearchFilters } from "@/types/parcel";

export async function listSavedSearches() {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase
    .from("saved_searches")
    .select("id, filters, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []).map(fromSavedSearchRow);
}

export async function createSavedSearch(filters: SearchFilters): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from("saved_searches")
    .insert(toSavedSearchInsert(user.id, filters));
  return !error;
}

export async function removeSavedSearch(id: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("saved_searches").delete().eq("id", id);
  return !error;
}
```

- [ ] **Step 2: Implement `SavedSearchesMenu.tsx`**

```tsx
// src/components/SavedSearchesMenu.tsx
"use client";
import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/readiness";
import {
  createSavedSearch,
  listSavedSearches,
  removeSavedSearch,
} from "@/lib/data/savedSearches";
import type { SearchFilters } from "@/types/parcel";

type SavedSearch = { id: string; filters: SearchFilters; createdAt: string };

export function SavedSearchesMenu({
  filters,
  onApply,
}: {
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
}) {
  const [items, setItems] = useState<SavedSearch[]>([]);
  const configured = isSupabaseConfigured();

  const refresh = () => listSavedSearches().then(setItems);
  useEffect(() => {
    if (configured) void refresh();
  }, [configured]);

  if (!configured) return null;

  async function onSave() {
    const ok = await createSavedSearch(filters);
    if (ok) void refresh();
    else window.location.href = "/auth/sign-in";
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={onSave}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[#eef7f0] px-3 text-sm font-semibold text-[#203b2c]"
      >
        <Bookmark className="h-4 w-4" /> Save this search
      </button>
      {items.length > 0 ? (
        <div className="grid gap-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={() => onApply(item.filters)}
                className="truncate rounded-xl bg-[#f7f6f2] px-2 py-1 font-semibold text-[#27302b]"
              >
                {item.filters.location} · {item.filters.radiusMiles}mi
              </button>
              <button
                type="button"
                onClick={() => removeSavedSearch(item.id).then(refresh)}
                className="text-[#8b3f35]"
                aria-label="Remove saved search"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Mount in `TonyvilleApp.tsx`**

Add import:
```tsx
import { SavedSearchesMenu } from "@/components/SavedSearchesMenu";
```
In the desktop filters `aside`, immediately after the `<SearchFilters ... />` wrapper `</div>` and before `<ParcelList ... />`, add:
```tsx
            <div className="rounded-3xl border border-white/70 bg-white/88 p-3 shadow-[0_22px_70px_rgba(22,24,23,0.15)] backdrop-blur-2xl">
              <SavedSearchesMenu filters={filters} onApply={handleFiltersChange} />
            </div>
```

- [ ] **Step 4: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.
```bash
git add src/lib/data/savedSearches.ts src/components/SavedSearchesMenu.tsx src/components/TonyvilleApp.tsx
git commit -m "feat: add saved searches with save/apply menu"
```

---

## Task 9: Contact Tony lead form

**Files:** `src/lib/data/leads.ts`, `src/components/ContactTonyModal.tsx`, modify `src/components/TonyvilleApp.tsx`

- [ ] **Step 1: Implement `leads.ts`**

```ts
// src/lib/data/leads.ts
"use client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toLeadInsert, type LeadInput } from "@/lib/data/mappers";

export async function createLead(input: LeadInput): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("leads").insert(toLeadInsert(input));
  return !error;
}
```

- [ ] **Step 2: Implement `ContactTonyModal.tsx`**

```tsx
// src/components/ContactTonyModal.tsx
"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { createLead } from "@/lib/data/leads";
import { validateLead } from "@/lib/data/mappers";
import type { ScoredParcel } from "@/types/parcel";

export function ContactTonyModal({
  parcel,
  onClose,
}: {
  parcel: ScoredParcel;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const check = validateLead(form);
    if (!check.valid) {
      setErrors(check.errors);
      return;
    }
    const ok = await createLead({
      ...form,
      selectedParcelId: parcel.id,
      selectedModel: parcel.compatibility.selectedModel.name,
    });
    if (ok) setSent(true);
    else setErrors(["Could not send right now. Please try again."]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111817]/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#111817]">Ask Tony about this lot</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-[#27302b]" />
          </button>
        </div>
        <p className="mt-1 text-xs text-[#66716a]">{parcel.address}, {parcel.city}, {parcel.state}</p>
        {sent ? (
          <p className="mt-4 text-sm text-[#203b2c]">Thanks — Tony will be in touch.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 grid gap-3">
            <input required placeholder="Name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-2xl border border-[#e5e9e4] px-4 py-3 text-sm" />
            <input required type="email" placeholder="Email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-2xl border border-[#e5e9e4] px-4 py-3 text-sm" />
            <input placeholder="Phone (optional)" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="rounded-2xl border border-[#e5e9e4] px-4 py-3 text-sm" />
            <textarea required placeholder="Message" value={form.message} rows={4}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="rounded-2xl border border-[#e5e9e4] px-4 py-3 text-sm" />
            {errors.length > 0 ? (
              <ul className="text-xs text-[#8b3f35]">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            ) : null}
            <button type="submit"
              className="rounded-2xl bg-[#203b2c] px-4 py-3 text-sm font-semibold text-white">
              Send to Tony
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into `TonyvilleApp.tsx`**

Add import:
```tsx
import { ContactTonyModal } from "@/components/ContactTonyModal";
```
Add state near the other `useState` hooks:
```tsx
  const [contactParcel, setContactParcel] = useState<ScoredParcel | undefined>(undefined);
```
Pass `onContact` to the panel (update the existing `<ParcelDetailPanel .../>` usage to add the prop):
```tsx
          onContact={(parcel) => setContactParcel(parcel)}
```
Render the modal before the closing `</div>` of the root container:
```tsx
      {contactParcel ? (
        <ContactTonyModal parcel={contactParcel} onClose={() => setContactParcel(undefined)} />
      ) : null}
```
(Note: `ScoredParcel` is already imported in `TonyvilleApp.tsx`. If not, add it to the existing `@/types/parcel` import.)

- [ ] **Step 4: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.
```bash
git add src/lib/data/leads.ts src/components/ContactTonyModal.tsx src/components/TonyvilleApp.tsx
git commit -m "feat: add Contact Tony lead form wired to the detail panel"
```

---

## Task 10: Admin leads page

**Files:** `src/app/admin/leads/page.tsx`

- [ ] **Step 1: Implement the admin page (server component, admin-guarded)**

```tsx
// src/app/admin/leads/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/data/profiles";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  if (!(await isCurrentUserAdmin())) {
    redirect("/auth/sign-in?next=/admin/leads");
  }

  const supabase = await createSupabaseServerClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, email, phone, selected_parcel_id, selected_model, message, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold text-[#111817]">Leads</h1>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#edf0ec]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f7f6f2] text-xs uppercase text-[#66716a]">
            <tr>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Parcel</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {(leads ?? []).map((lead) => (
              <tr key={lead.id} className="border-t border-[#edf0ec]">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(lead.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2">{lead.name}</td>
                <td className="px-3 py-2">{lead.email}</td>
                <td className="px-3 py-2">{lead.selected_parcel_id ?? "—"}</td>
                <td className="px-3 py-2">{lead.selected_model ?? "—"}</td>
                <td className="px-3 py-2">{lead.status}</td>
                <td className="px-3 py-2 max-w-xs truncate" title={lead.message}>{lead.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(leads ?? []).length === 0 ? (
        <p className="mt-4 text-sm text-[#66716a]">No leads yet.</p>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.
```bash
git add src/app/admin/leads/page.tsx
git commit -m "feat: add admin-only leads view"
```

---

## Task 11: Cleanup + full verification

**Files:** delete superseded `future/` stubs

- [ ] **Step 1: Delete superseded stubs**

```bash
git rm src/lib/future/auth.ts src/lib/future/userProfiles.ts \
  src/lib/future/savedSearches.ts src/lib/future/savedProperties.ts \
  src/lib/future/contactTony.ts src/lib/future/tonyTinyHomeModels.ts \
  src/lib/future/supabase.ts
```
(Leave `financing.ts`, `costEstimator.ts`, `sitePreparation.ts`, `aiParcelRecommendations.ts`.)

- [ ] **Step 2: Confirm nothing imports the deleted stubs**

Run: `grep -rn "lib/future/\(auth\|userProfiles\|savedSearches\|savedProperties\|contactTony\|tonyTinyHomeModels\|supabase\)" src || echo "OK: no references"`
Expected: `OK: no references`.

- [ ] **Step 3: Full suite + lint + build**

Run: `npm test 2>&1 | tail -4 && npm run lint && npx tsc --noEmit && npm run build 2>&1 | tail -20`
Expected: all tests pass; lint clean; build succeeds; route list includes `/auth/sign-in`, `/auth/callback`, `/admin/leads`.

- [ ] **Step 4: Live smoke check (uses your real Supabase project)**

Build is done; start the production server on a free port and exercise the public lead insert (RLS allows anonymous insert):
```bash
(npx next start -p 3021 &) ; sleep 1
# anonymous lead insert via the same anon path the form uses is exercised in-browser;
# for a headless check, confirm the page builds and models read works:
curl -s --retry-connrefused --retry 30 --retry-delay 1 -o /dev/null -w "sign-in: %{http_code}\n" http://localhost:3021/auth/sign-in
curl -s -o /dev/null -w "admin (expect redirect 307): %{http_code}\n" http://localhost:3021/admin/leads
```
Then stop the server: `lsof -nP -iTCP:3021 -sTCP:LISTEN -t | xargs kill`.
Expected: sign-in `200`; admin `307` (redirect to sign-in for anonymous).

- [ ] **Step 5: Verify RLS via advisors once more**

Use MCP `get_advisors` (project `kxkhhjynhavushindnaa`, type `security`). Expected: no ERROR findings.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove superseded future stubs after Supabase integration"
```

---

## Post-implementation (manual, documented)

- **Promote Tony to admin** once he has signed in (creating his profile): in SQL editor / via MCP `execute_sql`:
  `update public.profiles set role = 'admin' where email = '<tony-email>';`
- **Push the branch** and open a PR (the sandbox has no GitHub credentials):
  `git push -u origin supabase-implementation`.

---

## Self-Review (completed by plan author)

- **Spec coverage:** client setup (Task 4) ✓; SQL migrations + RLS (Task 3) ✓; all 5 tables with exact columns (Task 3) ✓; profiles auto-create trigger + roles (Task 3) ✓; saved searches (Task 8) ✓; saved parcels (Task 7) ✓; Contact Tony lead form, works logged-out (Task 9) ✓; admin leads view (Task 10) ✓; magic-link auth (Task 5) ✓; env fix (Task 1) ✓; readiness/graceful degradation (Task 2, used in Tasks 5/7/8) ✓; models static-for-scoring + seeded catalog read (Tasks 3/6) ✓; don't break Mapbox/Regrid/mock (no edits to those paths; saves are additive) ✓; Vitest coverage of mappers/validation/readiness (Tasks 2/6) ✓; modular for future providers via data modules ✓.
- **Modified-Next.js correctness:** uses `src/proxy.ts` (not `middleware.ts`) with `proxy` export; `await cookies()` everywhere; standard `route.ts`. ✓
- **Placeholder scan:** no TBD/TODO; every code step has full code; the model `base_price` NULLs and the admin-email step are intentional (documented), not deferred implementation.
- **Type consistency:** `LeadInput`, `toLeadInsert`, `validateLead`, `toSavedSearchInsert`/`fromSavedSearchRow`, `toSavedParcelInsert`, `fromModelRow`, `createSupabaseBrowserClient`/`createSupabaseServerClient`, `isSupabaseConfigured` used consistently across tasks; `onContact` added to `ParcelDetailPanel` props in Task 7 and used in Task 9.
```
