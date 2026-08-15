"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { isWsAuthError } from "@/utils/authApiError"
import { readHistory, writeHistory } from "@/utils/chatHistoryDb"
import { normalizeIncomingMessage, normalizeReactions } from "@/utils/chatMessageNormalize"
import { ChatMessage, ConnectionStatus, WsClientEvent, WsServerEvent } from "@/utils/chatTypes"
import { canMessagePeer } from "@/utils/identity"
import {
  canSendWsNow,
  clearPendingRetryByClientMessageId as removePendingRetryByClientMessageId,
  clientMessageIdFromPendingEvent,
  mergeMessagesByPeer,
} from "@/utils/messageDelivery"
import {
  appendMessageToPeer,
  applyLatestOutgoingSendingFailed,
  applyMessageQueued,
  applyOutgoingDelivered,
  applyOutgoingFailed,
  dmInboxAckIds,
  groupInboxAckIds,
  peerIdForMessage,
  planFailedMessageRetry,
  type StatusUpdateResult,
} from "@/utils/messageStatus"

interface UseChatSocketOptions {
  userId: string
  token: string
  wsUrl: string
  acceptedFriends?: string[]
  onAuthInvalid?: () => void
}

export function useChatSocket({
  userId,
  token,
  wsUrl,
  acceptedFriends = [],
  onAuthInvalid,
}: UseChatSocketOptions) {
  const MAX_RECONNECT_DELAY_MS = 10000
  /** Small images (~512KB) still need headroom on slow links. */
  const SEND_CONFIRM_TIMEOUT_MS = 20000

  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const [messagesByPeer, setMessagesByPeer] = useState<Record<string, ChatMessage[]>>({})
  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const shouldReconnectRef = useRef(true)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectRef = useRef<() => void>(() => { })
  const historyHydratedRef = useRef(false)
  const serverMessagePeerRef = useRef<Record<string, string>>({})
  const pendingRetryEventsRef = useRef<Record<string, WsClientEvent>>({})
  const isWsRegisteredRef = useRef(false)
  const pendingSendTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const onAuthInvalidRef = useRef(onAuthInvalid)

  useEffect(() => {
    onAuthInvalidRef.current = onAuthInvalid
  }, [onAuthInvalid])

  const applyStatusUpdate = useCallback((result: StatusUpdateResult) => {
    Object.entries(result.peerMapUpdates).forEach(([messageId, peerId]) => {
      serverMessagePeerRef.current[messageId] = peerId
    })
    result.peerMapDeletes.forEach((messageId) => {
      delete serverMessagePeerRef.current[messageId]
    })
    return result.messagesByPeer
  }, [])

  const setMessageReactions = useCallback((messageId: string, reactions: Record<string, string[]>) => {
    if (!messageId) return

    const normalizedReactions = normalizeReactions(reactions) ?? {}

    setMessagesByPeer((prev) => {
      let changed = false
      const next: Record<string, ChatMessage[]> = { ...prev }

      Object.entries(prev).forEach(([peerId, messages]) => {
        let peerChanged = false

        const updatedMessages = messages.map((msg) => {
          if (msg.id !== messageId) {
            return msg
          }

          const currentReactions = msg.reactions ?? {}
          const currentKeys = Object.keys(currentReactions)
          const nextKeys = Object.keys(normalizedReactions)
          const unchanged = currentKeys.length === nextKeys.length
            && nextKeys.every((reaction) => {
              const currentUsers = currentReactions[reaction] ?? []
              const nextUsers = normalizedReactions[reaction] ?? []
              return currentUsers.length === nextUsers.length
                && currentUsers.every((username, index) => username === nextUsers[index])
            })
          if (unchanged) {
            return msg
          }

          changed = true
          peerChanged = true

          return {
            ...msg,
            reactions: normalizedReactions,
          }
        })

        if (peerChanged) {
          next[peerId] = updatedMessages
        }
      })

      return changed ? next : prev
    })
  }, [])

  const toggleLocalMessageReaction = useCallback((messageId: string, reaction: string, byUsername: string) => {
    if (!messageId || !reaction || !byUsername) return

    const normalizedBy = byUsername.trim().toLowerCase()
    const normalizedReaction = reaction.trim()
    if (!normalizedBy || !normalizedReaction) return

    setMessagesByPeer((prev) => {
      let changed = false
      const next: Record<string, ChatMessage[]> = { ...prev }

      Object.entries(prev).forEach(([peerId, messages]) => {
        let peerChanged = false

        const updatedMessages = messages.map((msg) => {
          if (msg.id !== messageId) {
            return msg
          }

          const currentReactions = msg.reactions ?? {}
          const currentUsers = currentReactions[normalizedReaction] ?? []
          const hasReaction = currentUsers.includes(normalizedBy)
          const nextUsers = hasReaction
            ? currentUsers.filter((username) => username !== normalizedBy)
            : [...currentUsers, normalizedBy]

          const nextReactions = { ...currentReactions }
          if (nextUsers.length === 0) {
            delete nextReactions[normalizedReaction]
          } else {
            nextReactions[normalizedReaction] = nextUsers
          }

          changed = true
          peerChanged = true

          return {
            ...msg,
            reactions: nextReactions,
          }
        })

        if (peerChanged) {
          next[peerId] = updatedMessages
        }
      })

      return changed ? next : prev
    })
  }, [])

  const markOutgoingMessageAsDelivered = useCallback((messageId: string, clientMessageId?: string) => {
    setMessagesByPeer((prev) => {
      const result = applyOutgoingDelivered(
        prev,
        serverMessagePeerRef.current,
        userId,
        messageId,
        clientMessageId,
      )
      return applyStatusUpdate(result)
    })
  }, [applyStatusUpdate, userId])

  const markOutgoingMessageAsFailed = useCallback((params: { messageId?: string, clientMessageId?: string, reason?: string }) => {
    setMessagesByPeer((prev) => applyStatusUpdate(applyOutgoingFailed(prev, userId, params)))
  }, [applyStatusUpdate, userId])

  const markLatestOutgoingSendingAsFailed = useCallback((reason?: string) => {
    setMessagesByPeer((prev) => applyStatusUpdate(applyLatestOutgoingSendingFailed(prev, userId, reason)))
  }, [applyStatusUpdate, userId])

  const appendMessage = useCallback(
    (incoming: ChatMessage) => {
      setMessagesByPeer((prev) => appendMessageToPeer(prev, incoming, userId))
    },
    [userId],
  )

  const sendEvent = useCallback((event: WsClientEvent) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(event))
      return true
    }

    return false
  }, [])

  const clearPendingSendTimeout = useCallback((clientMessageId: string) => {
    if (!clientMessageId) {
      return
    }

    const timer = pendingSendTimeoutsRef.current[clientMessageId]
    if (timer) {
      clearTimeout(timer)
      delete pendingSendTimeoutsRef.current[clientMessageId]
    }
  }, [])

  const clearPendingRetryByClientMessageId = useCallback((clientMessageId: string) => {
    pendingRetryEventsRef.current = removePendingRetryByClientMessageId(
      pendingRetryEventsRef.current,
      clientMessageId,
    )
  }, [])

  const failOutgoing = useCallback((params: {
    messageId?: string
    clientMessageId?: string
    reason?: string
  }) => {
    if (params.clientMessageId) {
      clearPendingSendTimeout(params.clientMessageId)
      clearPendingRetryByClientMessageId(params.clientMessageId)
    }
    markOutgoingMessageAsFailed(params)
  }, [clearPendingRetryByClientMessageId, clearPendingSendTimeout, markOutgoingMessageAsFailed])

  const schedulePendingSendTimeout = useCallback((messageId: string, clientMessageId: string) => {
    if (!messageId || !clientMessageId) {
      return
    }

    clearPendingSendTimeout(clientMessageId)

    pendingSendTimeoutsRef.current[clientMessageId] = setTimeout(() => {
      delete pendingSendTimeoutsRef.current[clientMessageId]
      failOutgoing({
        messageId,
        clientMessageId,
        reason: "No server response. Please retry.",
      })
    }, SEND_CONFIRM_TIMEOUT_MS)
  }, [SEND_CONFIRM_TIMEOUT_MS, clearPendingSendTimeout, failOutgoing])

  const flushPendingRetryEvents = useCallback(() => {
    if (!canSendWsNow(
      socketRef.current?.readyState === WebSocket.OPEN,
      isWsRegisteredRef.current,
    )) {
      return
    }

    const pendingEntries = Object.entries(pendingRetryEventsRef.current)
    pendingEntries.forEach(([messageId, event]) => {
      const sent = sendEvent(event)
      if (sent) {
        const clientMessageId = clientMessageIdFromPendingEvent(event)
        if (clientMessageId) {
          schedulePendingSendTimeout(messageId, clientMessageId)
        }
        delete pendingRetryEventsRef.current[messageId]
      }
    })
  }, [schedulePendingSendTimeout, sendEvent])

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current) return

    const attempt = reconnectAttemptsRef.current
    const delay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS)
    reconnectAttemptsRef.current += 1

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
    }

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (shouldReconnectRef.current) {
        connectRef.current()
      }
    }, delay)
  }, [])

  const connect = useCallback(() => {
    if (!userId || !token || !wsUrl) {
      setStatus("idle")
      return
    }

    const existingSocket = socketRef.current
    if (existingSocket && existingSocket.readyState === WebSocket.OPEN) {
      return
    }

    setStatus("connecting")
    const ws = new WebSocket(wsUrl)
    socketRef.current = ws

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0
      isWsRegisteredRef.current = false
      setError(null)
      setIsConnected(true)
      setStatus("open")

      sendEvent({ type: "register", token })
      sendEvent({ type: "get_online_users" })
    }

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as WsServerEvent

        if (data.type === "online_users") {
          setOnlineUsers(data.users.filter((u) => u !== userId))
          return
        }

        if (data.type === "registered") {
          isWsRegisteredRef.current = true
          flushPendingRetryEvents()
          return
        }

        if (data.type === "inbox") {
          const normalizedMessages = data.messages
            .map((msg) => normalizeIncomingMessage(msg as Partial<ChatMessage> & Record<string, unknown>))
            .filter((msg): msg is ChatMessage => Boolean(msg))

          normalizedMessages.forEach((normalized) => {
            appendMessage(normalized)
          })

          const receivedIds = dmInboxAckIds(normalizedMessages, userId)
          if (receivedIds.length > 0) {
            sendEvent({ type: "ack", message_ids: receivedIds })
          }
          return
        }

        if (data.type === "group_inbox") {
          const normalizedMessages = data.messages
            .map((msg) => normalizeIncomingMessage(msg as Partial<ChatMessage> & Record<string, unknown>))
            .filter((msg): msg is ChatMessage => Boolean(msg))

          normalizedMessages.forEach((normalized) => {
            appendMessage(normalized)
          })

          const receivedIds = groupInboxAckIds(normalizedMessages)
          if (receivedIds.length > 0) {
            sendEvent({ type: "ack_group", message_ids: receivedIds })
          }
          return
        }

        if (data.type === "new_message") {
          const normalized = normalizeIncomingMessage(data.message as Partial<ChatMessage> & Record<string, unknown>)
          if (!normalized) {
            return
          }

          appendMessage({
            ...normalized,
            delivery_status: normalized.from_user_id === userId ? "sent" : normalized.delivery_status,
          })

          if (normalized.from_user_id === userId) {
            serverMessagePeerRef.current[normalized.id] = peerIdForMessage(normalized, userId)
          }

          if (normalized.to_user_id === userId) {
            sendEvent({ type: "ack", message_ids: [normalized.id] })
          }
          return
        }

        if (data.type === "new_group_message") {
          const normalized = normalizeIncomingMessage(data.message as Partial<ChatMessage> & Record<string, unknown>)
          if (!normalized) {
            return
          }

          appendMessage({
            ...normalized,
            delivery_status: normalized.from_user_id === userId ? "sent" : normalized.delivery_status,
          })

          if (normalized.from_user_id === userId) {
            serverMessagePeerRef.current[normalized.id] = peerIdForMessage(normalized, userId)
          }

          sendEvent({ type: "ack_group", message_ids: [normalized.id] })
          return
        }

        if (data.type === "message_reactions_updated") {
          setMessageReactions(data.message_id, data.reactions)
          return
        }

        if (data.type === "group_message_reactions_updated") {
          setMessageReactions(data.message_id, data.reactions)
          return
        }

        if (data.type === "message_queued") {
          if (!data.client_message_id) {
            return
          }

          const clientMessageId = data.client_message_id
          clearPendingSendTimeout(clientMessageId)
          clearPendingRetryByClientMessageId(clientMessageId)

          setMessagesByPeer((prev) => applyStatusUpdate(
            applyMessageQueued(prev, data.message_id, clientMessageId),
          ))
          return
        }

        if (data.type === "message_delivered") {
          if (data.client_message_id) {
            clearPendingSendTimeout(data.client_message_id)
          }
          markOutgoingMessageAsDelivered(data.message_id, data.client_message_id)
          return
        }

        if (data.type === "group_message_queued") {
          if (!data.client_message_id) {
            return
          }

          const clientMessageId = data.client_message_id
          clearPendingSendTimeout(clientMessageId)
          clearPendingRetryByClientMessageId(clientMessageId)

          setMessagesByPeer((prev) => applyStatusUpdate(
            applyMessageQueued(prev, data.message_id, clientMessageId, {
              groupId: data.group_id,
            }),
          ))
          return
        }

        if (data.type === "group_message_delivered") {
          if (data.client_message_id) {
            clearPendingSendTimeout(data.client_message_id)
          }
          markOutgoingMessageAsDelivered(data.message_id, data.client_message_id)
          return
        }

        if (data.type === "ack_result") {
          return
        }

        if (data.type === "ack_group_result") {
          return
        }

        if (data.type === "error") {
          if (isWsAuthError(data.message)) {
            shouldReconnectRef.current = false
            setError(data.message)
            console.error("WS auth error:", data.message)
            onAuthInvalidRef.current?.()
            ws.close()
            return
          }

          if (data.message_id || data.client_message_id) {
            failOutgoing({
              messageId: data.message_id,
              clientMessageId: data.client_message_id,
              reason: data.message,
            })
          } else {
            markLatestOutgoingSendingAsFailed(data.message)
          }
          setError(data.message)
          console.error("WS error:", data.message)
        }
      } catch {
        setError("Invalid WS payload")
        console.error("Invalid WS payload", ev.data)
      }
    }

    ws.onerror = () => {
      setStatus("error")
      setError("WebSocket connection error")
    }

    ws.onclose = () => {
      isWsRegisteredRef.current = false
      setIsConnected(false)
      setStatus("closed")
      socketRef.current = null

      if (shouldReconnectRef.current) {
        scheduleReconnect()
      }
    }
  }, [
    setMessageReactions,
    appendMessage,
    markLatestOutgoingSendingAsFailed,
    failOutgoing,
    markOutgoingMessageAsDelivered,
    applyStatusUpdate,
    scheduleReconnect,
    clearPendingSendTimeout,
    clearPendingRetryByClientMessageId,
    flushPendingRetryEvents,
    sendEvent,
    token,
    userId,
    wsUrl,
  ])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    historyHydratedRef.current = false
    serverMessagePeerRef.current = {}
    let isCancelled = false

    if (!userId) {
      historyHydratedRef.current = true
      queueMicrotask(() => {
        if (!isCancelled) {
          setMessagesByPeer({})
        }
      })

      return () => {
        isCancelled = true
      }
    }

    void readHistory(userId)
      .then((savedHistory) => {
        historyHydratedRef.current = true
        if (!isCancelled) {
          const hydrated = savedHistory ?? {}
          const nextPeerByServerId: Record<string, string> = {}

          Object.entries(hydrated).forEach(([peerId, messages]) => {
            messages.forEach((msg) => {
              if (msg.from_user_id === userId && !msg.id.startsWith("local-")) {
                nextPeerByServerId[msg.id] = peerId
              }
            })
          })

          serverMessagePeerRef.current = {
            ...serverMessagePeerRef.current,
            ...nextPeerByServerId,
          }
          setMessagesByPeer((prev) => mergeMessagesByPeer(hydrated, prev))
        }
      })
      .catch(() => {
        historyHydratedRef.current = true
        if (!isCancelled) {
          setMessagesByPeer((prev) => (Object.keys(prev).length > 0 ? prev : {}))
        }
      })

    return () => {
      isCancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!userId || !historyHydratedRef.current) {
      return
    }

    void writeHistory(userId, messagesByPeer).catch(() => {
      // Ignore storage failures and keep chat usable.
    })
  }, [messagesByPeer, userId])

  useEffect(() => {
    shouldReconnectRef.current = true
    queueMicrotask(() => {
      if (shouldReconnectRef.current) {
        connect()
      }
    })

    return () => {
      shouldReconnectRef.current = false

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }

      setIsConnected(false)
      setStatus("closed")
    }
  }, [connect])

  const sendMessage = useCallback(
    (toUserId: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !toUserId || !userId) return

      if (!canMessagePeer(toUserId, acceptedFriends)) {
        setError("You can only message accepted friends.")
        return
      }

      const clientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const eventToSend: WsClientEvent = {
        type: "send_message",
        to_user_id: toUserId,
        text: trimmed,
        client_message_id: clientMessageId,
      }

      const localMessage: ChatMessage = {
        id: clientMessageId,
        from_user_id: userId,
        to_user_id: toUserId,
        text: trimmed,
        created_at: new Date().toISOString(),
        client_message_id: clientMessageId,
        delivery_status: "sending",
      }

      appendMessage(localMessage)

      const canSendNow = canSendWsNow(
        socketRef.current?.readyState === WebSocket.OPEN,
        isWsRegisteredRef.current,
      )
      if (!canSendNow) {
        pendingRetryEventsRef.current[clientMessageId] = eventToSend
        connectRef.current()
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
        return
      }

      const sent = sendEvent(eventToSend)
      if (!sent) {
        failOutgoing({
          clientMessageId,
          reason: "Message could not be queued. Please retry.",
        })
      } else {
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
      }
    },
    [appendMessage, failOutgoing, schedulePendingSendTimeout, sendEvent, userId, acceptedFriends],
  )

  const sendImageMessage = useCallback(
    (toUserId: string, imageDataUrl: string) => {
      const normalizedImage = imageDataUrl.trim()
      if (!normalizedImage || !toUserId || !userId) return

      if (!canMessagePeer(toUserId, acceptedFriends)) {
        setError("You can only message accepted friends.")
        return
      }

      const clientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const eventToSend: WsClientEvent = {
        type: "send_message",
        to_user_id: toUserId,
        text: "",
        image_data_url: normalizedImage,
        client_message_id: clientMessageId,
      }

      const localMessage: ChatMessage = {
        id: clientMessageId,
        from_user_id: userId,
        to_user_id: toUserId,
        text: "",
        image_data_url: normalizedImage,
        created_at: new Date().toISOString(),
        client_message_id: clientMessageId,
        delivery_status: "sending",
      }

      appendMessage(localMessage)

      const canSendNow = canSendWsNow(
        socketRef.current?.readyState === WebSocket.OPEN,
        isWsRegisteredRef.current,
      )
      if (!canSendNow) {
        pendingRetryEventsRef.current[clientMessageId] = eventToSend
        connectRef.current()
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
        return
      }

      const sent = sendEvent(eventToSend)
      if (!sent) {
        failOutgoing({
          clientMessageId,
          reason: "Image could not be queued. Please retry.",
        })
      } else {
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
      }
    },
    [appendMessage, failOutgoing, schedulePendingSendTimeout, sendEvent, userId, acceptedFriends],
  )

  const sendGroupMessage = useCallback(
    (groupId: string, text: string) => {
      const normalizedGroupId = groupId.trim().toLowerCase()
      const trimmed = text.trim()
      if (!normalizedGroupId || !trimmed || !userId) return

      const clientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const groupConversationId = `group:${normalizedGroupId}`
      const eventToSend: WsClientEvent = {
        type: "send_group_message",
        group_id: normalizedGroupId,
        text: trimmed,
        client_message_id: clientMessageId,
      }

      const localMessage: ChatMessage = {
        id: clientMessageId,
        from_user_id: userId,
        to_user_id: groupConversationId,
        group_id: normalizedGroupId,
        text: trimmed,
        created_at: new Date().toISOString(),
        client_message_id: clientMessageId,
        delivery_status: "sending",
      }

      appendMessage(localMessage)

      const canSendNow = canSendWsNow(
        socketRef.current?.readyState === WebSocket.OPEN,
        isWsRegisteredRef.current,
      )
      if (!canSendNow) {
        pendingRetryEventsRef.current[clientMessageId] = eventToSend
        connectRef.current()
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
        return
      }

      const sent = sendEvent(eventToSend)
      if (!sent) {
        failOutgoing({
          clientMessageId,
          reason: "Message could not be queued. Please retry.",
        })
      } else {
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
      }
    },
    [appendMessage, failOutgoing, schedulePendingSendTimeout, sendEvent, userId],
  )

  const sendGroupImageMessage = useCallback(
    (groupId: string, imageDataUrl: string) => {
      const normalizedGroupId = groupId.trim().toLowerCase()
      const normalizedImage = imageDataUrl.trim()
      if (!normalizedGroupId || !normalizedImage || !userId) return

      const clientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const groupConversationId = `group:${normalizedGroupId}`
      const eventToSend: WsClientEvent = {
        type: "send_group_message",
        group_id: normalizedGroupId,
        text: "",
        image_data_url: normalizedImage,
        client_message_id: clientMessageId,
      }

      const localMessage: ChatMessage = {
        id: clientMessageId,
        from_user_id: userId,
        to_user_id: groupConversationId,
        group_id: normalizedGroupId,
        text: "",
        image_data_url: normalizedImage,
        created_at: new Date().toISOString(),
        client_message_id: clientMessageId,
        delivery_status: "sending",
      }

      appendMessage(localMessage)

      const canSendNow = canSendWsNow(
        socketRef.current?.readyState === WebSocket.OPEN,
        isWsRegisteredRef.current,
      )
      if (!canSendNow) {
        pendingRetryEventsRef.current[clientMessageId] = eventToSend
        connectRef.current()
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
        return
      }

      const sent = sendEvent(eventToSend)
      if (!sent) {
        failOutgoing({
          clientMessageId,
          reason: "Image could not be queued. Please retry.",
        })
      } else {
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
      }
    },
    [appendMessage, failOutgoing, schedulePendingSendTimeout, sendEvent, userId],
  )

  const retryMessage = useCallback((messageId: string) => {
    const normalizedMessageId = messageId.trim()
    if (!normalizedMessageId || !userId) {
      return false
    }

    const newClientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let eventToSend: WsClientEvent | null = null
    let retryQueueKey = normalizedMessageId
    let retryClientMessageId = ""

    setMessagesByPeer((prev) => {
      const plan = planFailedMessageRetry(
        prev,
        userId,
        normalizedMessageId,
        acceptedFriends,
        newClientMessageId,
      )
      if (!plan) {
        return prev
      }

      eventToSend = plan.event
      retryQueueKey = plan.retryQueueKey
      retryClientMessageId = plan.retryClientMessageId
      return applyStatusUpdate({
        messagesByPeer: plan.messagesByPeer,
        peerMapUpdates: {},
        peerMapDeletes: plan.peerMapDeletes,
        changed: true,
      })
    })

    if (!eventToSend) {
      return false
    }

    const canSendNow = canSendWsNow(
      socketRef.current?.readyState === WebSocket.OPEN,
      isWsRegisteredRef.current,
    )
    if (!canSendNow) {
      pendingRetryEventsRef.current[retryQueueKey] = eventToSend
      connectRef.current()
      if (retryClientMessageId) {
        schedulePendingSendTimeout(retryQueueKey, retryClientMessageId)
      }
      return true
    }

    const sent = sendEvent(eventToSend)
    if (!sent) {
      pendingRetryEventsRef.current[retryQueueKey] = eventToSend
      connectRef.current()
      if (retryClientMessageId) {
        schedulePendingSendTimeout(retryQueueKey, retryClientMessageId)
      }
      return true
    }

    if (retryClientMessageId) {
      schedulePendingSendTimeout(retryQueueKey, retryClientMessageId)
    }
    return true
  }, [acceptedFriends, applyStatusUpdate, schedulePendingSendTimeout, sendEvent, userId])

  const deleteMessage = useCallback((messageId: string) => {
    const normalizedMessageId = messageId.trim()
    if (!normalizedMessageId) {
      return false
    }

    let deleted = false

    setMessagesByPeer((prev) => {
      const next: Record<string, ChatMessage[]> = { ...prev }

      Object.entries(prev).forEach(([peerId, messages]) => {
        const filtered = messages.filter((msg) => msg.id !== normalizedMessageId)
        if (filtered.length !== messages.length) {
          deleted = true
          if (filtered.length > 0) {
            next[peerId] = filtered
          } else {
            delete next[peerId]
          }
        }
      })

      return deleted ? next : prev
    })

    delete serverMessagePeerRef.current[normalizedMessageId]
    delete pendingRetryEventsRef.current[normalizedMessageId]

    Object.entries(pendingSendTimeoutsRef.current).forEach(([clientMessageId]) => {
      if (clientMessageId === normalizedMessageId) {
        clearPendingSendTimeout(clientMessageId)
      }
    })

    return deleted
  }, [clearPendingSendTimeout])

  const clearChat = useCallback((peerId: string) => {
    if (!peerId) return

    const normalizedPeerId = peerId.trim().toLowerCase()

    setMessagesByPeer((prev) => {
      let foundPeer: string | null = null
      for (const key of Object.keys(prev)) {
        if (key.trim().toLowerCase() === normalizedPeerId) {
          foundPeer = key
          break
        }
      }

      if (!foundPeer) {
        return prev
      }

      const next = { ...prev }
      const removedMessages = next[foundPeer] || []

      removedMessages.forEach((msg) => {
        if (msg.from_user_id === userId && !msg.id.startsWith("local-")) {
          delete serverMessagePeerRef.current[msg.id]
        }

        delete pendingRetryEventsRef.current[msg.id]
        if (msg.client_message_id) {
          clearPendingSendTimeout(msg.client_message_id)
        }
        clearPendingSendTimeout(msg.id)
      })

      delete next[foundPeer]
      return next
    })

    void (async () => {
      try {
        const saved = await readHistory(userId)
        if (!saved) {
          return
        }

        const nextByPeer = { ...saved }
        for (const key of Object.keys(nextByPeer)) {
          if (key.trim().toLowerCase() === normalizedPeerId) {
            delete nextByPeer[key]
            break
          }
        }

        await writeHistory(userId, nextByPeer)
      } catch {
        // Ignore IndexedDB errors
      }
    })()
  }, [clearPendingSendTimeout, userId])

  useEffect(() => {
    return () => {
      Object.values(pendingSendTimeoutsRef.current).forEach((timer) => clearTimeout(timer))
      pendingSendTimeoutsRef.current = {}
    }
  }, [])

  const sendHeartMessage = useCallback((conversationId: string, messageId: string) => {
    const normalizedConversation = conversationId.trim().toLowerCase()
    const normalizedMessageId = messageId.trim()
    const normalizedUserId = userId.trim().toLowerCase()
    if (!normalizedConversation || !normalizedMessageId || !normalizedUserId) {
      return
    }

    if (!canMessagePeer(normalizedConversation, acceptedFriends)) {
      setError("You can only react on chats with accepted friends.")
      return
    }

    const heartReaction = "❤️"
    toggleLocalMessageReaction(normalizedMessageId, heartReaction, normalizedUserId)
    if (normalizedConversation.startsWith("group:")) {
      const groupId = normalizedConversation.slice("group:".length)
      if (!groupId) {
        return
      }

      sendEvent({
        type: "react_group_message",
        message_id: normalizedMessageId,
        group_id: groupId,
        reaction: heartReaction,
      })
      return
    }

    sendEvent({
      type: "react_message",
      message_id: normalizedMessageId,
      to_username: normalizedConversation,
      reaction: heartReaction,
    })
  }, [acceptedFriends, sendEvent, toggleLocalMessageReaction, userId])

  return {
    onlineUsers,
    messagesByPeer,
    isConnected,
    status,
    error,
    sendMessage,
    sendImageMessage,
    sendGroupMessage,
    sendGroupImageMessage,
    retryMessage,
    deleteMessage,
    sendHeartMessage,
    clearChat,
  }
}
