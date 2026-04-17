// File: supabase/functions/shared/checkLimits.ts
import { supabase } from "./supabaseClient.ts";
import { ErrorCodes, errResp } from "./errors.ts";

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
