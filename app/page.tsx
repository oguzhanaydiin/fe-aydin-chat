"use client"
import { useEffect, useState, useRef } from "react"
import { useChatSocket } from "@/hooks/useChatSocket"
import { fetchAllUsers, requestOtp, saveUsername, verifyOtp } from "@/lib/chat/authApi"
import { LoginView } from "@/app/components/chat/LoginView"
import { UsernameSetupView } from "@/app/components/chat/UsernameSetupView"
import { ChatLayout } from "@/app/components/chat/ChatLayout"

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8080/ws"
const SESSION_STORAGE_KEY = "chat_auth_session"
const FRIENDS_STORAGE_KEY_PREFIX = "chat_friends_"
const BACKEND_MAX_WS_TEXT_LENGTH = 4000
const BACKEND_MAX_WS_IMAGE_DATA_URL_LENGTH = 6 * 1024 * 1024

function resolveMaxWsTextLength() {
  const parsed = Number(process.env.NEXT_PUBLIC_WS_MAX_TEXT_LENGTH)
  if (Number.isFinite(parsed) && parsed >= 512) {
    return Math.min(Math.floor(parsed), BACKEND_MAX_WS_TEXT_LENGTH)
  }

  return BACKEND_MAX_WS_TEXT_LENGTH
}

type AuthSession = {
  token: string
  userId: string
  email: string
  username: string | null
  needsUsernameSetup: boolean
}

function normalizeIdentity(value: string) {
  return value.trim().toLowerCase()
}

export default function ChatPage() {
  const maxWsTextLength = resolveMaxWsTextLength()
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
  const [friends, setFriends] = useState<string[]>([])
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<string[]>([])
  const [allUsersLoading, setAllUsersLoading] = useState(false)
  const [allUsersError, setAllUsersError] = useState<string | null>(null)
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

    const maxImageDataUrlLength = Number(process.env.NEXT_PUBLIC_WS_MAX_IMAGE_DATA_URL_LENGTH)
    const targetMaxDataUrlLength = Number.isFinite(maxImageDataUrlLength) && maxImageDataUrlLength > 4096
      ? Math.floor(maxImageDataUrlLength)
      : BACKEND_MAX_WS_IMAGE_DATA_URL_LENGTH
    const MAX_DATA_URL_LENGTH = Math.max(4096, targetMaxDataUrlLength - 512)
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return sourceDataUrl
    }

    const maxSide = Math.max(image.width, image.height)
    const dimensionCaps = [1280, 1120, 960, 840, 720, 640, 560, 480, 400, 320]

    const encodeWithinTarget = (mimeType: "image/webp" | "image/jpeg") => {
      let low = 0.3
      let high = 0.95
      let best = ""

      for (let i = 0; i < 8; i += 1) {
        const quality = (low + high) / 2
        const output = canvas.toDataURL(mimeType, quality)

        if (output.length <= MAX_DATA_URL_LENGTH) {
          best = output
          low = quality
        } else {
          high = quality
        }
      }

      return best
    }

    for (const cap of dimensionCaps) {
      const scale = Math.min(1, cap / maxSide)
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))

      canvas.width = width
      canvas.height = height
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(image, 0, 0, width, height)

      const webpOutput = encodeWithinTarget("image/webp")
      if (webpOutput) {
        return webpOutput
      }

      const jpegOutput = encodeWithinTarget("image/jpeg")
      if (jpegOutput) {
        return jpegOutput
      }
    }

    throw new Error("Image is still too large after optimization")
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    if (!userId) {
      queueMicrotask(() => {
        setFriends([])
      })
      return
    }

    const key = `${FRIENDS_STORAGE_KEY_PREFIX}${userId}`
    const raw = localStorage.getItem(key)

    if (!raw) {
      queueMicrotask(() => {
        setFriends([])
      })
      return
    }

    try {
      const parsed = JSON.parse(raw) as unknown
      const storedFriends = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        : []

      queueMicrotask(() => {
        setFriends(Array.from(new Set(storedFriends)))
      })
    } catch {
      localStorage.removeItem(key)
      queueMicrotask(() => {
        setFriends([])
      })
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      return
    }

    const key = `${FRIENDS_STORAGE_KEY_PREFIX}${userId}`
    localStorage.setItem(key, JSON.stringify(friends))
  }, [friends, userId])

  useEffect(() => {
    scrollToBottom()
  }, [messagesByPeer, targetUser])

  const startChat = (otherId: string) => {
    setTargetUser(otherId)
  }

  const onOpenAddUserModal = async () => {
    if (!authSession?.token) {
      return
    }

    setIsAddUserModalOpen(true)
    setAllUsersLoading(true)
    setAllUsersError(null)

    try {
      const users = await fetchAllUsers(authSession.token)
      const normalizedSelf = normalizeIdentity(displayName || userId)
      const deduped = Array.from(new Set(users))
      const filtered = deduped.filter((candidate) => normalizeIdentity(candidate) !== normalizedSelf)
      setAllUsers(filtered)
    } catch (err) {
      setAllUsers([])
      setAllUsersError(err instanceof Error ? err.message : "Could not load users")
    } finally {
      setAllUsersLoading(false)
    }
  }

  const onCloseAddUserModal = () => {
    setIsAddUserModalOpen(false)
  }

  const onAddFriend = (friendId: string) => {
    const candidate = friendId.trim()
    if (!candidate) {
      return
    }

    const normalizedCandidate = normalizeIdentity(candidate)
    const normalizedSelf = normalizeIdentity(displayName || userId)
    if (normalizedCandidate === normalizedSelf) {
      return
    }

    setFriends((prev) => {
      const hasFriend = prev.some((friend) => normalizeIdentity(friend) === normalizedCandidate)
      if (hasFriend) {
        return prev
      }

      return [...prev, candidate]
    })

    setTargetUser(candidate)
    setIsAddUserModalOpen(false)
  }

  const onRemoveFriend = (friendId: string) => {
    const candidate = friendId.trim()
    if (!candidate) {
      return
    }

    const normalizedCandidate = normalizeIdentity(candidate)

    clearChat(candidate)
    setFriends((prev) => prev.filter((friend) => normalizeIdentity(friend) !== normalizedCandidate))

    if (targetUser && normalizeIdentity(targetUser) === normalizedCandidate) {
      setTargetUser(null)
      setMessage("")
    }
  }

  const onClearChat = () => {
    if (!targetUser) {
      return
    }

    clearChat(targetUser)
  }

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = message.trim()
    if (trimmed && targetUser && userId) {
      if (trimmed.length > maxWsTextLength) {
        window.alert(`Message is too long. Max ${maxWsTextLength} characters.`)
        return
      }

      sendChatMessage(targetUser, trimmed)

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

      if (imageDataUrl.length > BACKEND_MAX_WS_IMAGE_DATA_URL_LENGTH) {
        window.alert("Image is too large for chat image limit. Try a smaller image.")
        return
      }

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
    setFriends([])
    setIsAddUserModalOpen(false)
    setAllUsers([])
    setAllUsersLoading(false)
    setAllUsersError(null)
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
      friends={friends}
      onlineUsers={onlineUsers}
      targetUser={targetUser}
      displayName={displayName}
      userId={userId}
      message={message}
      currentMessages={currentMessages}
      isAddUserModalOpen={isAddUserModalOpen}
      allUsers={allUsers}
      allUsersLoading={allUsersLoading}
      allUsersError={allUsersError}
      messagesEndRef={messagesEndRef}
      onStartChat={startChat}
      onOpenAddUserModal={onOpenAddUserModal}
      onCloseAddUserModal={onCloseAddUserModal}
      onAddFriend={onAddFriend}
      onRemoveFriend={onRemoveFriend}
      onClearChat={onClearChat}
      onLogout={onLogout}
      onMessageChange={setMessage}
      onSendMessage={sendMessage}
      onSendImage={onSendImage}
    />
  )
}