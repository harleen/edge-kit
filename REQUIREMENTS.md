# edge-kit — Requirements Document v0.3

## Purpose
A shared Deno package for Supabase Edge Functions. Provides the base infrastructure layer used across consuming projects. Principle: **generic infrastructure only — no business logic, no app-specific schema.**

---

## Philosophy
- **Device is the first-class citizen.** A device exists and can use the app anonymously.
- **Profile is opt-in.** The app creates a profile that references the device — never the reverse.
- **Privacy by default.** `devices` stores only device characteristics, not behavioral data. No usage tracking, no behavioral signals.

---

## Repo
- GitHub: `github.com/<your-org>/edge-kit`
- Runtime: Deno (Supabase Edge Functions)

---

## Package Structure

```
edge-kit/
├── deno.json
├── mod.ts
├── errors.ts
├── cors.ts
├── withTimeout.ts
├── supabaseClient.ts
├── requireDevice.ts
├── checkLimits.ts
├── registerDevice.ts
└── migrations/
    ├── 20250417000001_rate_limit.sql
    ├── 20250417000002_devices.sql
    └── 20250417000003_device_tokens.sql
```

> **Migration naming:** Timestamp-based to avoid conflicts with each app's existing migration sequence. Run edge-kit migrations first as a prerequisite before any app-level migrations.

---

## Modules

### `errors.ts`
Generic HTTP response helpers and typed error codes.
- `ErrorCodes` — typed const map (AUTH_ERROR, RATE_LIMITED, DB_ERROR, etc.)
- `errResp(code, message, status, requestId, extraHeaders?)` → `Response`
- `okResp(data, requestId, status?, headers?)` → `Response`
- `upstreamErr(status, requestId, retryAfter?)` → `Response`
- `genRequestId()` → `string` (UUID)
- `addReqId(headers, requestId)` → headers with X-Request-Id

### `cors.ts`
CORS constant only — not baked into responses so apps control when/how it's applied.
```ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id, x-device-token",
};
```

### `withTimeout.ts`
Races a promise against a timeout. Throws `DOMException("TimeoutError")` on expiry.
- `withTimeout<T>(promise, ms, onTimeout?)` → `Promise<T>`
- **Wrap every upstream/LLM call in withTimeout** — see canonical pattern below.

### `supabaseClient.ts`
Singleton Supabase client from env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- `supabase` — exported client instance

### `requireDevice.ts`
Device auth middleware. Reads `x-device-id` / `x-device-token` headers, validates against `device_tokens`.
- `softRequireDevice(req)` — never throws, returns `{ valid, deviceId, deviceToken, reason? }`
- `hardRequireDevice(req)` — throws `errResp` on failure, returns `{ deviceId }` on success
- **Updates `device_tokens.last_seen = now()` on every successful auth** (both variants)

### `checkLimits.ts`
Sliding-window rate limiting via `enforce_rate_limit` DB function.
- `checkMinuteLimit(deviceId, requestId, limit?)` → `Response | null`
  - Returns `null` if allowed, `errResp(429)` if rate-limited
  - Default: 10 req/min
  - **Always pass an explicit limit for AI/LLM calls** — the default is not appropriate for expensive operations. Use 3–5 for Claude/GPT calls.

### `registerDevice.ts`
Generic device registration handler. Upserts into `devices` + `device_tokens`, guarded by `REGISTER_SECRET`.
- `handleRegisterDevice(req)` → `Response`

---

## Entry Point

`mod.ts` re-exports everything. Import the whole package via a single alias.

---

## Database Migrations

Run once per Supabase project **before** app-level migrations.

### `20250417000001_rate_limit.sql`
- `rate_limit_events(id, device_id, request_id, created_at)` + index on `(device_id, created_at)`
- `enforce_rate_limit(_device_id, _limit, _window_seconds, _request_id)` → `boolean`
  - Uses advisory lock per device to prevent race conditions
  - Returns `true` = allowed, `false` = rate-limited
- RLS policies: service_role full access

### `20250417000002_devices.sql`
```sql
devices (
  device_id   text primary key,   -- client-generated UUID
  platform    text,               -- ios | mac | android | web
  app_version text,
  os_version  text,
  locale      text,               -- e.g. en-CA, ja-JP
  created_at  timestamptz default now()
)
```

### `20250417000003_device_tokens.sql`
```sql
device_tokens (
  device_id   text primary key references devices(device_id) on delete cascade,
  token       text not null,
  status      text not null default 'active',   -- active | blocked
  created_at  timestamptz default now(),
  last_seen   timestamptz   -- updated on every successful auth
)
```

---

## App-Level Patterns (not in edge-kit, documented here for consuming apps)

### register-device

edge-kit provides `handleRegisterDevice` — each app just wires it into a `Deno.serve` entry point:

```ts
import { handleRegisterDevice, corsHeaders } from "edge-kit";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return handleRegisterDevice(req);
});
```

This endpoint runs **before** `hardRequireDevice` exists — no `deviceId` yet, so `checkMinuteLimit` cannot protect it. The `REGISTER_SECRET` guard is the only protection.

> **Security note:** The client (e.g. React Native) must send this secret as a header, which means it lives in the app bundle. This raises the bar against casual abuse but is **not a cryptographic guarantee** — a determined attacker can extract it from the binary. Rotate if leaked, monitor registration volume.

### Linking a profile (optional, app-level migration)
```sql
-- In the app's own migration — run after edge-kit migrations:
alter table devices add column profile_id uuid references profiles(id);
```

---

## Consuming a Project

### 1. Add to `deno.json`

Pin to a specific commit hash — never use `main` (it can change and break deployed functions):
```json
{
  "imports": {
    "edge-kit": "https://raw.githubusercontent.com/<your-org>/edge-kit/<commit-hash>/mod.ts"
  }
}
```

### 2. Canonical Edge Function Pattern

```ts
import {
  hardRequireDevice,
  checkMinuteLimit,
  okResp,
  errResp,
  genRequestId,
  withTimeout,
  corsHeaders,
} from "edge-kit";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = genRequestId();

  try {
    const { deviceId } = await hardRequireDevice(req);

    // Always pass explicit limit — lower for expensive AI/LLM calls
    const limited = await checkMinuteLimit(deviceId, requestId, 5);
    if (limited) return limited;

    // Wrap every upstream/LLM call in withTimeout
    const response = await withTimeout(
      fetch(upstreamUrl, options),
      10_000,
      () => console.error("[timeout]", requestId)
    );

    // Business logic...

    return okResp({ result }, requestId, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    return errResp("INTERNAL_ERROR", "Unexpected error", 500, requestId, corsHeaders);
  }
});
```

---

## Data Model

```
devices           ← anonymous, client-generated UUID, device characteristics only
  ↓ FK
device_tokens     ← auth: token + status + last_seen (updated on every auth)

profile*          ← app-level, optional FK → devices
rate_limit_events ← append-only log, drives enforce_rate_limit fn

* defined per-app, not in edge-kit
```

---

## What edge-kit Does NOT Include
- `prompt.ts` — app-specific AI prompt management
- Pricing, model selection, usage logging — app-specific business logic
- User/profile/registration table — app-level concern
- JSR publish config — not needed yet
- Tests — not needed yet
