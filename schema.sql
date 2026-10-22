-- WhatsLonexelyn: jalankan sekali di Supabase > SQL Editor.
-- Semua objek berawalan wl_ agar tidak bentrok dengan project lain.

create table if not exists public.wl_profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  about text default 'Hey there! I am using WhatsLonexelyn',
  created_at timestamptz default now()
);

create table if not exists public.wl_messages (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references public.wl_profiles on delete cascade,
  receiver uuid not null references public.wl_profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists wl_messages_sender_idx on public.wl_messages (sender, created_at);
create index if not exists wl_messages_receiver_idx on public.wl_messages (receiver, created_at);

alter table public.wl_profiles enable row level security;
alter table public.wl_messages enable row level security;

create policy "wl: profil terbaca user login" on public.wl_profiles
  for select to authenticated using (true);
create policy "wl: ubah profil sendiri" on public.wl_profiles
  for update to authenticated using (id = auth.uid());
create policy "wl: baca pesan sendiri" on public.wl_messages
  for select to authenticated using (auth.uid() in (sender, receiver));
create policy "wl: kirim sebagai diri sendiri" on public.wl_messages
  for insert to authenticated with check (sender = auth.uid());
create policy "wl: tandai dibaca" on public.wl_messages
  for update to authenticated using (receiver = auth.uid());

revoke all on public.wl_profiles, public.wl_messages from anon, authenticated;
grant select on public.wl_profiles to authenticated;
grant update (display_name, about) on public.wl_profiles to authenticated;
grant select, insert on public.wl_messages to authenticated;
grant update (read_at) on public.wl_messages to authenticated;

create or replace function public.wl_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.wl_profiles (id, username, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'user' || substr(new.id::text, 1, 8)),
    new.raw_user_meta_data->>'username'
  );
  return new;
end $$;

drop trigger if exists wl_on_signup on auth.users;
create trigger wl_on_signup after insert on auth.users
  for each row execute function public.wl_new_user();

alter publication supabase_realtime add table public.wl_messages;
