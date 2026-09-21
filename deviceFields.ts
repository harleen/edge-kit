// Which device fields the app may write, and how they are validated.
// Pure functions (no network) so they can be unit-tested.
//
// Anything not listed here is ignored, never written: status, device_id, the
// secret token and created_at can never be changed from the app, and
// last_opened_at is stamped by the server.

export const PLATFORMS = ["ios", "android"] as const;
export const PUSH_PERMISSIONS = ["granted", "denied", "undetermined"] as const;

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]\s]{1,200}\]$/;

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const shortString = (max: number) => (v: unknown) =>
  typeof v === "string" && v.length > 0 && v.length <= max;

// request field -> column, and how to check the value
const ALLOWED: Record<string, { column: string; valid: (v: unknown) => boolean }> = {
  platform:             { column: "platform",             valid: (v) => (PLATFORMS as readonly unknown[]).includes(v) },
  appVersion:           { column: "app_version",          valid: shortString(32) },
  osVersion:            { column: "os_version",           valid: shortString(32) },
  locale:               { column: "locale",               valid: shortString(35) },
  timezone:             { column: "timezone",             valid: isValidTimezone },
  pushPermission:       { column: "push_permission",      valid: (v) => (PUSH_PERMISSIONS as readonly unknown[]).includes(v) },
  expoPushToken:        { column: "expo_push_token",      valid: (v) => typeof v === "string" && EXPO_TOKEN.test(v) },
  notificationsEnabled: { column: "notifications_enabled", valid: (v) => typeof v === "boolean" },
};

export interface SanitizedDeviceFields {
  /** column -> value, ready for an update. Only allowlisted, valid fields. */
  update: Record<string, unknown>;
  /** Fields that are not on the allowlist (dropped, never written). */
  ignored: string[];
  /** Allowlisted fields whose value failed validation (a client bug). */
  invalid: string[];
}

export function sanitizeDeviceFields(body: unknown, nowIso: string): SanitizedDeviceFields {
  const update: Record<string, unknown> = {};
  const ignored: string[] = [];
  const invalid: string[] = [];

  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  for (const [field, value] of Object.entries(input)) {
    const rule = ALLOWED[field];
    if (!rule) {
      ignored.push(field);
    } else if (!rule.valid(value)) {
      invalid.push(field);
    } else {
      update[rule.column] = value;
    }
  }

  // A token in the payload means it was just read from Expo.
  if ("expo_push_token" in update) update["push_token_updated_at"] = nowIso;

  return { update, ignored, invalid };
}
