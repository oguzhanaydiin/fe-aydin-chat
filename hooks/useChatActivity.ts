import { useCallback, useEffect, useRef, useState } from "react"
import type { ChatMessage, ConnectionStatus } from "@/lib/chat/types"
import { normalizeIdentity } from "@/lib/chat/utils"

interface UseChatActivityOptions {
  messagesByPeer: Record<string, ChatMessage[]>
  userId: string
  targetUser: string | null
  wsStatus: ConnectionStatus
  isAuthenticated: boolean
}

export function useChatActivity({
  messagesByPeer,
  userId,
  targetUser,
  wsStatus,
  isAuthenticated,
}: UseChatActivityOptions) {
  const [unreadCountsByPeer, setUnreadCountsByPeer] = useState<Record<string, number>>({})

  const knownIncomingMessageIdsByPeerRef = useRef<Record<string, Set<string>>>({})
  const messageTrackingReadyRef = useRef(false)
  const skipUnreadCountOnNextSyncRef = useRef(true)
  const notificationPermissionAskedRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!targetUser) {
      return
    }

    let cancelled = false

    const normalizedTarget = normalizeIdentity(targetUser)
    queueMicrotask(() => {
      if (cancelled) {
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
    })

    return () => {
      cancelled = true
    }
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
    if (typeof window === "undefined" || !isAuthenticated) {
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
  }, [isAuthenticated])

  useEffect(() => {
    if (!userId) {
      knownIncomingMessageIdsByPeerRef.current = {}
      messageTrackingReadyRef.current = false
      return
    }

    let cancelled = false

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
      queueMicrotask(() => {
        if (cancelled) {
          return
        }

        setUnreadCountsByPeer((prev) => {
          const next = { ...prev }
          Object.entries(newUnreadByPeer).forEach(([peerId, count]) => {
            next[peerId] = (next[peerId] ?? 0) + count
          })
          return next
        })
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

    return () => {
      cancelled = true
    }
  }, [messagesByPeer, playNewMessageSound, targetUser, userId])

  const resetChatActivityState = useCallback(() => {
    setUnreadCountsByPeer({})
    knownIncomingMessageIdsByPeerRef.current = {}
    messageTrackingReadyRef.current = false
    skipUnreadCountOnNextSyncRef.current = true
    notificationPermissionAskedRef.current = false
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => { })
      audioContextRef.current = null
    }
  }, [])

  return {
    unreadCountsByPeer,
    resetChatActivityState,
  }
}
