export type HydrateProfile = {
  username: string
  email: string
  avatar_data_url?: string | null
}

export type HydrateSessionInput = {
  userId: string
  token: string
  email: string
  username: string | null
  needsUsernameSetup: boolean
  avatar_data_url?: string | null
}

export type HydrateResult =
  | { status: "ok"; session: HydrateSessionInput }
  | { status: "unauthorized" }
  | { status: "offline"; session: HydrateSessionInput }

/**
 * Validate a persisted session against the server.
 * - 401 → unauthorized (caller must clear storage)
 * - other errors (network) → keep local session so refresh still works offline
 */
export async function resolveHydratedSession(
  session: HydrateSessionInput,
  validateProfile: (token: string) => Promise<HydrateProfile>,
): Promise<HydrateResult> {
  try {
    const profile = await validateProfile(session.token)
    const username = profile.username?.trim() || null
    return {
      status: "ok",
      session: {
        ...session,
        email: profile.email.trim().toLowerCase() || session.email,
        username,
        needsUsernameSetup: !username,
        avatar_data_url: profile.avatar_data_url ?? session.avatar_data_url ?? null,
      },
    }
  } catch (err) {
    if (
      err
      && typeof err === "object"
      && "status" in err
      && Number((err as { status: unknown }).status) === 401
    ) {
      return { status: "unauthorized" }
    }

    return { status: "offline", session }
  }
}
