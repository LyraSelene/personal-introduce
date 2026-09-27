-- Register and confirm your email on the website first.
-- Replace the placeholder, then execute ONLY in Supabase SQL Editor.
-- Running again deliberately transfers ownership to the specified verified user.
do $$
declare owner_id uuid;
begin
  select id into owner_id from auth.users
  where lower(email) = lower('YOUR_VERIFIED_EMAIL') and email_confirmed_at is not null;
  if owner_id is null then raise exception 'Register and verify the owner email first'; end if;
  insert into private.site_owner (singleton, user_id) values (true, owner_id)
  on conflict (singleton) do update set user_id = excluded.user_id;
end;
$$;
