# Usage counts

Counts of what an app did for a device, per day: opens, AI calls, the app's
own actions. Never what anyone wrote, said or photographed. Enough to see who
came back and which features people use, alongside the store consoles'
install numbers.

## What's counted, and what never is

- **Counted:** that something happened, how many times, on which UTC day, for
  which device ID (the random one `register-device` creates).
- **Kinds** are fixed names from code: `open`, `ai:<feature>`, or the app's
  own (`entry_saved`). `countUsage` refuses anything else
  (`^[a-z_]+(:[a-z_]+)?$`), so no user text can reach the table.
- **Never counted:** any text, title, photo, audio, location or detail a
  person typed or sent; times finer than the day; IP addresses.
- **Kept** 13 months per device, then folded into monthly totals with no
  device ID. Delete a device's rows when someone asks for their data to go.

## What's here

- `migrations/20261028000001_usage_counts.sql`:
  - `usage_daily`: one row per device, day and kind, with a count.
  - `usage_monthly`: totals per month and kind, no device.
  - `count_usage(device, kind)`: adds one, safely when calls land at once.
  - `roll_up_usage()`: folds months over 13 months old into the totals; a
    `pg_cron` job runs it on the first of each month.
  - RLS on with no policies, and both functions revoked from the public
    roles: only edge functions (service role) can count or read.
- `countUsage(deviceId, kind)`: counts after the response
  (`EdgeRuntime.waitUntil`); never throws or fails the request.
- `isUsageKind(kind)`: the kind check, with its test.

No foreign key to `devices`, so an app with its own device table can use it
unchanged.

## Adopting it

1. **Disclosures first.** Counting starts when the server deploys, not with
   an app release. Before that: "App interactions" in Google Play's Data
   safety (App activity), "Product Interaction" on Apple's privacy label
   (Usage Data, for analytics, not tracking), and a line in the privacy
   policy: counts of what the app was used for, never the content.
2. Copy the migration into `supabase/migrations/` and apply it
   (`INTEGRATING.md`, step 3).
3. Count:
   ```ts
   import { countUsage } from "edge-kit";
   countUsage(deviceId, "open");          // in the call the app makes at launch
   countUsage(deviceId, "ai:transcribe"); // after a successful AI call
   ```
   Count from the function that does the work, never from a number the app
   reports about itself.
4. Make sure the first open is counted: the app's launch call has to run on
   a new device's first launch too, straight after registering.

Reports are plain SQL over `usage_daily` and the app's device table: days
used, came back after 1, 7 and 30 days, features per week.
