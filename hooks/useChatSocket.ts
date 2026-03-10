"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChatMessage, ConnectionStatus, WsClientEvent, WsServerEvent } from "@/lib/chat/types"

interface UseChatSocketOptions {
  userId: string
  token: string
  wsUrl: string
}

export function useChatSocket({ userId, token, wsUrl }: UseChatSocketOptions) {
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
            appendMessage(msg)
            if (msg.to_user_id === userId) {
              receivedIds.push(msg.id)
            }
          })

          if (receivedIds.length > 0) {
            sendEvent({ type: "ack", message_ids: receivedIds })
          }
          return
        }

        if (data.type === "new_message") {
          appendMessage(data.message)

          if (data.message.to_user_id === userId) {
            sendEvent({ type: "ack", message_ids: [data.message.id] })
          }
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
  }, [appendMessage, scheduleReconnect, sendEvent, token, userId, wsUrl])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    historyHydratedRef.current = false
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
          setMessagesByPeer(savedHistory ?? {})
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

      const localMessage: ChatMessage = {
        id: `local-${Date.now()}`,
        from_user_id: userId,
        to_user_id: toUserId,
        text: trimmed,
        created_at: new Date().toISOString(),
      }

      appendMessage(localMessage)
      sendEvent({
        type: "send_message",
        to_user_id: toUserId,
        text: trimmed,
        client_message_id: localMessage.id,
      })
    },
    [appendMessage, sendEvent, userId],
  )

  return {
    onlineUsers,
    messagesByPeer,
    isConnected,
    status,
    error,
    sendMessage,
  }
}
