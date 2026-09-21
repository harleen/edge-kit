import { supabase } from "./supabaseClient.ts";
import { okResp, errResp, genRequestId, ErrorCodes } from "./errors.ts";
import { corsHeaders } from "./cors.ts";
import { hardRequireDevice } from "./requireDevice.ts";
import { sanitizeDeviceFields } from "./deviceFields.ts";

/**
 * Updates an already-registered device with fresh data from the app (timezone,
 * push token and permission, versions, ...) and stamps last_opened_at.
 *
 * - The device is identified by the verified x-device-id / x-device-token
 *   headers, never by the request body, so a device can only touch its own row.
 * - Only allowlisted fields are written (see deviceFields.ts). Unknown fields
 *   are ignored and logged; allowlisted fields with bad values are a 400.
 * - It never touches device_tokens (status, token), so it can't un-block a
 *   device. A blocked device is rejected by hardRequireDevice.
 * - registerDevice.ts stays first-registration only.
 */
export async function handleSyncDevice(req: Request): Promise<Response> {
  const requestId = genRequestId();

  if (req.method !== "POST") {
    return errResp(ErrorCodes.METHOD_NOT_ALLOWED, "POST only", 405, requestId, corsHeaders);
  }

  let deviceId: string;
  try {
    ({ deviceId } = await hardRequireDevice(req));
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errResp(ErrorCodes.BAD_JSON, "Invalid JSON body", 400, requestId, corsHeaders);
  }

  const now = new Date().toISOString();
  const { update, ignored, invalid } = sanitizeDeviceFields(body, now);

  if (ignored.length > 0) {
    console.warn("[sync-device] ignored non-allowlisted fields", { deviceId, ignored, requestId });
  }
  if (invalid.length > 0) {
    return errResp(
      ErrorCodes.VALIDATION_ERROR,
      `Invalid value for: ${invalid.join(", ")}`,
      400,
      requestId,
      corsHeaders,
    );
  }

  const { error } = await supabase
    .from("devices")
    .update({ ...update, last_opened_at: now })
    .eq("device_id", deviceId);

  if (error) {
    console.error("[sync-device] update failed", { deviceId, requestId, error });
    return errResp(ErrorCodes.DB_ERROR, "Sync failed", 500, requestId, corsHeaders);
  }

  // One phone can end up with two device rows (a reinstall registers a new
  // id). An Expo token belongs to one row only, or the phone would get every
  // push twice: clear it from any other device that still holds it.
  const token = update["expo_push_token"];
  if (typeof token === "string") {
    const { error: dedupeError } = await supabase
      .from("devices")
      .update({ expo_push_token: null, notifications_enabled: false })
      .eq("expo_push_token", token)
      .neq("device_id", deviceId);
    if (dedupeError) {
      console.warn("[sync-device] token de-duplication failed", { deviceId, requestId, dedupeError });
    }
  }

  return okResp({ synced: Object.keys(update), ignored }, requestId, 200, corsHeaders);
}
