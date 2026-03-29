export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8080/ws"
export const SESSION_STORAGE_KEY = "chat_auth_session"
export const BACKEND_MAX_WS_TEXT_LENGTH = 4000
export const BACKEND_MAX_WS_IMAGE_DATA_URL_LENGTH = 6 * 1024 * 1024

export function resolveMaxWsTextLength() {
  const parsed = Number(process.env.NEXT_PUBLIC_WS_MAX_TEXT_LENGTH)
  if (Number.isFinite(parsed) && parsed >= 512) {
    return Math.min(Math.floor(parsed), BACKEND_MAX_WS_TEXT_LENGTH)
  }

  return BACKEND_MAX_WS_TEXT_LENGTH
}
