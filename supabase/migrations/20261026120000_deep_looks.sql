-- deep_looks: one full Pro module per free account per calendar day (Europe/London).
-- Single writer: src/lib/deep-look.ts (recordDeepLook). The primary key (user_id, day) is the "one a day" rule.
-- Until this is applied the code treats free accounts as having no deep look left and shows the locked state; nothing errors.

create table if not exists deep_looks (
  user_id    uuid not null references subscribers(id) on delete cascade,
  day        date not null,
  feature    text not null,
  key        text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table deep_looks enable row level security;

-- A signed-in user can read only their own rows. Writes happen from the server with the service role.
drop policy if exists deep_looks_read_own on deep_looks;
create policy deep_looks_read_own on deep_looks
  for select using (auth.uid() = user_id);
