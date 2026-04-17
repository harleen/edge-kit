create table if not exists device_tokens (
  device_id   text        primary key references devices(device_id) on delete cascade,
  token       text        not null,
  status      text        not null default 'active',  -- active | blocked
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);
