-- Simple table to log requests
create table if not exists rate_limit_events (
  id          bigserial primary key,
  device_id   text        not null,
  request_id  text        not null,
  created_at  timestamptz not null default now()
);

-- Index for fast lookups by device + time
create index if not exists rate_limit_device_ts_idx
  on rate_limit_events (device_id, created_at);

-- Core function: check + insert in one transaction
create or replace function enforce_rate_limit(
  _device_id      text,
  _limit          int,
  _window_seconds int,
  _request_id     text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare ok boolean;
begin
  -- Lock per device so two requests at the same millisecond don't sneak past
  perform pg_advisory_xact_lock(hashtext(_device_id));

  with recent as (
    select count(*) as n
    from rate_limit_events
    where device_id = _device_id
      and created_at > now() - make_interval(secs => _window_seconds)
  ),
  ins as (
    insert into rate_limit_events (device_id, request_id)
    select _device_id, coalesce(_request_id, gen_random_uuid()::text)
    from recent
    where n < _limit
    returning 1
  )
  select exists (select 1 from ins) into ok;

  return ok; -- true = allowed, false = too many requests
end;
$$;

grant execute on function enforce_rate_limit(text, int, int, text) to anon, authenticated, service_role;

-- RLS
alter table rate_limit_events enable row level security;

create policy "Allow insert for service role"
on rate_limit_events for insert to service_role with check (true);

create policy "Allow update for service role"
on rate_limit_events for update to service_role using (true) with check (true);

create policy "Allow select for service role"
on rate_limit_events for select to service_role using (true);

create policy "Allow delete for service role"
on rate_limit_events for delete to service_role using (true);
