import { isValidTimezone, sanitizeDeviceFields } from "./deviceFields.ts";

const NOW = "2026-09-21T18:00:00.000Z";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}

Deno.test("allowlisted fields map to columns", () => {
  const { update, ignored, invalid } = sanitizeDeviceFields({
    platform: "ios", appVersion: "1.0.0", osVersion: "18.2", locale: "en-US",
    timezone: "Australia/Sydney", pushPermission: "granted", notificationsEnabled: true,
    expoPushToken: "ExponentPushToken[abc123]",
  }, NOW);
  eq(update, {
    platform: "ios", app_version: "1.0.0", os_version: "18.2", locale: "en-US",
    timezone: "Australia/Sydney", push_permission: "granted", notifications_enabled: true,
    expo_push_token: "ExponentPushToken[abc123]", push_token_updated_at: NOW,
  }, "update");
  eq(ignored, [], "ignored");
  eq(invalid, [], "invalid");
});

Deno.test("forbidden fields are ignored and never written", () => {
  const { update, ignored } = sanitizeDeviceFields({
    status: "active", device_id: "someone-else", deviceId: "someone-else", token: "x",
    created_at: "2020-01-01", last_opened_at: "2020-01-01", last_seen: "2020-01-01",
    timezone: "Europe/London",
  }, NOW);
  eq(update, { timezone: "Europe/London" }, "only the allowed field survives");
  eq(ignored.sort(), ["created_at", "deviceId", "device_id", "last_opened_at", "last_seen", "status", "token"], "ignored");
});

Deno.test("bad values for allowed fields are reported, not written", () => {
  const { update, invalid } = sanitizeDeviceFields({
    platform: "windows", timezone: "Mars/Olympus", pushPermission: "maybe",
    notificationsEnabled: "yes", expoPushToken: "not-a-token", locale: "",
  }, NOW);
  eq(update, {}, "nothing written");
  eq(invalid.sort(), ["expoPushToken", "locale", "notificationsEnabled", "platform", "pushPermission", "timezone"], "invalid");
});

Deno.test("token timestamp only when a token is sent", () => {
  const { update } = sanitizeDeviceFields({ timezone: "Asia/Kolkata" }, NOW);
  assert(!("push_token_updated_at" in update), "no token, no timestamp");
});

Deno.test("non-object bodies produce an empty update", () => {
  for (const body of [null, undefined, "x", 5, []]) {
    eq(sanitizeDeviceFields(body, NOW).update, {}, `body ${JSON.stringify(body)}`);
  }
});

Deno.test("timezone validation", () => {
  assert(isValidTimezone("America/Los_Angeles"), "LA");
  assert(isValidTimezone("Asia/Kolkata"), "Kolkata");
  assert(!isValidTimezone("Not/AZone"), "bogus");
  assert(!isValidTimezone(""), "empty");
  assert(!isValidTimezone(42), "number");
});
