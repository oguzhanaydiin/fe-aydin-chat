import { useCallback, useEffect, useRef, useState } from "react"
import {
  acceptFriendRequest,
  fetchAllUsers,
  fetchFriendSnapshot,
  removeFriend,
  sendFriendRequest,
} from "@/utils/chatApi"
import type { ConnectionStatus, FriendSnapshot } from "@/utils/chatTypes"
import { normalizeIdentity } from "@/utils/identity"

interface UseFriendshipOptions {
  token: string
  userId: string
  displayName: string
  wsStatus: ConnectionStatus
  targetUser: string | null
  setTargetUser: (value: string | null) => void
  setMessage: (value: string) => void
  clearChat: (peerId: string) => void
}

export function useFriendship({
  token,
  userId,
  displayName,
  wsStatus,
  targetUser,
  setTargetUser,
  setMessage,
  clearChat,
}: UseFriendshipOptions) {
  const [friends, setFriends] = useState<string[]>([])
  const [incomingRequests, setIncomingRequests] = useState<string[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<string[]>([])
  const [friendActionLoading, setFriendActionLoading] = useState(false)
  const [friendActionError, setFriendActionError] = useState<string | null>(null)
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<string[]>([])
  const [allUsersLoading, setAllUsersLoading] = useState(false)
  const [allUsersError, setAllUsersError] = useState<string | null>(null)

  const knownAcceptedFriendsRef = useRef<Set<string>>(new Set())
  const friendsInitializedRef = useRef(false)

  const applyFriendSnapshot = useCallback((snapshot: FriendSnapshot) => {
    const accepted = Array.from(new Set(snapshot.accepted_friends.map((item) => normalizeIdentity(item))))
    const incoming = Array.from(new Set(snapshot.incoming_requests.map((item) => normalizeIdentity(item))))
    const outgoing = Array.from(new Set(snapshot.outgoing_requests.map((item) => normalizeIdentity(item))))

    if (friendsInitializedRef.current) {
      const newlyAccepted = accepted.filter((friend) => !knownAcceptedFriendsRef.current.has(friend))
      if (newlyAccepted.length > 0) {
        setTargetUser(newlyAccepted[0])
      }
    }

    knownAcceptedFriendsRef.current = new Set(accepted)
    friendsInitializedRef.current = true

    setFriends(accepted)
    setIncomingRequests(incoming)
    setOutgoingRequests(outgoing)
  }, [setTargetUser])

  useEffect(() => {
    let cancelled = false

    if (!token || !userId) {
      queueMicrotask(() => {
        if (!cancelled) {
          setFriends([])
          setIncomingRequests([])
          setOutgoingRequests([])
        }
      })

      return () => {
        cancelled = true
      }
    }

    void fetchFriendSnapshot(token)
      .then((snapshot) => {
        if (!cancelled) {
          applyFriendSnapshot(snapshot)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFriendActionError(err instanceof Error ? err.message : "Could not load friends")
        }
      })

    return () => {
      cancelled = true
    }
  }, [applyFriendSnapshot, token, userId])

  useEffect(() => {
    if (wsStatus !== "open" || !token) {
      return
    }

    void fetchFriendSnapshot(token)
      .then((snapshot) => applyFriendSnapshot(snapshot))
      .catch(() => { })
  }, [wsStatus, applyFriendSnapshot, token])

  const onOpenAddUserModal = async () => {
    if (!token) {
      return
    }

    setIsAddUserModalOpen(true)
    setAllUsersLoading(true)
    setAllUsersError(null)

    try {
      const users = await fetchAllUsers(token)
      const normalizedSelf = normalizeIdentity(displayName || userId)
      const deduped = Array.from(new Set(users))
      const filtered = deduped.filter((candidate) => normalizeIdentity(candidate) !== normalizedSelf)
      setAllUsers(filtered)
    } catch (err) {
      setAllUsers([])
      setAllUsersError(err instanceof Error ? err.message : "Could not load users")
    } finally {
      setAllUsersLoading(false)
    }
  }

  const onCloseAddUserModal = () => {
    setIsAddUserModalOpen(false)
  }

  const onSendFriendRequest = async (friendId: string) => {
    if (!token) {
      return
    }

    const candidate = friendId.trim()
    if (!candidate) {
      return
    }

    const normalizedCandidate = normalizeIdentity(candidate)
    const normalizedSelf = normalizeIdentity(displayName || userId)
    if (normalizedCandidate === normalizedSelf) {
      return
    }

    setFriendActionLoading(true)
    setFriendActionError(null)

    try {
      await sendFriendRequest(token, candidate)
      const snapshot = await fetchFriendSnapshot(token)
      applyFriendSnapshot(snapshot)
      setIsAddUserModalOpen(false)
    } catch (err) {
      setFriendActionError(err instanceof Error ? err.message : "Could not send friend request")
    } finally {
      setFriendActionLoading(false)
    }
  }

  const onAcceptFriendRequest = async (fromUsername: string) => {
    if (!token) {
      return
    }

    const normalized = normalizeIdentity(fromUsername)
    if (!normalized) {
      return
    }

    setFriendActionLoading(true)
    setFriendActionError(null)

    try {
      await acceptFriendRequest(token, normalized)

      const snapshot = await fetchFriendSnapshot(token)
      applyFriendSnapshot(snapshot)
      setTargetUser(normalized)
    } catch (err) {
      setFriendActionError(err instanceof Error ? err.message : "Could not accept friend request")
    } finally {
      setFriendActionLoading(false)
    }
  }

  const onRemoveFriend = async (friendUsername: string) => {
    if (!token) {
      return
    }

    const normalized = normalizeIdentity(friendUsername)
    if (!normalized) {
      return
    }

    setFriendActionLoading(true)
    setFriendActionError(null)

    try {
      await removeFriend(token, normalized)

      clearChat(normalized)
      setFriends((prev) => prev.filter((item) => normalizeIdentity(item) !== normalized))
      setIncomingRequests((prev) => prev.filter((item) => normalizeIdentity(item) !== normalized))
      setOutgoingRequests((prev) => prev.filter((item) => normalizeIdentity(item) !== normalized))

      if (targetUser && normalizeIdentity(targetUser) === normalized) {
        setTargetUser(null)
        setMessage("")
      }

      const snapshot = await fetchFriendSnapshot(token)
      applyFriendSnapshot(snapshot)
    } catch (err) {
      setFriendActionError(err instanceof Error ? err.message : "Could not remove friend")
    } finally {
      setFriendActionLoading(false)
    }
  }

  const resetFriendshipState = useCallback(() => {
    setFriends([])
    setIncomingRequests([])
    setOutgoingRequests([])
    knownAcceptedFriendsRef.current = new Set()
    friendsInitializedRef.current = false
    setFriendActionLoading(false)
    setFriendActionError(null)
    setIsAddUserModalOpen(false)
    setAllUsers([])
    setAllUsersLoading(false)
    setAllUsersError(null)
  }, [])

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    friendActionLoading,
    friendActionError,
    isAddUserModalOpen,
    allUsers,
    allUsersLoading,
    allUsersError,
    onOpenAddUserModal,
    onCloseAddUserModal,
    onSendFriendRequest,
    onAcceptFriendRequest,
    onRemoveFriend,
    resetFriendshipState,
  }
}
