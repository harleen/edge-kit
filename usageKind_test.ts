import { assertEquals } from "jsr:@std/assert@1";
import { isUsageKind } from "./usageKind.ts";

Deno.test("fixed kinds are allowed", () => {
  assertEquals(isUsageKind("open"), true);
  assertEquals(isUsageKind("event_added"), true);
  assertEquals(isUsageKind("ai:upload"), true);
});

Deno.test("anything that could carry free text is refused", () => {
  assertEquals(isUsageKind(""), false);
  assertEquals(isUsageKind("Open"), false);
  assertEquals(isUsageKind("ai:"), false);
  assertEquals(isUsageKind("ai:upload:extra"), false);
  assertEquals(isUsageKind("dentist friday"), false);
  assertEquals(isUsageKind("open\n"), false);
});
