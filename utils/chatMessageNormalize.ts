import type { ChatMessage } from "./chatTypes.ts"

export function normalizeReactions(
  rawReactions: unknown,
): Record<string, string[]> | undefined {
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
}

export function normalizeIncomingMessage(
  incoming: Partial<ChatMessage> & Record<string, unknown>,
): ChatMessage | null {
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
  const imageDataUrl = typeof incoming.image_data_url === "string" && incoming.image_data_url.trim()
    ? incoming.image_data_url.trim()
    : undefined
  const reactions = normalizeReactions(incoming.reactions)
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
}
