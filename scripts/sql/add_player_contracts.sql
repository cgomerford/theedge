-- Scout §1 — contract years for the "contract expires this season" flag.
-- MLB's Stats API does not publish contract terms, so nothing writes this table automatically.
-- Fill it from a source you trust (a Spotrac / Cot's export, or by hand) and the flag appears.
-- Until it has rows the Scout Report says contract data isn't loaded rather than showing "none expiring".

create table if not exists player_contracts (
  player_id            integer primary key,          -- MLB person id
  player_name          text,
  expires_after_season smallint not null,            -- e.g. 2026 = his deal ends when this season does
  source               text,                         -- where the year came from, for auditing
  updated_at           timestamptz not null default now()
);
