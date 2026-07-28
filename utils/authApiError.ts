/** HTTP failure from chat API helpers — carries status for 401 session clearing. */
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
