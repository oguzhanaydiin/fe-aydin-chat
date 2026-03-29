import { useCallback, useEffect, useRef } from "react"
import type { ConnectionStatus } from "@/utils/chatTypes"
import { normalizeIdentity } from "@/utils/identity"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import {
  acceptFriendRequestAction,
  fetchAllUsersRequest,
  fetchFriendSnapshotRequest,
  removeFriendAction,
  resetFriendshipState as resetFriendshipStateAction,
  sendFriendRequestAction,
  setAddUserModalOpen,
} from "@/store/features/friendshipSlice"

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
  const dispatch = useAppDispatch()
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    friendActionLoading,
    friendActionError,
    isAddUserModalOpen,
    allUsers,
    allUsersLoading,
    allUsersError,
  } = useAppSelector((state) => state.friendship)

  const knownAcceptedFriendsRef = useRef<Set<string>>(new Set())
  const friendsInitializedRef = useRef(false)

  const applyAcceptedFriendsEffects = useCallback((accepted: string[]) => {
    if (friendsInitializedRef.current) {
      const newlyAccepted = accepted.filter((friend) => !knownAcceptedFriendsRef.current.has(friend))
      if (newlyAccepted.length > 0) {
        setTargetUser(newlyAccepted[0])
      }
    }

    knownAcceptedFriendsRef.current = new Set(accepted)
    friendsInitializedRef.current = true
  }, [setTargetUser])

  useEffect(() => {
    applyAcceptedFriendsEffects(friends)
  }, [applyAcceptedFriendsEffects, friends])

  useEffect(() => {
    let cancelled = false

    if (!token || !userId) {
      queueMicrotask(() => {
        if (!cancelled) {
          dispatch(resetFriendshipStateAction())
        }
      })

      return () => {
        cancelled = true
      }
    }

    void dispatch(fetchFriendSnapshotRequest(token))

    return () => {
      cancelled = true
    }
  }, [dispatch, token, userId])

  useEffect(() => {
    if (wsStatus !== "open" || !token) {
      return
    }

    void dispatch(fetchFriendSnapshotRequest(token))
  }, [dispatch, wsStatus, token])

  const onOpenAddUserModal = async () => {
    if (!token) {
      return
    }

    dispatch(setAddUserModalOpen(true))
    await dispatch(fetchAllUsersRequest({ token, userId, displayName }))
  }

  const onCloseAddUserModal = () => {
    dispatch(setAddUserModalOpen(false))
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

    await dispatch(sendFriendRequestAction({ token, friendId: candidate }))
  }

  const onAcceptFriendRequest = async (fromUsername: string) => {
    if (!token) {
      return
    }

    const normalized = normalizeIdentity(fromUsername)
    if (!normalized) {
      return
    }

    const action = await dispatch(acceptFriendRequestAction({ token, fromUsername: normalized }))
    if (acceptFriendRequestAction.fulfilled.match(action)) {
      setTargetUser(normalized)
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

    const action = await dispatch(removeFriendAction({ token, friendUsername: normalized }))
    if (removeFriendAction.fulfilled.match(action)) {
      clearChat(normalized)

      if (targetUser && normalizeIdentity(targetUser) === normalized) {
        setTargetUser(null)
        setMessage("")
      }
    }
  }

  const resetFriendshipState = useCallback(() => {
    dispatch(resetFriendshipStateAction())
    knownAcceptedFriendsRef.current = new Set()
    friendsInitializedRef.current = false
  }, [dispatch])

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
