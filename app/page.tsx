"use client"
import { useCallback } from "react"
import { useAuthFlow } from "@/hooks/useAuthFlow"
import { LoginView } from "@/app/components/layout/LoginView"
import { UsernameSetupView } from "@/app/components/layout/UsernameSetupView"
import { ChatLayout } from "@/app/components/layout/ChatLayout"

export default function ChatPage() {
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
    setEmailInput,
    setOtpInput,
    setUsernameInput,
    onSendOtp,
    onVerifyOtp,
    onSaveUsername,
    onLogoutAuth,
  } = useAuthFlow()

  const onLogout = useCallback(() => {
    onLogoutAuth()
  }, [onLogoutAuth])

  if (!authSession) {
    return (
      <LoginView
        emailInput={emailInput}
        otpInput={otpInput}
        otpEmail={otpEmail}
        authLoading={authLoading}
        devOtpHint={devOtpHint}
        authError={authError}
        onEmailChange={setEmailInput}
        onOtpChange={setOtpInput}
        onSendOtp={onSendOtp}
        onVerifyOtp={onVerifyOtp}
      />
    )
  }

  if (authSession.needsUsernameSetup) {
    return (
      <UsernameSetupView
        usernameInput={usernameInput}
        usernameLoading={usernameLoading}
        usernameError={usernameError}
        onUsernameChange={setUsernameInput}
        onSaveUsername={onSaveUsername}
        onLogout={onLogout}
      />
    )
  }

  return <ChatLayout />
}