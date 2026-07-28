import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit"
import {
  isUnauthorizedError,
  SESSION_EXPIRED_MESSAGE,
} from "@/utils/authApiError"
import { resolveHydratedSession } from "@/utils/authHydrate"
import { getMyProfile, requestOtp, saveUsername, updateProfile, verifyOtp } from "@/utils/chatApi"
import { SESSION_STORAGE_KEY } from "@/utils/chatConfig"
import type { RootState } from "@/store"

export type AuthSession = {
  /** Stable account id from the backend (Mongo ObjectId). Not a chat handle. */
  userId: string
  token: string
  email: string
  /** Chat/WS identity. Null until username setup completes. */
  username: string | null
  needsUsernameSetup: boolean
  avatar_data_url?: string | null
}

/** Stable account id — do not use for WS/chat peer identity. */
export function resolveAccountUserId(session: AuthSession | null | undefined): string {
  return session?.userId?.trim() || ""
}

/** Chat/WS identity — username only. Empty until setup is complete. */
export function resolveChatUsername(session: AuthSession | null | undefined): string {
  return session?.username?.trim() || ""
}

/** @deprecated Use resolveChatUsername — kept for older call sites during the split. */
export function resolveChatUserId(session: AuthSession | null | undefined): string {
  return resolveChatUsername(session)
}

export function resolveDisplayName(session: AuthSession | null | undefined): string {
  return session?.username?.trim() || session?.email?.trim() || ""
}

function isMongoObjectId(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value.trim())
}

function normalizeAuthSession(raw: AuthSession): AuthSession | null {
  const token = raw.token?.trim()
  const email = raw.email?.trim().toLowerCase()
  if (!token || !email) {
    return null
  }

  let username = raw.username?.trim() || null
  let userId = raw.userId?.trim() || ""

  // Legacy: userId was the username before stable account ids existed.
  if (!username && userId && !isMongoObjectId(userId)) {
    username = userId
  }

  if (username && userId === username && !isMongoObjectId(userId)) {
    userId = email
  }

  if (!userId) {
    userId = email
  }

  return {
    ...raw,
    token,
    email,
    userId,
    username,
    needsUsernameSetup: !username,
  }
}

type AuthState = {
  authSession: AuthSession | null
  emailInput: string
  otpInput: string
  otpEmail: string | null
  devOtpHint: string | null
  authLoading: boolean
  authError: string | null
  usernameInput: string
  usernameLoading: boolean
  usernameError: string | null
  profileLoading: boolean
  profileError: string | null
  hydrationComplete: boolean
}

const initialState: AuthState = {
  authSession: null,
  emailInput: "",
  otpInput: "",
  otpEmail: null,
  devOtpHint: null,
  authLoading: false,
  authError: null,
  usernameInput: "",
  usernameLoading: false,
  usernameError: null,
  profileLoading: false,
  profileError: null,
  hydrationComplete: false,
}

function parsePersistedSession(raw: string | null): AuthSession | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession
    return normalizeAuthSession(parsed)
  } catch {
    return null
  }
}

function persistSession(session: AuthSession) {
  if (typeof window === "undefined") {
    return
  }

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

function clearPersistedSession() {
  if (typeof window === "undefined") {
    return
  }

  localStorage.removeItem(SESSION_STORAGE_KEY)
}

export const hydrateAuthSession = createAsyncThunk<AuthSession | null>(
  "auth/hydrateAuthSession",
  async () => {
    if (typeof window === "undefined") {
      return null
    }

    const parsed = parsePersistedSession(localStorage.getItem(SESSION_STORAGE_KEY))
    if (!parsed) {
      clearPersistedSession()
      return null
    }

    const result = await resolveHydratedSession(parsed, getMyProfile)
    if (result.status === "unauthorized") {
      clearPersistedSession()
      return null
    }

    persistSession(result.session)
    return result.session
  },
)

export const sendOtpRequest = createAsyncThunk<
  { email: string, otpHint: string | null },
  string,
  { rejectValue: string }
>("auth/sendOtpRequest", async (email, { rejectWithValue }) => {
  try {
    const result = await requestOtp(email)
    return { email, otpHint: result.otp ?? null }
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "OTP send error")
  }
})

export const verifyOtpRequest = createAsyncThunk<
  AuthSession,
  { email: string, otp: string },
  { rejectValue: string }
>("auth/verifyOtpRequest", async ({ email, otp }, { rejectWithValue }) => {
  try {
    const result = await verifyOtp(email, otp)
    // Auth can succeed without username (and without user_id on older backends).
    // Chat is gated later via needsUsernameSetup.
    if (!result.valid || !result.token || !result.email) {
      return rejectWithValue("OTP is invalid or expired.")
    }

    const session = normalizeAuthSession({
      token: result.token,
      userId: result.user_id?.trim() || result.email.trim().toLowerCase(),
      email: result.email,
      username: result.username ?? null,
      needsUsernameSetup: !result.username?.trim(),
    })

    if (!session) {
      return rejectWithValue("OTP is invalid or expired.")
    }

    persistSession(session)
    return session
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "OTP verification error")
  }
})

export const saveUsernameRequest = createAsyncThunk<
  AuthSession,
  string,
  { state: RootState, rejectValue: string }
>("auth/saveUsernameRequest", async (username, { getState, rejectWithValue }) => {
  const currentSession = getState().auth.authSession
  if (!currentSession) {
    return rejectWithValue("Not authenticated")
  }

  try {
    const result = await saveUsername(currentSession.token, username)
    const nextSession: AuthSession = {
      ...currentSession,
      username: result.username,
      needsUsernameSetup: false,
    }

    persistSession(nextSession)
    return nextSession
  } catch (err) {
    if (isUnauthorizedError(err)) {
      clearPersistedSession()
      return rejectWithValue(SESSION_EXPIRED_MESSAGE)
    }
    return rejectWithValue(err instanceof Error ? err.message : "Username setup error")
  }
})

export const updateProfileRequest = createAsyncThunk<
  AuthSession,
  string | null,
  { state: RootState, rejectValue: string }
>("auth/updateProfileRequest", async (avatarDataUrl, { getState, rejectWithValue }) => {
  const currentSession = getState().auth.authSession
  if (!currentSession) {
    return rejectWithValue("Not authenticated")
  }

  try {
    const payload: { avatar_data_url?: string } = {}
    if (avatarDataUrl !== null) {
      payload.avatar_data_url = avatarDataUrl
    }

    const result = await updateProfile(currentSession.token, payload)
    const nextSession: AuthSession = {
      ...currentSession,
      avatar_data_url: result.avatar_data_url ?? null,
    }

    persistSession(nextSession)
    return nextSession
  } catch (err) {
    if (isUnauthorizedError(err)) {
      clearPersistedSession()
      return rejectWithValue(SESSION_EXPIRED_MESSAGE)
    }
    return rejectWithValue(err instanceof Error ? err.message : "Failed to update profile")
  }
})

function clearSessionOnUnauthorized(
  state: AuthState,
  payload: string | undefined,
): boolean {
  if (payload !== SESSION_EXPIRED_MESSAGE) {
    return false
  }
  state.authSession = null
  state.authError = payload
  return true
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setEmailInput(state, action: PayloadAction<string>) {
      state.emailInput = action.payload
    },
    setOtpInput(state, action: PayloadAction<string>) {
      state.otpInput = action.payload
    },
    setUsernameInput(state, action: PayloadAction<string>) {
      state.usernameInput = action.payload
    },
    setAuthError(state, action: PayloadAction<string | null>) {
      state.authError = action.payload
    },
    setUsernameError(state, action: PayloadAction<string | null>) {
      state.usernameError = action.payload
    },
    clearAuthState() {
      clearPersistedSession()
      return {
        ...initialState,
        hydrationComplete: true,
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateAuthSession.fulfilled, (state, action) => {
        state.authSession = action.payload
        state.hydrationComplete = true
      })
      .addCase(hydrateAuthSession.rejected, (state) => {
        state.authSession = null
        state.hydrationComplete = true
      })
      .addCase(sendOtpRequest.pending, (state) => {
        state.authLoading = true
        state.authError = null
      })
      .addCase(sendOtpRequest.fulfilled, (state, action) => {
        state.authLoading = false
        state.otpEmail = action.payload.email
        state.devOtpHint = action.payload.otpHint
        state.otpInput = ""
      })
      .addCase(sendOtpRequest.rejected, (state, action) => {
        state.authLoading = false
        state.authError = action.payload ?? "OTP send error"
      })
      .addCase(verifyOtpRequest.pending, (state) => {
        state.authLoading = true
        state.authError = null
      })
      .addCase(verifyOtpRequest.fulfilled, (state, action) => {
        state.authLoading = false
        state.authSession = action.payload
        state.authError = null
        state.usernameInput = ""
        state.usernameError = null
      })
      .addCase(verifyOtpRequest.rejected, (state, action) => {
        state.authLoading = false
        state.authError = action.payload ?? "OTP verification error"
      })
      .addCase(saveUsernameRequest.pending, (state) => {
        state.usernameLoading = true
        state.usernameError = null
      })
      .addCase(saveUsernameRequest.fulfilled, (state, action) => {
        state.usernameLoading = false
        state.authSession = action.payload
        state.usernameInput = ""
      })
      .addCase(saveUsernameRequest.rejected, (state, action) => {
        state.usernameLoading = false
        if (clearSessionOnUnauthorized(state, action.payload)) {
          state.usernameError = action.payload ?? SESSION_EXPIRED_MESSAGE
          return
        }
        state.usernameError = action.payload ?? "Username setup error"
      })
      .addCase(updateProfileRequest.pending, (state) => {
        state.profileLoading = true
        state.profileError = null
      })
      .addCase(updateProfileRequest.fulfilled, (state, action) => {
        state.profileLoading = false
        state.authSession = action.payload
      })
      .addCase(updateProfileRequest.rejected, (state, action) => {
        state.profileLoading = false
        if (clearSessionOnUnauthorized(state, action.payload)) {
          state.profileError = action.payload ?? SESSION_EXPIRED_MESSAGE
          return
        }
        state.profileError = action.payload ?? "Failed to update profile"
      })
  },
})

export const {
  setEmailInput,
  setOtpInput,
  setUsernameInput,
  setAuthError,
  setUsernameError,
  clearAuthState,
} = authSlice.actions

export default authSlice.reducer
