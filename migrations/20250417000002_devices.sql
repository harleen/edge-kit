create table if not exists devices (
  device_id   text        primary key,
  platform    text,                              -- ios | mac | android | web
  app_version text,
  os_version  text,
  locale      text,                              -- e.g. en-CA, ja-JP
  created_at  timestamptz not null default now()
);
