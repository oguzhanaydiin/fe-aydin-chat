"use client"
import { useEffect, useState, useRef } from "react"
import { useChatSocket } from "@/hooks/useChatSocket"
import { requestOtp, saveUsername, verifyOtp } from "@/lib/chat/authApi"
import { LoginView } from "@/app/components/chat/LoginView"
import { UsernameSetupView } from "@/app/components/chat/UsernameSetupView"
import { ChatLayout } from "@/app/components/chat/ChatLayout"

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8080/ws"
const SESSION_STORAGE_KEY = "chat_auth_session"

type AuthSession = {
  token: string
  userId: string
  email: string
  username: string | null
  needsUsernameSetup: boolean
}

export default function ChatPage() {
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

  const [targetUser, setTargetUser] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const { onlineUsers, messagesByPeer, sendMessage: sendChatMessage, sendImageMessage, clearChat } = useChatSocket({
    userId,
    token,
    wsUrl: WS_URL,
  })

  const fileToDataUrl = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === "string") {
          resolve(result)
          return
        }

        reject(new Error("Invalid file data"))
      }
      reader.onerror = () => {
        reject(reader.error ?? new Error("Failed to read file"))
      }
      reader.readAsDataURL(file)
    })
  }

  const loadImageFromDataUrl = (dataUrl: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error("Failed to load image"))
      image.src = dataUrl
    })
  }

  const optimizeImageForMessage = async (file: File) => {
    const sourceDataUrl = await fileToDataUrl(file)
    const image = await loadImageFromDataUrl(sourceDataUrl)

    const MAX_DIMENSION = 640
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return sourceDataUrl
    }

    ctx.drawImage(image, 0, 0, width, height)

    const MAX_DATA_URL_LENGTH = 50_000
    let quality = 0.78
    let output = canvas.toDataURL("image/jpeg", quality)

    while (output.length > MAX_DATA_URL_LENGTH && quality > 0.24) {
      quality -= 0.1
      output = canvas.toDataURL("image/jpeg", quality)
    }

    if (output.length > MAX_DATA_URL_LENGTH) {
      throw new Error("Image is still too large after optimization")
    }

    return output
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messagesByPeer, targetUser])

  const startChat = (otherId: string) => {
    setTargetUser(otherId)
  }

  const onClearChat = () => {
    if (!targetUser) {
      return
    }

    clearChat(targetUser)
  }

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && targetUser && userId) {
      sendChatMessage(targetUser, message)

      setMessage("")
    }
  }

  const onSendImage = async (file: File) => {
    if (!targetUser || !userId) {
      return
    }

    if (!file.type.startsWith("image/")) {
      return
    }

    const MAX_SOURCE_IMAGE_SIZE_BYTES = 20 * 1024 * 1024
    if (file.size > MAX_SOURCE_IMAGE_SIZE_BYTES) {
      window.alert("Image is too large. Please choose a file smaller than 20MB.")
      return
    }

    try {
      const imageDataUrl = await optimizeImageForMessage(file)
      sendImageMessage(targetUser, imageDataUrl)
    } catch {
      window.alert("Image could not be prepared for sending. Try a smaller image.")
    }
  }

  const currentMessages = targetUser ? messagesByPeer[targetUser] || [] : []

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
      setTargetUser(null)
      setMessage("")
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

  const onLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    setAuthSession(null)
    setEmailInput("")
    setOtpInput("")
    setOtpEmail(null)
    setDevOtpHint(null)
    setUsernameInput("")
    setUsernameError(null)
    setTargetUser(null)
    setMessage("")
    setAuthError(null)
  }

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

  return (
    <ChatLayout
      onlineUsers={onlineUsers}
      targetUser={targetUser}
      displayName={displayName}
      userId={userId}
      message={message}
      currentMessages={currentMessages}
      messagesEndRef={messagesEndRef}
      onStartChat={startChat}
      onClearChat={onClearChat}
      onLogout={onLogout}
      onMessageChange={setMessage}
      onSendMessage={sendMessage}
      onSendImage={onSendImage}
    />
  )
}