import { supabase } from './supabaseClient.ts'
import { okResp, errResp, genRequestId, ErrorCodes } from './errors.ts'
import { corsHeaders } from './cors.ts'

export async function handleRegisterDevice(req: Request): Promise<Response> {
  const requestId = genRequestId()

  const secret = Deno.env.get('REGISTER_SECRET')
  if (req.headers.get('x-register-secret') !== secret) {
    return errResp(ErrorCodes.AUTH_ERROR, 'Unauthorized', 401, requestId, corsHeaders)
  }

  let body: {
    deviceId: string
    token: string
    platform?: string
    appVersion?: string
    osVersion?: string
    locale?: string
  }

  try {
    body = await req.json()
  } catch {
    return errResp(ErrorCodes.BAD_JSON, 'Invalid JSON body', 400, requestId, corsHeaders)
  }

  const { deviceId, token, platform, appVersion, osVersion, locale } = body

  if (!deviceId || !token) {
    return errResp(ErrorCodes.VALIDATION_ERROR, 'deviceId and token are required', 400, requestId, corsHeaders)
  }

  const { error: deviceError } = await supabase.from('devices').upsert({
    device_id: deviceId,
    platform: platform ?? null,
    app_version: appVersion ?? null,
    os_version: osVersion ?? null,
    locale: locale ?? null,
  })

  if (deviceError) {
    console.error('[register-device] devices upsert failed', { deviceId, requestId, deviceError })
    return errResp(ErrorCodes.DB_ERROR, 'Registration failed', 500, requestId, corsHeaders)
  }

  const { error: tokenError } = await supabase.from('device_tokens').upsert({
    device_id: deviceId,
    token,
    status: 'active',
  })

  if (tokenError) {
    console.error('[register-device] device_tokens upsert failed', { deviceId, requestId, tokenError })
    return errResp(ErrorCodes.DB_ERROR, 'Registration failed', 500, requestId, corsHeaders)
  }

  return okResp({ token }, requestId, 200, corsHeaders)
}
