/** HTTP failure from chat API helpers; carries status for 401 session clearing. */
export class AuthApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "AuthApiError"
    this.status = status
  }
}

export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof AuthApiError && err.status === 401
}

export const SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again."

/** For thunk catch blocks: return session-expired payload, or null. */
export function unauthorizedRejectValue(err: unknown): string | null {
  return isUnauthorizedError(err) ? SESSION_EXPIRED_MESSAGE : null
}

/** WS register failures that mean the JWT is unusable. */
export function isWsAuthError(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  return (
    normalized === "invalid token"
    || normalized === "invalid token claims"
    || normalized === "token cannot be empty"
  )
}
