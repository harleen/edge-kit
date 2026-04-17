import { supabase } from "./supabaseClient.ts";
import { errResp, ErrorCodes, genRequestId } from "./errors.ts";

/** Soft check: never throws. Returns validity + context so callers can branch/log. */
export async function softRequireDevice(req: Request) {
  const deviceId = (req.headers.get("x-device-id") || "").trim() || null;
  const deviceToken = (req.headers.get("x-device-token") || "").trim() || null;

  if (!deviceId || !deviceToken) {
    return { valid: false as const, deviceId: null, deviceToken: null, reason: "missing_headers" as const };
  }

  const { data, error } = await supabase
    .from("device_tokens")
    .select("token,status")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    return { valid: false as const, deviceId, deviceToken, reason: "db_error" as const, error };
  }
  if (!data) {
    return { valid: false as const, deviceId, deviceToken, reason: "not_registered" as const };
  }
  if (data.status && data.status !== "active") {
    return { valid: false as const, deviceId, deviceToken, reason: `status_${data.status}` as const };
  }
  if (data.token !== deviceToken) {
    return { valid: false as const, deviceId, deviceToken, reason: "token_mismatch" as const };
  }

  await supabase
    .from("device_tokens")
    .update({ last_seen: new Date().toISOString() })
    .eq("device_id", deviceId);

  return { valid: true as const, deviceId, deviceToken };
}

/** Hard check: throws errResp on failure; caller can `return err` directly. */
export async function hardRequireDevice(req: Request): Promise<{ deviceId: string }> {
  const requestId = genRequestId();
  const deviceId = (req.headers.get("x-device-id") || "").trim();
  const deviceToken = (req.headers.get("x-device-token") || "").trim();

  if (!deviceId || !deviceToken) {
    throw errResp(ErrorCodes.AUTH_ERROR, "Missing device identity", 401, requestId);
  }

  const { data, error } = await supabase
    .from("device_tokens")
    .select("token,status")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    throw errResp(ErrorCodes.DB_ERROR, "Device lookup failed", 500, requestId);
  }
  if (!data) {
    throw errResp(ErrorCodes.AUTH_ERROR, "Device not registered", 401, requestId);
  }
  if (data.status && data.status !== "active") {
    throw errResp(ErrorCodes.AUTH_ERROR, `Device status: ${data.status}`, 401, requestId);
  }
  if (data.token !== deviceToken) {
    throw errResp(ErrorCodes.AUTH_ERROR, "Invalid device identity", 401, requestId);
  }

  await supabase
    .from("device_tokens")
    .update({ last_seen: new Date().toISOString() })
    .eq("device_id", deviceId);

  return { deviceId };
}
