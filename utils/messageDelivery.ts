import type { ChatMessage } from "./chatTypes.ts"
import { CHAT_HISTORY_MAX_MESSAGES_PER_PEER } from "./chatConfig.ts"

/** Cap per-peer history for IndexedDB; keeps newest messages including image payloads. */
export function pruneHistoryForStorage(
  messagesByPeer: Record<string, ChatMessage[]>,
  maxPerPeer: number = CHAT_HISTORY_MAX_MESSAGES_PER_PEER,
): Record<string, ChatMessage[]> {
  const pruned: Record<string, ChatMessage[]> = {}
  Object.entries(messagesByPeer).forEach(([peerId, messages]) => {
    pruned[peerId] = messages.slice(-maxPerPeer)
  })
  return pruned
}

/**
 * Merge hydrated IndexedDB history with live in-memory messages.
 * Live rows win on the same `id` so inbox/optimistic state is not wiped by a late hydrate.
 */
export function mergeMessagesByPeer(
  hydrated: Record<string, ChatMessage[]>,
  live: Record<string, ChatMessage[]>,
): Record<string, ChatMessage[]> {
  const peerIds = new Set([
    ...Object.keys(hydrated),
    ...Object.keys(live),
  ])
  const merged: Record<string, ChatMessage[]> = {}

  peerIds.forEach((peerId) => {
    const byId = new Map<string, ChatMessage>()
    for (const msg of hydrated[peerId] ?? []) {
      byId.set(msg.id, msg)
    }
    for (const msg of live[peerId] ?? []) {
      byId.set(msg.id, msg)
    }

    merged[peerId] = Array.from(byId.values()).sort((a, b) => {
      const aTime = Date.parse(a.created_at)
      const bTime = Date.parse(b.created_at)
      const safeA = Number.isNaN(aTime) ? 0 : aTime
      const safeB = Number.isNaN(bTime) ? 0 : bTime
      if (safeA !== safeB) {
        return safeA - safeB
      }
      return a.id.localeCompare(b.id)
    })
  })

  return merged
}

export function canSendWsNow(socketOpen: boolean, registered: boolean): boolean {
  return socketOpen && registered
}

/** Remove pending retry entries keyed by client_message_id (DM or group). */
export function clearPendingRetryByClientMessageId<T extends {
  type: string
  client_message_id?: string
}>(
  pending: Record<string, T>,
  clientMessageId: string,
): Record<string, T> {
  if (!clientMessageId) {
    return pending
  }

  const next: Record<string, T> = { ...pending }
  Object.entries(pending).forEach(([key, event]) => {
    if (
      (event.type === "send_message" || event.type === "send_group_message")
      && event.client_message_id === clientMessageId
    ) {
      delete next[key]
    }
  })
  return next
}

export function clientMessageIdFromPendingEvent(event: {
  type: string
  client_message_id?: string
}): string | undefined {
  if (event.type === "send_message" || event.type === "send_group_message") {
    return event.client_message_id
  }
  return undefined
}
