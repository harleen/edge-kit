# Integrating edge-kit into a New Project

edge-kit provides shared Deno modules for Supabase Edge Functions. It does not
auto-install — each new project must complete the steps below once, in order.

---

## Step 1 — Create Supabase project

Create a new project at supabase.com. Note:
- Organisation, project name, region
- Database password — save it, you cannot retrieve it later
- Project ref (the subdomain in your project URL, e.g. `abcdefghijklmnop`)

Enable **Data API** and **automatic RLS** during creation.

---

## Step 2 — Link CLI to project

```bash
cd your-project/
supabase login        # opens browser, authenticates your account
supabase link --project-ref <your-project-ref>
```

Confirm with `supabase status` — should show your project URL.

---

## Step 3 — Copy edge-kit migrations and push

Supabase CLI only reads migrations from one project's `supabase/migrations/` folder.
edge-kit migrations must be copied there manually before pushing.

First, clone edge-kit locally if you haven't already:

```bash
git clone git@github.com:<your-org>/edge-kit.git <path-to-edge-kit>
```

Then copy and push:

```bash
cp <path-to-edge-kit>/migrations/*.sql supabase/migrations/
supabase db push
```

Edge-kit migrations use timestamp-based filenames (`20250417000001_...`) so they
sort before app-level sequential migrations (`0001_...`, `0002_...`) automatically.

Verify in Supabase dashboard → Table Editor that these tables exist:
- `rate_limit_events`
- `devices`
- `device_tokens`

Then push your app-level migrations (if any) the same way — they run in filename order.

---

## Step 4 — Add deno.json to your functions folder

Create `supabase/functions/<your-function>/deno.json`.

Pin to a specific commit hash — Supabase's bundler fetches this at deploy time.
Never point at `main` (it can change and silently break deployed functions):

```json
{
  "imports": {
    "edge-kit": "https://raw.githubusercontent.com/<your-org>/edge-kit/<commit-hash>/mod.ts"
  }
}
```

Get the current commit hash:
```bash
cd <path-to-edge-kit> && git rev-parse HEAD
```

Add the same `deno.json` to every function folder that imports edge-kit.

---

## Step 5 — Write your Edge Functions

Import from edge-kit:

```typescript
import {
  hardRequireDevice,
  checkMinuteLimit,
  okResp,
  errResp,
  genRequestId,
  withTimeout,
  corsHeaders,
  supabase,
} from "edge-kit";
```

Canonical function pattern:

```typescript
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

    // Wrap every upstream call in withTimeout
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

## Step 6 — Add a register-device function

`hardRequireDevice` will always fail until rows exist in `devices` + `device_tokens`.
edge-kit provides `handleRegisterDevice` — just wire it into a Deno.serve entry point.

Create `supabase/functions/register-device/index.ts`:

```typescript
import { handleRegisterDevice, corsHeaders } from 'edge-kit'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return handleRegisterDevice(req)
})
```

Also add `deno.json` to `supabase/functions/register-device/` with the same
edge-kit import as your other functions.

The function expects:
- Header: `x-register-secret` matching `REGISTER_SECRET` env var
- Body: `{ deviceId, token, platform?, appVersion?, osVersion?, locale? }`

---

## Step 7 — Set secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-...
supabase secrets set REGISTER_SECRET=<generate with: openssl rand -hex 32>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the
Edge Function runtime — do not set these manually.

Store `REGISTER_SECRET` in your password manager. You'll need it in the app bundle
as an env var (`EXPO_PUBLIC_REGISTER_SECRET` for React Native / Expo projects).

---

## Step 8 — Deploy

```bash
supabase functions deploy
```

Test each function via curl or Postman before wiring the app.

---

## Step 9 — App side

On first launch (after onboarding):
1. Generate `deviceId` (UUID) and `token` (UUID)
2. POST to `register-device` with `x-register-secret` header and device info body
3. Store `deviceId` + `token` in SecureStore (`expo-secure-store` for React Native)

On every subsequent Edge Function call:
- Read `deviceId` + `token` from SecureStore
- Send as `x-device-id` / `x-device-token` headers

---

## Checklist

- [ ] Supabase project created, password saved
- [ ] `supabase login` + `supabase link --project-ref <ref>`
- [ ] edge-kit cloned locally
- [ ] edge-kit migrations copied to `supabase/migrations/`
- [ ] `supabase db push` — `rate_limit_events`, `devices`, `device_tokens` tables confirmed
- [ ] App-level migrations pushed
- [ ] `deno.json` added to each function folder (pinned GitHub URL)
- [ ] Edge Functions written using edge-kit imports
- [ ] `register-device` function added (uses `handleRegisterDevice` from edge-kit)
- [ ] `ANTHROPIC_API_KEY` + `REGISTER_SECRET` set via `supabase secrets set`
- [ ] `REGISTER_SECRET` saved to password manager + added to app `.env`
- [ ] `supabase functions deploy` — all functions live
- [ ] App: device registration on first launch, SecureStore, headers on every call
