import { useEffect, useState } from "react"
import { requestOtp, saveUsername, updateProfile, verifyOtp } from "@/lib/chat/authApi"
import { SESSION_STORAGE_KEY } from "@/lib/chat/constants"

export type AuthSession = {
  token: string
  userId: string
  email: string
  username: string | null
  needsUsernameSetup: boolean
  avatar_data_url?: string | null
}

export function useAuthFlow() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [emailInput, setEmailInput] = useState("")
  const [otpInput, setOtpInput] = useState("")
  const [otpEmail, setOtpEmail] = useState<string | null>(null)
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [usernameInput, setUsernameInput] = useState("")
  const [usernameLoading, setUsernameLoading] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) {
      return
    }

    try {
      const parsed = JSON.parse(raw) as AuthSession
      if (parsed.token && parsed.userId && parsed.email) {
        setAuthSession(parsed)
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY)
      }
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  }, [])

  const userId = authSession?.userId || ""
  const token = authSession?.token || ""
  const displayName = authSession?.username || authSession?.userId || ""

  useEffect(() => {
    if (displayName) {
      document.title = `Chat - ${displayName}`
    } else {
      document.title = "Chat Login"
    }
  }, [displayName])

  const onSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = emailInput.trim().toLowerCase()

    if (!email) {
      setAuthError("Email is required.")
      return
    }

    setAuthLoading(true)
    setAuthError(null)

    try {
      const result = await requestOtp(email)
      setOtpEmail(email)
      setDevOtpHint(result.otp)
      setOtpInput("")
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "OTP send error")
    } finally {
      setAuthLoading(false)
    }
  }

  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpEmail) {
      setAuthError("Request OTP with email first.")
      return
    }

    const otp = otpInput.trim()
    if (!otp) {
      setAuthError("Enter the OTP code.")
      return
    }

    setAuthLoading(true)
    setAuthError(null)

    try {
      const result = await verifyOtp(otpEmail, otp)
      if (!result.valid || !result.token || !result.user_id || !result.email) {
        setAuthError("OTP is invalid or expired.")
        return
      }

      const needsUsernameSetup = !result.username?.trim()

      const session: AuthSession = {
        token: result.token,
        userId: result.user_id,
        email: result.email,
        username: result.username ?? null,
        needsUsernameSetup,
      }

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
      setAuthSession(session)
      setAuthError(null)
      setUsernameInput("")
      setUsernameError(null)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "OTP verification error")
    } finally {
      setAuthLoading(false)
    }
  }

  const onSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!authSession) {
      return
    }

    const username = usernameInput.trim()

    if (!username) {
      setUsernameError("Username is required.")
      return
    }

    setUsernameLoading(true)
    setUsernameError(null)

    try {
      const result = await saveUsername(authSession.token, username)
      const nextSession: AuthSession = {
        ...authSession,
        username: result.username,
        needsUsernameSetup: false,
      }

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession))
      setAuthSession(nextSession)
      setUsernameInput("")
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : "Username setup error")
    } finally {
      setUsernameLoading(false)
    }
  }

  const onLogoutAuth = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    setAuthSession(null)
    setEmailInput("")
    setOtpInput("")
    setOtpEmail(null)
    setDevOtpHint(null)
    setUsernameInput("")
    setUsernameError(null)
    setAuthError(null)
    setProfileError(null)
  }

  const onUpdateProfile = async (avatarDataUrl: string | null) => {
    if (!authSession) {
      return
    }

    setProfileLoading(true)
    setProfileError(null)

    try {
      const payload: { avatar_data_url?: string } = {}
      if (avatarDataUrl !== null) {
        payload.avatar_data_url = avatarDataUrl
      }

      const result = await updateProfile(authSession.token, payload)
      const nextSession: AuthSession = {
        ...authSession,
        avatar_data_url: result.avatar_data_url ?? null,
      }

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession))
      setAuthSession(nextSession)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setProfileLoading(false)
    }
  }

  return {
    authSession,
    userId,
    token,
    displayName,
    emailInput,
    otpInput,
    otpEmail,
    devOtpHint,
    authLoading,
    authError,
    usernameInput,
    usernameLoading,
    usernameError,
    profileLoading,
    profileError,
    setEmailInput,
    setOtpInput,
    setUsernameInput,
    onSendOtp,
    onVerifyOtp,
    onSaveUsername,
    onLogoutAuth,
    onUpdateProfile,
  }
}
