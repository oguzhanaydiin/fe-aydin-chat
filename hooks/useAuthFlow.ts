import { useCallback, useEffect } from "react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import {
  clearAuthState,
  hydrateAuthSession,
  saveUsernameRequest,
  sendOtpRequest,
  setAuthError,
  setEmailInput,
  setOtpInput,
  setUsernameError,
  setUsernameInput,
  updateProfileRequest,
  verifyOtpRequest,
} from "@/store/features/authSlice"

export function useAuthFlow() {
  const dispatch = useAppDispatch()
  const {
    authSession,
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
    hydrationComplete,
  } = useAppSelector((state) => state.auth)

  useEffect(() => {
    if (hydrationComplete) {
      return
    }

    let cancelled = false

    queueMicrotask(() => {
      if (!cancelled) {
        void dispatch(hydrateAuthSession())
      }
    })

    return () => {
      cancelled = true
    }
  }, [dispatch, hydrationComplete])

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
      dispatch(setAuthError("Email is required."))
      return
    }

    await dispatch(sendOtpRequest(email))
  }

  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpEmail) {
      dispatch(setAuthError("Request OTP with email first."))
      return
    }

    const otp = otpInput.trim()
    if (!otp) {
      dispatch(setAuthError("Enter the OTP code."))
      return
    }

    await dispatch(verifyOtpRequest({ email: otpEmail, otp }))
  }

  const onSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!authSession) {
      return
    }

    const username = usernameInput.trim()

    if (!username) {
      dispatch(setUsernameError("Username is required."))
      return
    }

    await dispatch(saveUsernameRequest(username))
  }

  const onLogoutAuth = () => {
    dispatch(clearAuthState())
  }

  const onUpdateProfile = async (avatarDataUrl: string | null) => {
    if (!authSession) {
      return
    }

    await dispatch(updateProfileRequest(avatarDataUrl))
  }

  const onEmailChange = useCallback((value: string) => {
    dispatch(setEmailInput(value))
  }, [dispatch])

  const onOtpChange = useCallback((value: string) => {
    dispatch(setOtpInput(value))
  }, [dispatch])

  const onUsernameChange = useCallback((value: string) => {
    dispatch(setUsernameInput(value))
  }, [dispatch])

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
    setEmailInput: onEmailChange,
    setOtpInput: onOtpChange,
    setUsernameInput: onUsernameChange,
    onSendOtp,
    onVerifyOtp,
    onSaveUsername,
    onLogoutAuth,
    onUpdateProfile,
  }
}
