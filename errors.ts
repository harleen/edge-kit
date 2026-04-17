// _shared/errors.ts

// Common JSON headers
const JSON_HEADERS = { "Content-Type": "application/json" };

// ---------------- error codes ----------------
export const ErrorCodes = {
    // Input / validation
    METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
    BAD_JSON: "BAD_JSON",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",

    // Prompt service
    PROMPT_NOT_FOUND: "PROMPT_NOT_FOUND",
    PROMPT_FETCH_FAILED: "PROMPT_FETCH_FAILED",

    // Upstream / external services
    SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
    UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT",
    DB_ERROR: "DB_ERROR",
    AUTH_ERROR: "AUTH_ERROR",
    UPSTREAM_ERROR: "UPSTREAM_ERROR",
    PARSING_ERROR: "PARSING_ERROR",

    //THROTTLE
    RATE_LIMITED: "RATE_LIMITED",
    TOKEN_LIMIT: "TOKEN_LIMIT",

    // Internal
    INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

// Strong typing for safety
export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
  };
}

export function genRequestId(): string {
  return crypto.randomUUID();
}

export function okResp(
    data: unknown,
    requestId: string,
    status = 200,
    headers: Record<string, string> = {}
) {
    return new Response(JSON.stringify({ data, requestId }), {
      status,
      headers: { ...JSON_HEADERS, "X-Request-Id": requestId, ...headers },
    });
}

export function errResp(
  code: ErrorCode,
  message: string,
  status: number,
  requestId: string,
  extraHeaders: Record<string, string> = {}
): Response {
  const body: ErrorBody = { error: { code, message, requestId } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, "X-Request-Id": requestId, ...extraHeaders },
  });
}

export function upstreamErr(status: number, requestId: string, retryAfter?: string): Response {
  const headers: Record<string, string> = { "X-Request-Id": requestId };
  if (status === 429 || (status >= 500 && status < 600)) {
    headers["Retry-After"] = retryAfter ?? "10";
  }
  return errResp(
    ErrorCodes.SERVICE_UNAVAILABLE,
    "Upstream AI service error",
    status,
    requestId,
    headers
  );
}

export function addReqId(headers: Record<string, string>, requestId: string): Record<string, string> {
  return { ...headers, "X-Request-Id": requestId };
}
