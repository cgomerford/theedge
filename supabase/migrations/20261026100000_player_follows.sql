-- player_follows: the players a signed-in person follows (free accounts: up to 10; teams stay on subscribers.teams, up to 3).
-- Single writer: src/lib/follows.ts (via POST /api/follow). Until this is applied the Follow button for players does nothing
-- and /me shows an empty list; nothing errors.

create table if not exists player_follows (
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  player_id     integer not null,
  player_name   text not null,
  created_at    timestamptz not null default now(),
  primary key (subscriber_id, player_id)
);

create index if not exists player_follows_subscriber_idx on player_follows (subscriber_id);
