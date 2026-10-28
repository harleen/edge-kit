-- Usage counts (USAGE.md): what the app did for a device, per UTC
-- day, never the content. Kept 13 months per device, then folded into
-- monthly totals with no device ID by a monthly pg_cron job.

create table if not exists public.usage_daily (
  device_id  text not null,
  day        date not null,          -- UTC
  kind       text not null,          -- 'open', ...
  count      int  not null default 1,
  primary key (device_id, day, kind)
);

create table if not exists public.usage_monthly (
  month    date not null,             -- the first of the month
  kind     text not null,
  count    bigint not null,           -- all the month's counts of this kind
  devices  int not null,              -- how many devices had at least one
  primary key (month, kind)
);

-- Service role only: RLS on, no policies
alter table public.usage_daily enable row level security;
alter table public.usage_monthly enable row level security;

-- One statement, so counts landing at once all add up
create or replace function public.count_usage(_device_id text, _kind text)
returns void language sql as $$
  insert into public.usage_daily (device_id, day, kind)
  values (_device_id, (now() at time zone 'utc')::date, _kind)
  on conflict (device_id, day, kind) do update set count = usage_daily.count + 1;
$$;

-- Whole months over 13 months old become totals, in one transaction
create or replace function public.roll_up_usage()
returns void language plpgsql as $$
declare
  cutoff date := date_trunc('month', (now() at time zone 'utc')::date) - interval '12 months';
begin
  insert into public.usage_monthly (month, kind, count, devices)
    select date_trunc('month', day)::date, kind, sum(count), count(distinct device_id)
    from public.usage_daily where day < cutoff
    group by 1, 2
  on conflict (month, kind) do update set count = usage_monthly.count + excluded.count,
                                          devices = usage_monthly.devices + excluded.devices;
  delete from public.usage_daily where day < cutoff;
end;
$$;

revoke execute on function public.count_usage(text, text) from public, anon, authenticated;
revoke execute on function public.roll_up_usage() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

-- The first of each month, 03:00 UTC
select cron.schedule('roll-up-usage-monthly', '0 3 1 * *', $$ select public.roll_up_usage(); $$);
