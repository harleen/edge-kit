// A usage kind is a fixed name from code ('open', 'ai:upload'), never built
// from user input, so no free text can reach usage_daily
const KIND = /^[a-z_]+(:[a-z_]+)?$/;

export function isUsageKind(kind: string): boolean {
  return KIND.test(kind);
}
