// File: supabase/functions/shared/checkLimits.ts
import { supabase } from "./supabaseClient.ts";
import { ErrorCodes, errResp } from "./errors.ts";

// rate_limit_events rows are only ever read within a 60s window, but nothing
// deletes old ones — left unchecked the table grows forever. Opportunistically
// prune it on a small fraction of calls rather than adding a per-project
// pg_cron job; runs after the response via EdgeRuntime.waitUntil so it never
// adds latency to the request that triggered it.
const CLEANUP_CHANCE          = 0.05;
const CLEANUP_MAX_AGE_MINUTES = 10;

async function cleanupOldRateLimitEvents() {
  try {
    const cutoff = new Date(Date.now() - CLEANUP_MAX_AGE_MINUTES * 60_000).toISOString();
    const { error } = await supabase
      .from("rate_limit_events")
      .delete()
      .lt("created_at", cutoff);
    if (error) console.error("[rate-limit] cleanup failed", error);
  } catch (err) {
    console.error("[rate-limit] cleanup threw", err);
  }
}

export async function checkMinuteLimit(
  deviceId: string,
  requestId: string,
  limit = 10,
) {
  const { data, error } = await supabase.rpc("enforce_rate_limit", {
    _device_id: deviceId,
    _limit: limit,
    _window_seconds: 60,
    _request_id: requestId,
  });

  if (Math.random() < CLEANUP_CHANCE) {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil(cleanupOldRateLimitEvents());
  }

  if (error) {
    console.error("[rate-limit] check failed", { deviceId, requestId, error });
    // allow request to continue
    return null;
  }

  if (!data) {
    return errResp(ErrorCodes.RATE_LIMITED, "Too many requests", 429, requestId);
  }
  return null; // allowed
}
