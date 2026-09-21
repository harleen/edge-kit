-- enforce_rate_limit is SECURITY DEFINER and 20250417000001 granted it to anon,
-- so anyone holding a project's public anon key could call it directly
-- (/rest/v1/rpc/enforce_rate_limit) and insert rows into rate_limit_events.
-- Only edge functions (service_role) call it. Existing projects: copy this file
-- into supabase/migrations/ and push. New projects get it in the same push.
revoke execute on function enforce_rate_limit(text, int, int, text) from public, anon, authenticated;
grant  execute on function enforce_rate_limit(text, int, int, text) to service_role;

-- Make RLS explicit for the device tables (no-ops if already enabled). With RLS
-- on and no policies, the public key can read and write nothing; edge functions
-- use the service role, which bypasses RLS.
alter table devices        enable row level security;
alter table device_tokens  enable row level security;
