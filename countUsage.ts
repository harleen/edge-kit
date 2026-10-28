// Usage counts (USAGE.md): adds one to today's count of `kind` for a
// device. Runs after the response and never fails the request; a lost count
// is logged and dropped.
import { supabase } from "./supabaseClient.ts";
import { isUsageKind } from "./usageKind.ts";

export function countUsage(deviceId: string, kind: string): void {
  if (!deviceId || !isUsageKind(kind)) {
    console.warn("[countUsage] skipped", { kind });
    return;
  }
  const work = (async () => {
    const { error } = await supabase.rpc("count_usage", { _device_id: deviceId, _kind: kind });
    if (error) console.error("[countUsage] failed:", error.message);
  })().catch((err) => console.error("[countUsage] failed:", err));
  // @ts-ignore EdgeRuntime exists on Supabase's edge runtime
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
}
