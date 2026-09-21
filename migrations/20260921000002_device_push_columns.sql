-- Columns for push notifications and app-open tracking. platform, app_version,
-- os_version and locale already exist on devices. Everything here is written
-- by the app through the sync-device handler (see syncDevice.ts), except
-- last_opened_at, which the server stamps with its own clock.
alter table devices
  add column if not exists timezone               text,                                  -- IANA name, e.g. Australia/Sydney
  add column if not exists expo_push_token        text,                                  -- ExponentPushToken[...] (Expo's token, not APNs/FCM)
  add column if not exists push_token_updated_at  timestamptz,
  add column if not exists push_permission        text    not null default 'undetermined', -- granted | denied | undetermined
  add column if not exists notifications_enabled  boolean not null default false,        -- the in-app Settings toggle
  add column if not exists last_opened_at         timestamptz;

-- The push sender looks for enabled devices by timezone.
create index if not exists devices_push_due_idx
  on devices (timezone)
  where notifications_enabled and push_permission = 'granted' and expo_push_token is not null;
