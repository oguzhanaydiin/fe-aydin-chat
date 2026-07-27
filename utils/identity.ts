export function normalizeIdentity(value: string) {
  return value.trim().toLowerCase()
}

/** Direct messages are friends-only; group conversations use the `group:` prefix. */
export function canMessagePeer(peerId: string | null | undefined, acceptedFriends: string[]) {
  const normalizedPeer = typeof peerId === "string" ? peerId.trim() : ""
  if (!normalizedPeer) {
    return false
  }

  if (normalizedPeer.startsWith("group:")) {
    return normalizedPeer.slice("group:".length).trim().length > 0
  }

  const peerKey = normalizeIdentity(normalizedPeer)
  return acceptedFriends.some((friend) => normalizeIdentity(friend) === peerKey)
}

