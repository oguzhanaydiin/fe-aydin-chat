"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChatMessage, ConnectionStatus, WsClientEvent, WsServerEvent } from "@/utils/chatTypes"

interface UseChatSocketOptions {
  userId: string
  token: string
  wsUrl: string
}

export function useChatSocket({
  userId,
  token,
  wsUrl,
}: UseChatSocketOptions) {
  const MAX_RECONNECT_DELAY_MS = 10000
  const SEND_CONFIRM_TIMEOUT_MS = 10000
  const CHAT_HISTORY_DB_NAME = "chat_history_db"
  const CHAT_HISTORY_STORE_NAME = "histories"

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

  const normalizeIncomingMessage = useCallback((incoming: Partial<ChatMessage> & Record<string, unknown>): ChatMessage | null => {
    const id = typeof incoming.id === "string" ? incoming.id : ""
    const groupId = typeof incoming.group_id === "string" ? incoming.group_id.trim().toLowerCase() : ""
    const fromUserId = typeof incoming.from_user_id === "string"
      ? incoming.from_user_id
      : (typeof incoming.from_username === "string" ? incoming.from_username : "")
    const toUserId = typeof incoming.to_user_id === "string"
      ? incoming.to_user_id
      : (typeof incoming.to_username === "string" ? incoming.to_username : (groupId ? `group:${groupId}` : ""))
    const createdAt = typeof incoming.created_at === "string" ? incoming.created_at : new Date().toISOString()
    const text = typeof incoming.text === "string" ? incoming.text : ""
    const imageDataUrl = typeof incoming.image_data_url === "string" ? incoming.image_data_url : undefined
    const reactions = (() => {
      const rawReactions = incoming.reactions
      if (!rawReactions || typeof rawReactions !== "object" || Array.isArray(rawReactions)) {
        return undefined
      }

      const normalized: Record<string, string[]> = {}
      Object.entries(rawReactions as Record<string, unknown>).forEach(([reaction, users]) => {
        if (!reaction.trim() || !Array.isArray(users)) {
          return
        }

        const normalizedUsers = users
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry.length > 0)

        if (normalizedUsers.length > 0) {
          normalized[reaction] = normalizedUsers
        }
      })

      return Object.keys(normalized).length > 0 ? normalized : undefined
    })()
    const clientMessageId = typeof incoming.client_message_id === "string" ? incoming.client_message_id : undefined
    const deliveryStatus = incoming.delivery_status === "sending"
      || incoming.delivery_status === "sent"
      || incoming.delivery_status === "delivered"
      || incoming.delivery_status === "failed"
      ? incoming.delivery_status
      : undefined
    const errorMessage = typeof incoming.error_message === "string" ? incoming.error_message : undefined

    if (!id || !fromUserId || (!toUserId && !groupId)) {
      return null
    }

    return {
      id,
      from_user_id: fromUserId,
      to_user_id: toUserId || `group:${groupId}`,
      text,
      group_id: groupId || undefined,
      image_data_url: imageDataUrl,
      reactions,
      created_at: createdAt,
      client_message_id: clientMessageId,
      delivery_status: deliveryStatus,
      error_message: errorMessage,
    }
  }, [])

  const setMessageReactions = useCallback((messageId: string, reactions: Record<string, string[]>) => {
    if (!messageId) return

    const normalizedReactions: Record<string, string[]> = {}
    Object.entries(reactions).forEach(([reaction, users]) => {
      if (!reaction.trim()) {
        return
      }

      const normalizedUsers = users
        .map((username) => username.trim().toLowerCase())
        .filter((username) => username.length > 0)

      if (normalizedUsers.length > 0) {
        normalizedReactions[reaction] = normalizedUsers
      }
    })

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
    if (!messageId && !clientMessageId) return

    setMessagesByPeer((prev) => {
      let changed = false
      const next: Record<string, ChatMessage[]> = { ...prev }

      const peerId = serverMessagePeerRef.current[messageId]

      if (peerId) {
        const messages = next[peerId] || []
        let peerChanged = false

        const updatedMessages = messages.map((msg) => {
          if (msg.id === messageId && msg.from_user_id === userId && msg.delivery_status !== "delivered") {
            peerChanged = true
            changed = true
            return { ...msg, delivery_status: "delivered" as const, error_message: undefined }
          }

          return msg
        })

        if (peerChanged) {
          next[peerId] = updatedMessages
        }
      } else if (clientMessageId) {
        Object.entries(prev).forEach(([currentPeerId, messages]) => {
          let peerChanged = false
          const hasServerMessageAlready = messages.some((msg) => msg.id === messageId)

          const updatedMessages = messages.flatMap((msg) => {
            if (msg.id === clientMessageId && msg.from_user_id === userId && msg.delivery_status !== "delivered") {
              if (hasServerMessageAlready) {
                peerChanged = true
                changed = true
                return []
              }

              peerChanged = true
              changed = true
              serverMessagePeerRef.current[messageId] = currentPeerId

              return [{
                ...msg,
                id: messageId,
                client_message_id: clientMessageId,
                delivery_status: "delivered" as const,
                error_message: undefined,
              }]
            }

            return [msg]
          })

          if (peerChanged) {
            next[currentPeerId] = updatedMessages
          }
        })
      }

      return changed ? next : prev
    })
  }, [userId])

  const markOutgoingMessageAsFailed = useCallback((params: { messageId?: string, clientMessageId?: string, reason?: string }) => {
    const { messageId, clientMessageId, reason } = params
    if (!messageId && !clientMessageId) return

    const normalizedReason = reason?.trim()

    setMessagesByPeer((prev) => {
      let changed = false
      const next: Record<string, ChatMessage[]> = { ...prev }

      Object.entries(prev).forEach(([peerId, messages]) => {
        let peerChanged = false

        const updatedMessages = messages.map((msg) => {
          const isTargetMessage = (messageId && msg.id === messageId)
            || (clientMessageId && (msg.id === clientMessageId || msg.client_message_id === clientMessageId))

          if (!isTargetMessage || msg.from_user_id !== userId) {
            return msg
          }

          if (msg.delivery_status === "failed" && msg.error_message === normalizedReason) {
            return msg
          }

          changed = true
          peerChanged = true

          return {
            ...msg,
            delivery_status: "failed" as const,
            error_message: normalizedReason,
          }
        })

        if (peerChanged) {
          next[peerId] = updatedMessages
        }
      })

      return changed ? next : prev
    })
  }, [userId])

  const markLatestOutgoingSendingAsFailed = useCallback((reason?: string) => {
    const normalizedReason = reason?.trim()

    setMessagesByPeer((prev) => {
      let latestPeerId: string | null = null
      let latestIndex = -1
      let latestTimestamp = 0

      Object.entries(prev).forEach(([peerId, messages]) => {
        messages.forEach((msg, index) => {
          if (msg.from_user_id !== userId || msg.delivery_status !== "sending") {
            return
          }

          const timestamp = Date.parse(msg.created_at)
          const sortableTimestamp = Number.isNaN(timestamp) ? 0 : timestamp
          if (sortableTimestamp >= latestTimestamp) {
            latestTimestamp = sortableTimestamp
            latestPeerId = peerId
            latestIndex = index
          }
        })
      })

      if (!latestPeerId || latestIndex < 0) {
        return prev
      }

      const targetMessages = prev[latestPeerId]
      const targetMessage = targetMessages[latestIndex]
      if (!targetMessage) {
        return prev
      }

      const nextMessages = [...targetMessages]
      nextMessages[latestIndex] = {
        ...targetMessage,
        delivery_status: "failed",
        error_message: normalizedReason,
      }

      return {
        ...prev,
        [latestPeerId]: nextMessages,
      }
    })
  }, [userId])

  const openHistoryDb = useCallback(() => {
    return new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === "undefined" || !("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available"))
        return
      }

      const request = window.indexedDB.open(CHAT_HISTORY_DB_NAME, 1)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(CHAT_HISTORY_STORE_NAME)) {
          db.createObjectStore(CHAT_HISTORY_STORE_NAME, { keyPath: "userId" })
        }
      }

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        reject(request.error ?? new Error("Failed to open IndexedDB"))
      }
    })
  }, [CHAT_HISTORY_DB_NAME, CHAT_HISTORY_STORE_NAME])

  const readHistory = useCallback(
    async (currentUserId: string) => {
      const db = await openHistoryDb()

      return await new Promise<Record<string, ChatMessage[]> | null>((resolve, reject) => {
        const tx = db.transaction(CHAT_HISTORY_STORE_NAME, "readonly")
        const store = tx.objectStore(CHAT_HISTORY_STORE_NAME)
        const request = store.get(currentUserId)

        request.onsuccess = () => {
          const record = request.result as { userId: string, messagesByPeer: Record<string, ChatMessage[]> } | undefined
          resolve(record?.messagesByPeer ?? null)
        }

        request.onerror = () => {
          reject(request.error ?? new Error("Failed to read history"))
        }

        tx.oncomplete = () => {
          db.close()
        }

        tx.onabort = () => {
          reject(tx.error ?? new Error("Read transaction aborted"))
          db.close()
        }
      })
    },
    [CHAT_HISTORY_STORE_NAME, openHistoryDb],
  )

  const writeHistory = useCallback(
    async (currentUserId: string, nextMessagesByPeer: Record<string, ChatMessage[]>) => {
      const db = await openHistoryDb()

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CHAT_HISTORY_STORE_NAME, "readwrite")
        const store = tx.objectStore(CHAT_HISTORY_STORE_NAME)
        store.put({
          userId: currentUserId,
          messagesByPeer: nextMessagesByPeer,
          updatedAt: Date.now(),
        })

        tx.oncomplete = () => {
          db.close()
          resolve()
        }

        tx.onerror = () => {
          reject(tx.error ?? new Error("Failed to persist history"))
          db.close()
        }

        tx.onabort = () => {
          reject(tx.error ?? new Error("Write transaction aborted"))
          db.close()
        }
      })
    },
    [CHAT_HISTORY_STORE_NAME, openHistoryDb],
  )

  const appendMessage = useCallback(
    (incoming: ChatMessage) => {
      const peerId = incoming.group_id
        ? `group:${incoming.group_id}`
        : (incoming.from_user_id === userId ? incoming.to_user_id : incoming.from_user_id)

      setMessagesByPeer((prev) => {
        const existing = prev[peerId] || []
        if (existing.some((m) => m.id === incoming.id)) {
          return prev
        }

        return {
          ...prev,
          [peerId]: [...existing, incoming],
        }
      })
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

  const schedulePendingSendTimeout = useCallback((messageId: string, clientMessageId: string) => {
    if (!messageId || !clientMessageId) {
      return
    }

    clearPendingSendTimeout(clientMessageId)

    pendingSendTimeoutsRef.current[clientMessageId] = setTimeout(() => {
      delete pendingSendTimeoutsRef.current[clientMessageId]
      markOutgoingMessageAsFailed({
        messageId,
        clientMessageId,
        reason: "No server response. Please retry.",
      })
    }, SEND_CONFIRM_TIMEOUT_MS)
  }, [SEND_CONFIRM_TIMEOUT_MS, clearPendingSendTimeout, markOutgoingMessageAsFailed])

  const clearPendingRetryByClientMessageId = useCallback((clientMessageId: string) => {
    if (!clientMessageId) {
      return
    }

    Object.entries(pendingRetryEventsRef.current).forEach(([messageId, event]) => {
      if (event.type !== "send_message") {
        return
      }

      if (event.client_message_id === clientMessageId) {
        delete pendingRetryEventsRef.current[messageId]
      }
    })
  }, [])

  const flushPendingRetryEvents = useCallback(() => {
    if (socketRef.current?.readyState !== WebSocket.OPEN || !isWsRegisteredRef.current) {
      return
    }

    const pendingEntries = Object.entries(pendingRetryEventsRef.current)
    pendingEntries.forEach(([messageId, event]) => {
      const sent = sendEvent(event)
      if (sent) {
        if (event.type === "send_message" && event.client_message_id) {
          schedulePendingSendTimeout(messageId, event.client_message_id)
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
          const receivedIds: string[] = []
          data.messages.forEach((msg) => {
            const normalized = normalizeIncomingMessage(msg as Partial<ChatMessage> & Record<string, unknown>)
            if (!normalized) {
              return
            }

            appendMessage(normalized)
            if (normalized.to_user_id === userId) {
              receivedIds.push(normalized.id)
            }
          })

          if (receivedIds.length > 0) {
            sendEvent({ type: "ack", message_ids: receivedIds })
          }
          return
        }

        if (data.type === "group_inbox") {
          const receivedIds: string[] = []
          data.messages.forEach((msg) => {
            const normalized = normalizeIncomingMessage(msg as Partial<ChatMessage> & Record<string, unknown>)
            if (!normalized) {
              return
            }

            appendMessage(normalized)
            receivedIds.push(normalized.id)
          })

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
            const peerId = normalized.to_user_id
            serverMessagePeerRef.current[normalized.id] = peerId
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
            const peerId = normalized.group_id ? `group:${normalized.group_id}` : normalized.to_user_id
            serverMessagePeerRef.current[normalized.id] = peerId
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

          clearPendingSendTimeout(data.client_message_id)
          clearPendingRetryByClientMessageId(data.client_message_id)

          setMessagesByPeer((prev) => {
            let changed = false
            const next: Record<string, ChatMessage[]> = { ...prev }

            Object.entries(prev).forEach(([peerId, messages]) => {
              let peerChanged = false
              const hasServerMessageAlready = messages.some((msg) => msg.id === data.message_id)

              const updatedMessages = messages.flatMap((msg) => {
                const matchesQueuedMessage = msg.id === data.client_message_id
                  || msg.client_message_id === data.client_message_id

                if (!matchesQueuedMessage) {
                  return [msg]
                }

                if (hasServerMessageAlready) {
                  peerChanged = true
                  changed = true
                  return []
                }

                peerChanged = true
                changed = true
                serverMessagePeerRef.current[data.message_id] = peerId

                return [{
                  ...msg,
                  id: data.message_id,
                  delivery_status: "sent" as const,
                  error_message: undefined,
                }]
              })

              if (peerChanged) {
                next[peerId] = updatedMessages
              }
            })

            return changed ? next : prev
          })
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

          const normalizedQueuedGroupId = data.group_id.trim().toLowerCase()

          clearPendingSendTimeout(data.client_message_id)
          clearPendingRetryByClientMessageId(data.client_message_id)

          setMessagesByPeer((prev) => {
            let changed = false
            const next: Record<string, ChatMessage[]> = { ...prev }

            Object.entries(prev).forEach(([peerId, messages]) => {
              let peerChanged = false
              const hasServerMessageAlready = messages.some((msg) => msg.id === data.message_id)

              const updatedMessages = messages.flatMap((msg) => {
                const matchesQueuedMessage = msg.id === data.client_message_id
                  || msg.client_message_id === data.client_message_id

                if (!matchesQueuedMessage) {
                  return [msg]
                }

                if (hasServerMessageAlready) {
                  peerChanged = true
                  changed = true
                  return []
                }

                peerChanged = true
                changed = true
                serverMessagePeerRef.current[data.message_id] = peerId

                return [{
                  ...msg,
                  id: data.message_id,
                  group_id: normalizedQueuedGroupId,
                  to_user_id: `group:${normalizedQueuedGroupId}`,
                  delivery_status: "sent" as const,
                  error_message: undefined,
                }]
              })

              if (peerChanged) {
                next[peerId] = updatedMessages
              }
            })

            return changed ? next : prev
          })
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
          if (data.message_id || data.client_message_id) {
            markOutgoingMessageAsFailed({
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
    markOutgoingMessageAsFailed,
    markOutgoingMessageAsDelivered,
    normalizeIncomingMessage,
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

          serverMessagePeerRef.current = nextPeerByServerId
          setMessagesByPeer(hydrated)
        }
      })
      .catch(() => {
        historyHydratedRef.current = true
        if (!isCancelled) {
          setMessagesByPeer({})
        }
      })

    return () => {
      isCancelled = true
    }
  }, [readHistory, userId])

  useEffect(() => {
    if (!userId || !historyHydratedRef.current) {
      return
    }

    void writeHistory(userId, messagesByPeer).catch(() => {
      // Ignore storage failures and keep chat usable.
    })
  }, [messagesByPeer, userId, writeHistory])

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

      const clientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

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
      const sent = sendEvent({
        type: "send_message",
        to_user_id: toUserId,
        text: trimmed,
        client_message_id: clientMessageId,
      })

      if (!sent) {
        markOutgoingMessageAsFailed({
          clientMessageId,
          reason: "Message could not be queued. Please retry.",
        })
      } else {
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
      }
    },
    [appendMessage, markOutgoingMessageAsFailed, schedulePendingSendTimeout, sendEvent, userId],
  )

  const sendImageMessage = useCallback(
    (toUserId: string, imageDataUrl: string) => {
      const normalizedImage = imageDataUrl.trim()
      if (!normalizedImage || !toUserId || !userId) return

      const clientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

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
      const sent = sendEvent({
        type: "send_message",
        to_user_id: toUserId,
        text: "",
        image_data_url: normalizedImage,
        client_message_id: clientMessageId,
      })

      if (!sent) {
        markOutgoingMessageAsFailed({
          clientMessageId,
          reason: "Image could not be queued. Please retry.",
        })
      } else {
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
      }
    },
    [appendMessage, markOutgoingMessageAsFailed, schedulePendingSendTimeout, sendEvent, userId],
  )

  const sendGroupMessage = useCallback(
    (groupId: string, text: string) => {
      const normalizedGroupId = groupId.trim().toLowerCase()
      const trimmed = text.trim()
      if (!normalizedGroupId || !trimmed || !userId) return

      const clientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const groupConversationId = `group:${normalizedGroupId}`

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
      const sent = sendEvent({
        type: "send_group_message",
        group_id: normalizedGroupId,
        text: trimmed,
        client_message_id: clientMessageId,
      })

      if (!sent) {
        markOutgoingMessageAsFailed({
          clientMessageId,
          reason: "Message could not be queued. Please retry.",
        })
      } else {
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
      }
    },
    [appendMessage, markOutgoingMessageAsFailed, schedulePendingSendTimeout, sendEvent, userId],
  )

  const sendGroupImageMessage = useCallback(
    (groupId: string, imageDataUrl: string) => {
      const normalizedGroupId = groupId.trim().toLowerCase()
      const normalizedImage = imageDataUrl.trim()
      if (!normalizedGroupId || !normalizedImage || !userId) return

      const clientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const groupConversationId = `group:${normalizedGroupId}`

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
      const sent = sendEvent({
        type: "send_group_message",
        group_id: normalizedGroupId,
        text: "",
        image_data_url: normalizedImage,
        client_message_id: clientMessageId,
      })

      if (!sent) {
        markOutgoingMessageAsFailed({
          clientMessageId,
          reason: "Image could not be queued. Please retry.",
        })
      } else {
        schedulePendingSendTimeout(clientMessageId, clientMessageId)
      }
    },
    [appendMessage, markOutgoingMessageAsFailed, schedulePendingSendTimeout, sendEvent, userId],
  )

  const retryMessage = useCallback((messageId: string) => {
    const normalizedMessageId = messageId.trim()
    if (!normalizedMessageId || !userId) {
      return false
    }

    let eventToSend: WsClientEvent | null = null
    let retried = false
    let retryQueueKey = normalizedMessageId
    let retryClientMessageId = ""

    setMessagesByPeer((prev) => {
      const next: Record<string, ChatMessage[]> = { ...prev }

      for (const [peerId, messages] of Object.entries(prev)) {
        const targetIndex = messages.findIndex((msg) => msg.id === normalizedMessageId)
        if (targetIndex < 0) {
          continue
        }

        const target = messages[targetIndex]
        if (target.from_user_id !== userId || target.delivery_status !== "failed") {
          return prev
        }

        const newClientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

        const nextMessages = [...messages]
        nextMessages[targetIndex] = {
          ...target,
          id: newClientMessageId,
          client_message_id: newClientMessageId,
          delivery_status: "sending",
          error_message: undefined,
        }
        next[peerId] = nextMessages

        delete serverMessagePeerRef.current[target.id]

        if (target.group_id || target.to_user_id.startsWith("group:")) {
          const nextGroupId = target.group_id || target.to_user_id.replace(/^group:/, "")
          eventToSend = {
            type: "send_group_message",
            group_id: nextGroupId,
            text: target.text,
            image_data_url: target.image_data_url,
            client_message_id: newClientMessageId,
          }
        } else {
          eventToSend = {
            type: "send_message",
            to_user_id: target.to_user_id,
            text: target.text,
            image_data_url: target.image_data_url,
            client_message_id: newClientMessageId,
          }
        }
        retried = true
        retryQueueKey = newClientMessageId
        retryClientMessageId = newClientMessageId

        return next
      }

      return prev
    })

    if (!retried || !eventToSend) {
      return false
    }

    const canSendNow = socketRef.current?.readyState === WebSocket.OPEN && isWsRegisteredRef.current
    if (!canSendNow) {
      pendingRetryEventsRef.current[retryQueueKey] = eventToSend
      connectRef.current()
      return true
    }

    const sent = sendEvent(eventToSend)
    if (!sent) {
      pendingRetryEventsRef.current[retryQueueKey] = eventToSend
      connectRef.current()
      return true
    }

    if (retryClientMessageId) {
      schedulePendingSendTimeout(retryQueueKey, retryClientMessageId)
    }

    return true
  }, [schedulePendingSendTimeout, sendEvent, userId])

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
        if (typeof window === "undefined" || !("indexedDB" in window)) {
          return
        }

        const db = await openHistoryDb()
        const tx = db.transaction(CHAT_HISTORY_STORE_NAME, "readwrite")
        const store = tx.objectStore(CHAT_HISTORY_STORE_NAME)
        const getRequest = store.get(userId)

        getRequest.onsuccess = () => {
          const record = getRequest.result as
            | { userId: string; messagesByPeer: Record<string, ChatMessage[]> }
            | undefined

          if (record) {
            const nextByPeer = { ...record.messagesByPeer }

            for (const key of Object.keys(nextByPeer)) {
              if (key.trim().toLowerCase() === normalizedPeerId) {
                delete nextByPeer[key]
                break
              }
            }

            store.put({
              userId,
              messagesByPeer: nextByPeer,
              updatedAt: Date.now(),
            })
          }
        }

        tx.oncomplete = () => {
          db.close()
        }
      } catch {
        // Ignore IndexedDB errors
      }
    })()
  }, [clearPendingSendTimeout, userId, openHistoryDb])

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
  }, [sendEvent, toggleLocalMessageReaction, userId])

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
