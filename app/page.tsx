"use client"
import { useCallback, useEffect, useState, useRef } from "react"
import { useChatSocket } from "@/hooks/useChatSocket"
import { useImageMessage } from "@/hooks/useImageMessage"
import {
  acceptFriendRequest,
  fetchAllUsers,
  fetchFriendSnapshot,
  removeFriend,
  requestOtp,
  saveUsername,
  sendFriendRequest,
  verifyOtp,
} from "@/lib/chat/authApi"
import type { ChatMessage, FriendSnapshot } from "@/lib/chat/types"
import {
  SESSION_STORAGE_KEY,
  WS_URL,
  resolveMaxWsTextLength,
} from "@/lib/chat/constants"
import { normalizeIdentity } from "@/lib/chat/utils"
import { LoginView } from "@/app/components/chat/LoginView"
import { UsernameSetupView } from "@/app/components/chat/UsernameSetupView"
import { ChatLayout } from "@/app/components/chat/ChatLayout"

type AuthSession = {
  token: string
  userId: string
  email: string
  username: string | null
  needsUsernameSetup: boolean
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
  const [incomingRequests, setIncomingRequests] = useState<string[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<string[]>([])
  const [friendActionLoading, setFriendActionLoading] = useState(false)
  const [friendActionError, setFriendActionError] = useState<string | null>(null)
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<string[]>([])
  const [allUsersLoading, setAllUsersLoading] = useState(false)
  const [allUsersError, setAllUsersError] = useState<string | null>(null)
  const [unreadCountsByPeer, setUnreadCountsByPeer] = useState<Record<string, number>>({})
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const knownAcceptedFriendsRef = useRef<Set<string>>(new Set())
  const friendsInitializedRef = useRef(false)
  const knownIncomingMessageIdsByPeerRef = useRef<Record<string, Set<string>>>({})
  const messageTrackingReadyRef = useRef(false)
  const skipUnreadCountOnNextSyncRef = useRef(true)
  const notificationPermissionAskedRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)

  const applyFriendSnapshot = useCallback((snapshot: FriendSnapshot) => {
    const accepted = Array.from(new Set(snapshot.accepted_friends.map((item) => normalizeIdentity(item))))
    const incoming = Array.from(new Set(snapshot.incoming_requests.map((item) => normalizeIdentity(item))))
    const outgoing = Array.from(new Set(snapshot.outgoing_requests.map((item) => normalizeIdentity(item))))

    if (friendsInitializedRef.current) {
      const newlyAccepted = accepted.filter((friend) => !knownAcceptedFriendsRef.current.has(friend))
      if (newlyAccepted.length > 0) {
        setTargetUser(newlyAccepted[0])
      }
    }

    knownAcceptedFriendsRef.current = new Set(accepted)
    friendsInitializedRef.current = true

    setFriends(accepted)
    setIncomingRequests(incoming)
    setOutgoingRequests(outgoing)
  }, [])

  const { onlineUsers, messagesByPeer, sendMessage: sendChatMessage, sendImageMessage, clearChat, status: wsStatus } = useChatSocket({
    userId,
    token,
    wsUrl: WS_URL,
  })

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    let cancelled = false

    if (!authSession?.token || !userId) {
      queueMicrotask(() => {
        if (!cancelled) {
          setFriends([])
          setIncomingRequests([])
          setOutgoingRequests([])
        }
      })

      return () => {
        cancelled = true
      }
    }

    void fetchFriendSnapshot(authSession.token)
      .then((snapshot) => {
        if (!cancelled) {
          applyFriendSnapshot(snapshot)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFriendActionError(err instanceof Error ? err.message : "Could not load friends")
        }
      })

    return () => {
      cancelled = true
    }
  }, [applyFriendSnapshot, authSession?.token, userId])

  useEffect(() => {
    if (wsStatus !== "open" || !authSession?.token) {
      return
    }

    void fetchFriendSnapshot(authSession.token)
      .then((snapshot) => applyFriendSnapshot(snapshot))
      .catch(() => { })
  }, [wsStatus, applyFriendSnapshot, authSession?.token])

  useEffect(() => {
    if (!authSession?.token || !userId) {
      return
    }

    const intervalId = setInterval(() => {
      void fetchFriendSnapshot(authSession.token)
        .then((snapshot) => applyFriendSnapshot(snapshot))
        .catch(() => { })
    }, 10000)

    return () => clearInterval(intervalId)
  }, [applyFriendSnapshot, authSession?.token, userId])

  useEffect(() => {
    scrollToBottom()
  }, [messagesByPeer, targetUser])

  useEffect(() => {
    if (!targetUser) {
      return
    }

    const normalizedTarget = normalizeIdentity(targetUser)
    setUnreadCountsByPeer((prev) => {
      if (!prev[normalizedTarget]) {
        return prev
      }

      const next = { ...prev }
      delete next[normalizedTarget]
      return next
    })
  }, [targetUser])

  useEffect(() => {
    if (typeof document === "undefined" || !targetUser) {
      return
    }

    const normalizedTarget = normalizeIdentity(targetUser)
    const clearOpenChatUnreadOnVisible = () => {
      if (document.hidden) {
        return
      }

      setUnreadCountsByPeer((prev) => {
        if (!prev[normalizedTarget]) {
          return prev
        }

        const next = { ...prev }
        delete next[normalizedTarget]
        return next
      })
    }

    document.addEventListener("visibilitychange", clearOpenChatUnreadOnVisible)
    return () => {
      document.removeEventListener("visibilitychange", clearOpenChatUnreadOnVisible)
    }
  }, [targetUser])

  useEffect(() => {
    if (!userId) {
      skipUnreadCountOnNextSyncRef.current = true
      return
    }

    if (wsStatus === "open") {
      // First update after a fresh socket open is typically inbox sync; ignore for unread counters.
      skipUnreadCountOnNextSyncRef.current = true
    }
  }, [userId, wsStatus])

  const playNewMessageSound = useCallback(() => {
    if (typeof window === "undefined") {
      return
    }

    const audioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!audioContextCtor) {
      return
    }

    const context = audioContextRef.current ?? new audioContextCtor()
    audioContextRef.current = context

    if (context.state === "suspended") {
      void context.resume().catch(() => { })
    }

    const oscillator = context.createOscillator()
    const gainNode = context.createGain()

    oscillator.type = "sine"
    oscillator.frequency.value = 880
    gainNode.gain.setValueAtTime(0.0001, context.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.14)

    oscillator.connect(gainNode)
    gainNode.connect(context.destination)

    oscillator.start()
    oscillator.stop(context.currentTime + 0.14)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !authSession) {
      return
    }

    const unlockNotificationsAndAudio = () => {
      const audioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (audioContextCtor) {
        if (!audioContextRef.current) {
          audioContextRef.current = new audioContextCtor()
        }

        if (audioContextRef.current.state === "suspended") {
          void audioContextRef.current.resume().catch(() => { })
        }
      }

      if (!("Notification" in window) || notificationPermissionAskedRef.current) {
        return
      }

      notificationPermissionAskedRef.current = true
      if (Notification.permission === "default") {
        void Notification.requestPermission().catch(() => { })
      }
    }

    window.addEventListener("pointerdown", unlockNotificationsAndAudio, { once: true })
    window.addEventListener("keydown", unlockNotificationsAndAudio, { once: true })

    return () => {
      window.removeEventListener("pointerdown", unlockNotificationsAndAudio)
      window.removeEventListener("keydown", unlockNotificationsAndAudio)
    }
  }, [authSession])

  useEffect(() => {
    if (!userId) {
      knownIncomingMessageIdsByPeerRef.current = {}
      messageTrackingReadyRef.current = false
      return
    }

    const nextKnown: Record<string, Set<string>> = {}
    const newlyIncomingByPeer: Array<{ peerId: string, message: ChatMessage }> = []

    Object.entries(messagesByPeer).forEach(([peerId, peerMessages]) => {
      const previousKnown = knownIncomingMessageIdsByPeerRef.current[peerId] ?? new Set<string>()
      const currentKnown = new Set<string>()

      peerMessages.forEach((msg) => {
        if (msg.from_user_id !== userId) {
          currentKnown.add(msg.id)
          if (messageTrackingReadyRef.current && !previousKnown.has(msg.id)) {
            newlyIncomingByPeer.push({ peerId, message: msg })
          }
        }
      })

      nextKnown[peerId] = currentKnown
    })

    knownIncomingMessageIdsByPeerRef.current = nextKnown

    if (!messageTrackingReadyRef.current) {
      messageTrackingReadyRef.current = true
      return
    }

    if (newlyIncomingByPeer.length === 0) {
      return
    }

    if (skipUnreadCountOnNextSyncRef.current) {
      skipUnreadCountOnNextSyncRef.current = false
      return
    }

    const normalizedTarget = targetUser ? normalizeIdentity(targetUser) : null
    const newUnreadByPeer = newlyIncomingByPeer.reduce<Record<string, number>>((acc, entry) => {
      const normalizedPeerId = normalizeIdentity(entry.peerId)
      const shouldMarkAsRead = normalizedTarget === normalizedPeerId && !document.hidden
      if (shouldMarkAsRead) {
        return acc
      }

      acc[normalizedPeerId] = (acc[normalizedPeerId] ?? 0) + 1
      return acc
    }, {})

    if (Object.keys(newUnreadByPeer).length > 0) {
      setUnreadCountsByPeer((prev) => {
        const next = { ...prev }
        Object.entries(newUnreadByPeer).forEach(([peerId, count]) => {
          next[peerId] = (next[peerId] ?? 0) + count
        })
        return next
      })
    }

    playNewMessageSound()

    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
      return
    }

    const latestIncoming = newlyIncomingByPeer[newlyIncomingByPeer.length - 1]
    const messagePreview = latestIncoming.message.text?.trim()
      ? latestIncoming.message.text
      : "Photo"

    const shouldShowSystemNotification = document.hidden || targetUser !== latestIncoming.peerId
    if (shouldShowSystemNotification) {
      new Notification(`New message from ${latestIncoming.peerId}`, {
        body: messagePreview,
        tag: `chat-${latestIncoming.peerId}`,
        silent: false,
      })
    }
  }, [messagesByPeer, playNewMessageSound, targetUser, userId])

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

  const onSendFriendRequest = async (friendId: string) => {
    if (!authSession?.token) {
      return
    }

    const candidate = friendId.trim()
    if (!candidate) {
      return
    }

    const normalizedCandidate = normalizeIdentity(candidate)
    const normalizedSelf = normalizeIdentity(displayName || userId)
    if (normalizedCandidate === normalizedSelf) {
      return
    }

    setFriendActionLoading(true)
    setFriendActionError(null)

    try {
      await sendFriendRequest(authSession.token, candidate)
      setOutgoingRequests((prev) => {
        if (prev.some((item) => normalizeIdentity(item) === normalizedCandidate)) {
          return prev
        }

        return [...prev, normalizedCandidate]
      })
      setIsAddUserModalOpen(false)
    } catch (err) {
      setFriendActionError(err instanceof Error ? err.message : "Could not send friend request")
    } finally {
      setFriendActionLoading(false)
    }
  }

  const onAcceptFriendRequest = async (fromUsername: string) => {
    if (!authSession?.token) {
      return
    }

    const normalized = normalizeIdentity(fromUsername)
    if (!normalized) {
      return
    }

    setFriendActionLoading(true)
    setFriendActionError(null)

    try {
      await acceptFriendRequest(authSession.token, normalized)

      setIncomingRequests((prev) => prev.filter((item) => normalizeIdentity(item) !== normalized))
      setOutgoingRequests((prev) => prev.filter((item) => normalizeIdentity(item) !== normalized))
      setFriends((prev) => {
        if (prev.some((item) => normalizeIdentity(item) === normalized)) {
          return prev
        }

        return [...prev, normalized]
      })
      setTargetUser(normalized)
    } catch (err) {
      setFriendActionError(err instanceof Error ? err.message : "Could not accept friend request")
    } finally {
      setFriendActionLoading(false)
    }
  }

  const onRemoveFriend = async (friendUsername: string) => {
    if (!authSession?.token) {
      return
    }

    const normalized = normalizeIdentity(friendUsername)
    if (!normalized) {
      return
    }

    setFriendActionLoading(true)
    setFriendActionError(null)

    try {
      await removeFriend(authSession.token, normalized)

      clearChat(normalized)
      setFriends((prev) => prev.filter((item) => normalizeIdentity(item) !== normalized))
      setIncomingRequests((prev) => prev.filter((item) => normalizeIdentity(item) !== normalized))
      setOutgoingRequests((prev) => prev.filter((item) => normalizeIdentity(item) !== normalized))

      if (targetUser && normalizeIdentity(targetUser) === normalized) {
        setTargetUser(null)
        setMessage("")
      }

      const snapshot = await fetchFriendSnapshot(authSession.token)
      applyFriendSnapshot(snapshot)
    } catch (err) {
      setFriendActionError(err instanceof Error ? err.message : "Could not remove friend")
    } finally {
      setFriendActionLoading(false)
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

  const { onSendImage } = useImageMessage({
    targetUser,
    userId,
    sendImageMessage,
  })

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
    setIncomingRequests([])
    setOutgoingRequests([])
    knownAcceptedFriendsRef.current = new Set()
    friendsInitializedRef.current = false
    setFriendActionLoading(false)
    setFriendActionError(null)
    setIsAddUserModalOpen(false)
    setAllUsers([])
    setAllUsersLoading(false)
    setAllUsersError(null)
    setUnreadCountsByPeer({})
    knownIncomingMessageIdsByPeerRef.current = {}
    messageTrackingReadyRef.current = false
    notificationPermissionAskedRef.current = false
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => { })
      audioContextRef.current = null
    }
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
      incomingRequests={incomingRequests}
      outgoingRequests={outgoingRequests}
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
      friendActionLoading={friendActionLoading}
      friendActionError={friendActionError}
      unreadCountsByPeer={unreadCountsByPeer}
      messagesEndRef={messagesEndRef}
      onStartChat={startChat}
      onOpenAddUserModal={onOpenAddUserModal}
      onCloseAddUserModal={onCloseAddUserModal}
      onSendFriendRequest={onSendFriendRequest}
      onAcceptFriendRequest={onAcceptFriendRequest}
      onRemoveFriend={onRemoveFriend}
      onClearChat={onClearChat}
      onLogout={onLogout}
      onMessageChange={setMessage}
      onSendMessage={sendMessage}
      onSendImage={onSendImage}
    />
  )
}