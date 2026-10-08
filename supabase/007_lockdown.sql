-- Lockdown: this app has one owner. Applied automatically on deploy (see scripts/migrate.mjs). Safe to re-run.

-- The owner is the first account ever created.
create or replace function public.owner_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users order by created_at limit 1
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and auth.uid() = public.owner_id()
$$;

revoke all on function public.owner_id() from public, anon, authenticated;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.owner_id() to service_role;
grant execute on function public.is_owner() to authenticated, service_role;

-- Close sign-ups once the owner exists, so nobody else can create an account on the public URL
-- (and use your bank key, AI key or heartbeat).
create or replace function public.block_extra_signups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Sign-ups are closed: this Second Brain already has its owner.';
  end if;
  return new;
end
$$;

-- If the database ever refuses a trigger on auth.users, the server's owner check still keeps strangers out.
do $$
begin
  drop trigger if exists block_extra_signups on auth.users;
  create trigger block_extra_signups before insert on auth.users
    for each row execute function public.block_extra_signups();
exception when insufficient_privilege then
  raise notice 'Could not add the sign-up lock; turn off sign-ups in Supabase → Authentication instead.';
end
$$;

-- The heartbeat schedule lives in 010_source_keys.sql.

-- Server-only secrets (notification keys, owner): not even readable with a browser login.
revoke all on public.app_secrets from anon, authenticated;
