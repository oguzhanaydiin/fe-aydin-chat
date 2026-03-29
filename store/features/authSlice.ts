import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit"
import { requestOtp, saveUsername, updateProfile, verifyOtp } from "@/utils/chatApi"
import { SESSION_STORAGE_KEY } from "@/utils/chatConfig"
import type { RootState } from "@/store"

export type AuthSession = {
  token: string
  userId: string
  email: string
  username: string | null
  needsUsernameSetup: boolean
  avatar_data_url?: string | null
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
    if (parsed.token && parsed.userId && parsed.email) {
      return parsed
    }
  } catch {
    return null
  }

  return null
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

    return parsed
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
    if (!result.valid || !result.token || !result.user_id || !result.email) {
      return rejectWithValue("OTP is invalid or expired.")
    }

    const needsUsernameSetup = !result.username?.trim()
    const session: AuthSession = {
      token: result.token,
      userId: result.user_id,
      email: result.email,
      username: result.username ?? null,
      needsUsernameSetup,
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
    return rejectWithValue(err instanceof Error ? err.message : "Failed to update profile")
  }
})

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
