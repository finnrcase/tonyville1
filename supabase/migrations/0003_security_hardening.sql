-- Security hardening (resolves Supabase advisor warnings)

-- Tighten public lead inserts: enforce sane bounds and prevent setting a
-- non-default status. Replaces the permissive WITH CHECK (true) policy.
drop policy "leads_insert_public" on public.leads;
create policy "leads_insert_public" on public.leads for insert to anon, authenticated
  with check (
    status = 'new'
    and char_length(name) between 1 and 200
    and char_length(email) between 3 and 320
    and char_length(message) between 1 and 4000
    and (phone is null or char_length(phone) <= 40)
  );

-- handle_new_user() is a trigger function and must not be callable via the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Note: is_admin() intentionally remains executable by anon/authenticated because
-- the public `tony_tiny_home_models` SELECT policy (`active or is_admin()`) calls it
-- during anonymous reads. It only returns the caller's own admin boolean.
