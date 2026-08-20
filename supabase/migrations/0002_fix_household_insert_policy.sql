-- auth.role() = 'authenticated' failed to match against real requests
-- (household insert 500'd with 42501 during M0 verification) even though
-- the caller was a logged-in user. auth.uid() IS NOT NULL is the more
-- robust/standard Supabase check for "any authenticated user" and doesn't
-- depend on the JWT role claim being attached to the PostgREST request.

drop policy if exists household_insert on household;
create policy household_insert on household for insert
  with check (auth.uid() is not null);
