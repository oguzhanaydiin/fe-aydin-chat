import type { ChatMessage, WsClientEvent } from "./chatTypes.ts"
import { canMessagePeer } from "./identity.ts"

export type MessagesByPeer = Record<string, ChatMessage[]>
export type ServerMessagePeerMap = Record<string, string>

export type StatusUpdateResult = {
  messagesByPeer: MessagesByPeer
  peerMapUpdates: ServerMessagePeerMap
  peerMapDeletes: string[]
  changed: boolean
}

function unchanged(prev: MessagesByPeer): StatusUpdateResult {
  return {
    messagesByPeer: prev,
    peerMapUpdates: {},
    peerMapDeletes: [],
    changed: false,
  }
}

export function peerIdForMessage(message: ChatMessage, userId: string): string {
  if (message.group_id) {
    return `group:${message.group_id}`
  }
  return message.from_user_id === userId ? message.to_user_id : message.from_user_id
}

export function appendMessageToPeer(
  prev: MessagesByPeer,
  incoming: ChatMessage,
  userId: string,
): MessagesByPeer {
  const peerId = peerIdForMessage(incoming, userId)
  const existing = prev[peerId] || []
  if (existing.some((msg) => msg.id === incoming.id)) {
    return prev
  }

  return {
    ...prev,
    [peerId]: [...existing, incoming],
  }
}

export function applyOutgoingDelivered(
  prev: MessagesByPeer,
  peerMap: ServerMessagePeerMap,
  userId: string,
  messageId: string,
  clientMessageId?: string,
): StatusUpdateResult {
  if (!messageId && !clientMessageId) {
    return unchanged(prev)
  }

  let changed = false
  const next: MessagesByPeer = { ...prev }
  const peerMapUpdates: ServerMessagePeerMap = {}

  const peerId = peerMap[messageId]
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
          peerMapUpdates[messageId] = currentPeerId

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

  return {
    messagesByPeer: changed ? next : prev,
    peerMapUpdates,
    peerMapDeletes: [],
    changed,
  }
}

export function applyOutgoingFailed(
  prev: MessagesByPeer,
  userId: string,
  params: { messageId?: string, clientMessageId?: string, reason?: string },
): StatusUpdateResult {
  const { messageId, clientMessageId, reason } = params
  if (!messageId && !clientMessageId) {
    return unchanged(prev)
  }

  const normalizedReason = reason?.trim()
  let changed = false
  const next: MessagesByPeer = { ...prev }

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

  return {
    messagesByPeer: changed ? next : prev,
    peerMapUpdates: {},
    peerMapDeletes: [],
    changed,
  }
}

export function applyLatestOutgoingSendingFailed(
  prev: MessagesByPeer,
  userId: string,
  reason?: string,
): StatusUpdateResult {
  const normalizedReason = reason?.trim()
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
    return unchanged(prev)
  }

  const targetMessages = prev[latestPeerId]
  const targetMessage = targetMessages[latestIndex]
  if (!targetMessage) {
    return unchanged(prev)
  }

  const nextMessages = [...targetMessages]
  nextMessages[latestIndex] = {
    ...targetMessage,
    delivery_status: "failed",
    error_message: normalizedReason,
  }

  return {
    messagesByPeer: {
      ...prev,
      [latestPeerId]: nextMessages,
    },
    peerMapUpdates: {},
    peerMapDeletes: [],
    changed: true,
  }
}

export function applyMessageQueued(
  prev: MessagesByPeer,
  messageId: string,
  clientMessageId: string,
  options?: { groupId?: string },
): StatusUpdateResult {
  if (!clientMessageId) {
    return unchanged(prev)
  }

  const normalizedGroupId = options?.groupId?.trim().toLowerCase()
  let changed = false
  const next: MessagesByPeer = { ...prev }
  const peerMapUpdates: ServerMessagePeerMap = {}

  Object.entries(prev).forEach(([peerId, messages]) => {
    let peerChanged = false
    const hasServerMessageAlready = messages.some((msg) => msg.id === messageId)

    const updatedMessages = messages.flatMap((msg) => {
      const matchesQueuedMessage = msg.id === clientMessageId
        || msg.client_message_id === clientMessageId

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
      peerMapUpdates[messageId] = peerId

      return [{
        ...msg,
        id: messageId,
        ...(normalizedGroupId
          ? {
            group_id: normalizedGroupId,
            to_user_id: `group:${normalizedGroupId}`,
          }
          : {}),
        delivery_status: "sent" as const,
        error_message: undefined,
      }]
    })

    if (peerChanged) {
      next[peerId] = updatedMessages
    }
  })

  return {
    messagesByPeer: changed ? next : prev,
    peerMapUpdates,
    peerMapDeletes: [],
    changed,
  }
}

export type RetryPlan = {
  messagesByPeer: MessagesByPeer
  event: WsClientEvent
  peerMapDeletes: string[]
  retryQueueKey: string
  retryClientMessageId: string
}

export function planFailedMessageRetry(
  prev: MessagesByPeer,
  userId: string,
  messageId: string,
  acceptedFriends: string[],
  newClientMessageId: string,
): RetryPlan | null {
  const normalizedMessageId = messageId.trim()
  if (!normalizedMessageId || !userId || !newClientMessageId) {
    return null
  }

  for (const [peerId, messages] of Object.entries(prev)) {
    const targetIndex = messages.findIndex((msg) => msg.id === normalizedMessageId)
    if (targetIndex < 0) {
      continue
    }

    const target = messages[targetIndex]
    if (target.from_user_id !== userId || target.delivery_status !== "failed") {
      return null
    }

    const next: MessagesByPeer = { ...prev }
    const nextMessages = [...messages]
    nextMessages[targetIndex] = {
      ...target,
      id: newClientMessageId,
      client_message_id: newClientMessageId,
      delivery_status: "sending",
      error_message: undefined,
    }
    next[peerId] = nextMessages

    let event: WsClientEvent
    if (target.group_id || target.to_user_id.startsWith("group:")) {
      const nextGroupId = target.group_id || target.to_user_id.replace(/^group:/, "")
      event = {
        type: "send_group_message",
        group_id: nextGroupId,
        text: target.text,
        image_data_url: target.image_data_url,
        client_message_id: newClientMessageId,
      }
    } else {
      if (!canMessagePeer(target.to_user_id, acceptedFriends)) {
        return null
      }

      event = {
        type: "send_message",
        to_user_id: target.to_user_id,
        text: target.text,
        image_data_url: target.image_data_url,
        client_message_id: newClientMessageId,
      }
    }

    return {
      messagesByPeer: next,
      event,
      peerMapDeletes: [target.id],
      retryQueueKey: newClientMessageId,
      retryClientMessageId: newClientMessageId,
    }
  }

  return null
}

/** Inbox DM ack: only messages addressed to me. */
export function dmInboxAckIds(messages: ChatMessage[], userId: string): string[] {
  return messages
    .filter((msg) => msg.to_user_id === userId && msg.id)
    .map((msg) => msg.id)
}

/** Group inbox ack: all received message ids. */
export function groupInboxAckIds(messages: ChatMessage[]): string[] {
  return messages.map((msg) => msg.id).filter(Boolean)
}
