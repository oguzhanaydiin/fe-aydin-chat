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
