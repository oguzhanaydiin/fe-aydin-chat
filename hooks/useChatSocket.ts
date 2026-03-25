"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChatMessage, ConnectionStatus, WsClientEvent, WsServerEvent } from "@/lib/chat/types"

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

  const normalizeIncomingMessage = useCallback((incoming: Partial<ChatMessage> & Record<string, unknown>): ChatMessage | null => {
    const id = typeof incoming.id === "string" ? incoming.id : ""
    const fromUserId = typeof incoming.from_user_id === "string"
      ? incoming.from_user_id
      : (typeof incoming.from_username === "string" ? incoming.from_username : "")
    const toUserId = typeof incoming.to_user_id === "string"
      ? incoming.to_user_id
      : (typeof incoming.to_username === "string" ? incoming.to_username : "")
    const createdAt = typeof incoming.created_at === "string" ? incoming.created_at : new Date().toISOString()
    const text = typeof incoming.text === "string" ? incoming.text : ""
    const imageDataUrl = typeof incoming.image_data_url === "string" ? incoming.image_data_url : undefined
    const heartedBy = Array.isArray(incoming.hearted_by)
      ? incoming.hearted_by.filter((entry): entry is string => typeof entry === "string")
      : undefined
    const clientMessageId = typeof incoming.client_message_id === "string" ? incoming.client_message_id : undefined
    const deliveryStatus = incoming.delivery_status === "sending" || incoming.delivery_status === "sent" || incoming.delivery_status === "delivered"
      ? incoming.delivery_status
      : undefined

    if (!id || !fromUserId || !toUserId) {
      return null
    }

    return {
      id,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      text,
      image_data_url: imageDataUrl,
      hearted_by: heartedBy,
      created_at: createdAt,
      client_message_id: clientMessageId,
      delivery_status: deliveryStatus,
    }
  }, [])

  const applyHeartReaction = useCallback((messageId: string, byUsername: string) => {
    if (!messageId || !byUsername) return

    const normalizedBy = byUsername.trim().toLowerCase()
    if (!normalizedBy) return

    setMessagesByPeer((prev) => {
      let changed = false
      const next: Record<string, ChatMessage[]> = { ...prev }

      Object.entries(prev).forEach(([peerId, messages]) => {
        let peerChanged = false

        const updatedMessages = messages.map((msg) => {
          if (msg.id !== messageId) {
            return msg
          }

          const currentHeartedBy = msg.hearted_by ?? []
          if (currentHeartedBy.includes(normalizedBy)) {
            return msg
          }

          changed = true
          peerChanged = true

          return {
            ...msg,
            hearted_by: [...currentHeartedBy, normalizedBy],
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
            return { ...msg, delivery_status: "delivered" as const }
          }

          return msg
        })

        if (peerChanged) {
          next[peerId] = updatedMessages
        }
      } else if (clientMessageId) {
        Object.entries(prev).forEach(([currentPeerId, messages]) => {
          let peerChanged = false

          const updatedMessages = messages.map((msg) => {
            if (msg.id === clientMessageId && msg.from_user_id === userId && msg.delivery_status !== "delivered") {
              peerChanged = true
              changed = true
              serverMessagePeerRef.current[messageId] = currentPeerId

              return {
                ...msg,
                id: messageId,
                client_message_id: clientMessageId,
                delivery_status: "delivered" as const,
              }
            }

            return msg
          })

          if (peerChanged) {
            next[currentPeerId] = updatedMessages
          }
        })
      }

      return changed ? next : prev
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
      const peerId = incoming.from_user_id === userId ? incoming.to_user_id : incoming.from_user_id

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

        if (data.type === "message_hearted") {
          applyHeartReaction(data.message_id, data.by_username)
          return
        }

        if (data.type === "message_queued") {
          if (!data.client_message_id) {
            return
          }

          setMessagesByPeer((prev) => {
            let changed = false
            const next: Record<string, ChatMessage[]> = { ...prev }

            Object.entries(prev).forEach(([peerId, messages]) => {
              let peerChanged = false

              const updatedMessages = messages.map((msg) => {
                if (msg.id !== data.client_message_id) {
                  return msg
                }

                peerChanged = true
                changed = true
                serverMessagePeerRef.current[data.message_id] = peerId

                return {
                  ...msg,
                  id: data.message_id,
                  delivery_status: "sent" as const,
                }
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
          markOutgoingMessageAsDelivered(data.message_id, data.client_message_id)
          return
        }

        if (data.type === "ack_result") {
          return
        }

        if (data.type === "error") {
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
      setIsConnected(false)
      setStatus("closed")
      socketRef.current = null

      if (shouldReconnectRef.current) {
        scheduleReconnect()
      }
    }
  }, [
    applyHeartReaction,
    appendMessage,
    markOutgoingMessageAsDelivered,
    normalizeIncomingMessage,
    scheduleReconnect,
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
      sendEvent({
        type: "send_message",
        to_user_id: toUserId,
        text: trimmed,
        client_message_id: clientMessageId,
      })
    },
    [appendMessage, sendEvent, userId],
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
      sendEvent({
        type: "send_message",
        to_user_id: toUserId,
        text: "",
        image_data_url: normalizedImage,
        client_message_id: clientMessageId,
      })
    },
    [appendMessage, sendEvent, userId],
  )

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
  }, [userId, openHistoryDb])

  const sendHeartMessage = useCallback((toUserId: string, messageId: string) => {
    const normalizedTo = toUserId.trim().toLowerCase()
    const normalizedMessageId = messageId.trim()
    const normalizedUserId = userId.trim().toLowerCase()
    if (!normalizedTo || !normalizedMessageId || !normalizedUserId) {
      return
    }

    applyHeartReaction(normalizedMessageId, normalizedUserId)
    sendEvent({
      type: "heart_message",
      message_id: normalizedMessageId,
      to_username: normalizedTo,
    })
  }, [applyHeartReaction, sendEvent, userId])

  return {
    onlineUsers,
    messagesByPeer,
    isConnected,
    status,
    error,
    sendMessage,
    sendImageMessage,
    sendHeartMessage,
    clearChat,
  }
}
