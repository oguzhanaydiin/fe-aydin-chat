import { useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, FormEvent, RefObject } from "react"
import Image from "next/image"
import type { ChatMessage, GroupDetail, GroupSummary } from "@/lib/chat/types"
import { AddFriendModal } from "@/app/components/chat/AddFriendModal"
import { ConfirmModal } from "@/app/components/chat/ConfirmModal"
import { CreateGroupModal } from "@/app/components/chat/CreateGroupModal"
import { FriendListModal } from "@/app/components/chat/FriendListModal"
import { GroupMembersModal } from "@/app/components/chat/GroupMembersModal"
import { OwnProfileModal, PeerProfileModal } from "@/app/components/chat/ProfileModal"

type MessageGroup = {
  fromUserId: string
  createdAt: string
  deliveryStatus?: "sending" | "sent" | "delivered" | "failed"
  messages: Array<{
    id: string
    text: string
    imageDataUrl?: string
    reactions?: Record<string, string[]>
    deliveryStatus?: "sending" | "sent" | "delivered" | "failed"
    errorMessage?: string
  }>
}

type ChatLayoutProps = {
  friends: string[]
  incomingRequests: string[]
  outgoingRequests: string[]
  onlineUsers: string[]
  targetUser: string | null
  displayName: string
  userId: string
  token: string
  ownAvatarDataUrl?: string | null
  ownEmail?: string
  profileLoading?: boolean
  profileError?: string | null
  message: string
  currentMessages: ChatMessage[]
  isAddUserModalOpen: boolean
  allUsers: string[]
  allUsersLoading: boolean
  allUsersError: string | null
  friendActionLoading: boolean
  friendActionError: string | null
  unreadCountsByPeer: Record<string, number>
  messagesEndRef: RefObject<HTMLDivElement | null>
  onStartChat: (otherId: string) => void
  onOpenAddUserModal: () => void
  groups: GroupSummary[]
  groupsError: string | null
  onStartGroupChat: (groupId: string) => void
  onCreateGroup: (name: string, memberUsernames: string[]) => Promise<boolean>
  onGetGroupDetail: (groupId: string) => Promise<GroupDetail | null>
  onAddGroupMember: (groupId: string, username: string) => Promise<boolean>
  onGrantInvitePermission: (groupId: string, username: string) => Promise<boolean>
  onPromoteLeader: (groupId: string, username: string) => Promise<boolean>
  onCloseAddUserModal: () => void
  onSendFriendRequest: (userId: string) => void
  onAcceptFriendRequest: (userId: string) => void
  onRemoveFriend: (userId: string) => void
  onClearChat: () => void
  onLogout: () => void
  onMessageChange: (value: string) => void
  onSendMessage: (e: FormEvent) => void
  onHeartMessage: (toUserId: string, messageId: string) => void
  onRetryMessage: (messageId: string) => boolean
  onDeleteMessage: (messageId: string) => boolean
  onSendImage: (file: File) => void | Promise<void>
  onSaveProfile: (avatarDataUrl: string | null) => void
}

function renderOutgoingStatusTick(status?: "sending" | "sent" | "delivered" | "failed") {
  if (!status || status === "sending") {
    return <span className="text-gray-200 font-semibold tracking-tight">...</span>
  }

  if (status === "failed") {
    return <span className="text-red-300 text-[11px] font-black leading-none">!</span>
  }

  if (status === "delivered") {
    return <span className="text-emerald-300 text-[11px] font-black leading-none">&#10003;</span>
  }

  return <span className="text-gray-200 text-[11px] font-black leading-none">&#10003;</span>
}

function groupMessages(currentMessages: ChatMessage[]) {
  return currentMessages.reduce<MessageGroup[]>((groups, msg) => {
    const createdAt = new Date(msg.created_at)
    const minuteKey = `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}-${createdAt.getHours()}-${createdAt.getMinutes()}`
    const lastGroup = groups[groups.length - 1]
    const lastGroupMinute = lastGroup ? new Date(lastGroup.createdAt) : null
    const lastMinuteKey = lastGroupMinute
      ? `${lastGroupMinute.getFullYear()}-${lastGroupMinute.getMonth()}-${lastGroupMinute.getDate()}-${lastGroupMinute.getHours()}-${lastGroupMinute.getMinutes()}`
      : null

    if (lastGroup && lastGroup.fromUserId === msg.from_user_id && lastMinuteKey === minuteKey) {
      lastGroup.messages.push({
        id: msg.id,
        text: msg.text,
        imageDataUrl: msg.image_data_url,
        reactions: msg.reactions,
        deliveryStatus: msg.delivery_status,
        errorMessage: msg.error_message,
      })
      lastGroup.createdAt = msg.created_at
      lastGroup.deliveryStatus = msg.delivery_status
      return groups
    }

    groups.push({
      fromUserId: msg.from_user_id,
      createdAt: msg.created_at,
      deliveryStatus: msg.delivery_status,
      messages: [{
        id: msg.id,
        text: msg.text,
        imageDataUrl: msg.image_data_url,
        reactions: msg.reactions,
        deliveryStatus: msg.delivery_status,
        errorMessage: msg.error_message,
      }],
    })

    return groups
  }, [])
}

export function ChatLayout({
  friends,
  incomingRequests,
  outgoingRequests,
  onlineUsers,
  targetUser,
  displayName,
  userId,
  token,
  ownAvatarDataUrl,
  ownEmail,
  profileLoading,
  profileError,
  message,
  currentMessages,
  isAddUserModalOpen,
  allUsers,
  allUsersLoading,
  allUsersError,
  friendActionLoading,
  friendActionError,
  unreadCountsByPeer,
  messagesEndRef,
  onStartChat,
  onOpenAddUserModal,
  groups,
  groupsError,
  onStartGroupChat,
  onCreateGroup,
  onGetGroupDetail,
  onAddGroupMember,
  onGrantInvitePermission,
  onPromoteLeader,
  onCloseAddUserModal,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onRemoveFriend,
  onClearChat,
  onLogout,
  onMessageChange,
  onSendMessage,
  onHeartMessage,
  onRetryMessage,
  onDeleteMessage,
  onSendImage,
  onSaveProfile,
}: ChatLayoutProps) {
  const groupedMessages = groupMessages(currentMessages)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const messageElementRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [friendToRemove, setFriendToRemove] = useState<string | null>(null)
  const [isFriendListModalOpen, setIsFriendListModalOpen] = useState(false)
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false)
  const [createGroupLoading, setCreateGroupLoading] = useState(false)
  const [isGroupMembersModalOpen, setIsGroupMembersModalOpen] = useState(false)
  const [groupMembersDetail, setGroupMembersDetail] = useState<GroupDetail | null>(null)
  const [groupMembersLoading, setGroupMembersLoading] = useState(false)
  const [groupMembersActionLoading, setGroupMembersActionLoading] = useState(false)
  const [isOwnProfileOpen, setIsOwnProfileOpen] = useState(false)
  const [peerProfileUsername, setPeerProfileUsername] = useState<string | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeSearchResultIndex, setActiveSearchResultIndex] = useState(-1)
  const normalizedDisplayName = displayName.trim().toLowerCase()
  const normalizedUserId = userId.trim().toLowerCase()
  const onlineUsersSet = new Set(onlineUsers.map((u) => u.trim().toLowerCase()))
  const visibleFriends = friends.filter((u) => {
    const normalized = u.trim().toLowerCase()
    return normalized !== normalizedDisplayName && normalized !== normalizedUserId
  })
  const selectedGroupId = targetUser?.startsWith("group:") ? targetUser.slice("group:".length) : null
  const selectedGroup = selectedGroupId
    ? groups.find((group) => group.group_id === selectedGroupId) ?? null
    : null

  const openGroupMembersModal = async () => {
    if (!selectedGroup) {
      return
    }

    setIsGroupMembersModalOpen(true)
    setGroupMembersLoading(true)

    try {
      const detail = await onGetGroupDetail(selectedGroup.group_id)
      setGroupMembersDetail(detail)
    } finally {
      setGroupMembersLoading(false)
    }
  }

  const refreshGroupMembersDetail = async () => {
    if (!selectedGroup) {
      return
    }

    const detail = await onGetGroupDetail(selectedGroup.group_id)
    setGroupMembersDetail(detail)
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const searchResults = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [] as Array<{ id: string }>
    }

    return currentMessages
      .filter((msg) => msg.text?.trim() && msg.text.toLowerCase().includes(normalizedSearchQuery))
      .map((msg) => ({ id: msg.id }))
  }, [currentMessages, normalizedSearchQuery])

  const searchResultIndexByMessageId = useMemo(() => {
    const next: Record<string, number> = {}
    searchResults.forEach((result, index) => {
      next[result.id] = index
    })
    return next
  }, [searchResults])

  const hasSearchQuery = normalizedSearchQuery.length > 0
  const totalSearchResults = searchResults.length

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      if (!hasSearchQuery) {
        setActiveSearchResultIndex(-1)
        return
      }

      if (totalSearchResults === 0) {
        setActiveSearchResultIndex(-1)
        return
      }

      // Default to latest hit (WhatsApp-like behavior).
      setActiveSearchResultIndex(totalSearchResults - 1)
    })

    return () => {
      cancelled = true
    }
  }, [hasSearchQuery, totalSearchResults])

  useEffect(() => {
    if (activeSearchResultIndex < 0 || activeSearchResultIndex >= totalSearchResults) {
      return
    }

    const activeResult = searchResults[activeSearchResultIndex]
    const targetElement = messageElementRefs.current[activeResult.id]
    targetElement?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [activeSearchResultIndex, searchResults, totalSearchResults])

  useEffect(() => {
    if (!isSearchOpen) {
      return
    }

    searchInputRef.current?.focus()
  }, [isSearchOpen])

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setSearchQuery("")
      setActiveSearchResultIndex(-1)
      setIsSearchOpen(false)
    })

    return () => {
      cancelled = true
    }
  }, [targetUser])

  const onImagePickerClick = () => {
    imageInputRef.current?.click()
  }

  const onImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void onSendImage(file)
    }

    event.target.value = ""
  }

  const onOpenFriendListModal = () => {
    setIsFriendListModalOpen(true)
  }

  const onCloseFriendListModal = () => {
    setIsFriendListModalOpen(false)
  }

  const onRequestRemoveFriend = (friendId: string) => {
    setFriendToRemove(friendId)
  }

  const onCancelRemoveFriend = () => {
    setFriendToRemove(null)
  }

  const onConfirmRemoveFriend = () => {
    if (!friendToRemove) {
      return
    }

    onRemoveFriend(friendToRemove)
    setFriendToRemove(null)
  }

  const onSearchPrevious = () => {
    if (totalSearchResults === 0) {
      return
    }

    setActiveSearchResultIndex((prev) => {
      if (prev <= 0) {
        return totalSearchResults - 1
      }

      return prev - 1
    })
  }

  const onSearchNext = () => {
    if (totalSearchResults === 0) {
      return
    }

    setActiveSearchResultIndex((prev) => {
      if (prev < 0 || prev >= totalSearchResults - 1) {
        return 0
      }

      return prev + 1
    })
  }

  const onOpenSearch = () => {
    setIsSearchOpen(true)
  }

  const onCloseSearch = () => {
    setIsSearchOpen(false)
    setSearchQuery("")
    setActiveSearchResultIndex(-1)
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans">
      <div className="w-1/4 border-r border-gray-700 p-4 overflow-y-auto bg-gray-800 flex flex-col">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-blue-400">Friends</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenFriendListModal}
              className="rounded-md border border-gray-600 px-3 py-1.5 text-xs font-semibold text-gray-200 transition hover:bg-gray-700"
            >
              Friend List
            </button>
            <button
              type="button"
              onClick={onOpenAddUserModal}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold transition hover:bg-blue-500"
            >
              Add Friend
            </button>
          </div>
        </div>
        <div className="space-y-2 flex-1">
          {visibleFriends.length === 0 && <p className="text-gray-500 text-sm">No friends added yet.</p>}
          {visibleFriends.map((u) => (
            <div
              key={u}
              className={`relative flex items-center gap-2 rounded-lg p-2 transition ${
                targetUser === u
                  ? "bg-slate-600/45 border border-slate-400/45 shadow-sm"
                  : "bg-slate-700/35 border border-slate-500/35 hover:bg-slate-600/40"
              }`}
            >
              {(() => {
                const unreadCount = unreadCountsByPeer[u] ?? unreadCountsByPeer[u.trim().toLowerCase()] ?? 0
                if (unreadCount <= 0) {
                  return null
                }

                return (
                  <span className="absolute -top-2 -right-2 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                    {unreadCount}
                  </span>
                )
              })()}
              <button
                type="button"
                onClick={() => onStartChat(u)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div
                  className={`h-3 w-3 rounded-full ${
                    onlineUsersSet.has(u.trim().toLowerCase()) ? "bg-green-500" : "bg-gray-500"
                  }`}
                ></div>
                <span className="truncate">{u}</span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${u}`}
                title={`Remove ${u}`}
                onClick={() => onRequestRemoveFriend(u)}
                className="rounded-md px-2 py-1 text-xs font-bold text-gray-200 transition hover:bg-black/20 hover:text-white"
              >
                x
              </button>
            </div>
          ))}

          <div className="mt-4 border-t border-gray-700 pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Groups</p>
              <button
                type="button"
                onClick={() => setIsCreateGroupModalOpen(true)}
                className="rounded-md bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-teal-500"
              >
                New Group
              </button>
            </div>
            <div className="space-y-2">
              {groups.length === 0 ? <p className="text-gray-500 text-sm">No groups yet.</p> : null}
              {groups.map((group) => (
                <button
                  key={group.group_id}
                  type="button"
                  onClick={() => onStartGroupChat(group.group_id)}
                  className={`w-full rounded-lg border p-2 text-left transition ${
                    selectedGroupId === group.group_id
                      ? "border-teal-400/50 bg-teal-800/30"
                      : "border-slate-500/35 bg-slate-700/25 hover:bg-slate-600/30"
                  }`}
                >
                  <span className="block truncate text-sm font-semibold text-teal-100">{group.name}</span>
                  <p className="mt-0.5 text-[11px] text-teal-200/70">Group chat • {group.member_count} members</p>
                </button>
              ))}
            </div>
            {groupsError ? (
              <p className="mt-2 rounded-md border border-red-900 bg-red-950 px-2 py-1.5 text-xs text-red-300">{groupsError}</p>
            ) : null}
          </div>

          {incomingRequests.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-700/40 bg-amber-950/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">Incoming Requests</p>
              <div className="space-y-2">
                {incomingRequests.map((requester) => (
                  <div key={requester} className="flex items-center justify-between gap-2 rounded-md border border-amber-800/40 bg-black/20 px-2 py-1.5">
                    <span className="truncate text-sm text-amber-100">{requester}</span>
                    <button
                      type="button"
                      disabled={friendActionLoading}
                      onClick={() => onAcceptFriendRequest(requester)}
                      className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {outgoingRequests.length > 0 && (
            <div className="mt-3 rounded-lg border border-blue-700/40 bg-blue-950/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-300">Sent Requests</p>
              <div className="space-y-1">
                {outgoingRequests.map((target) => (
                  <p key={target} className="truncate text-sm text-blue-100">{target}</p>
                ))}
              </div>
            </div>
          )}

          {friendActionError && (
            <p className="mt-3 rounded-md border border-red-900 bg-red-950 px-2 py-1.5 text-xs text-red-300">{friendActionError}</p>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700 text-xs">
          <button
            type="button"
            onClick={() => setIsOwnProfileOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-700 transition"
          >
            {ownAvatarDataUrl ? (
              <Image
                src={ownAvatarDataUrl}
                alt="Your avatar"
                width={28}
                height={28}
                unoptimized
                className="h-7 w-7 rounded-full object-cover border border-gray-600 shrink-0"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-blue-300 border border-gray-500 shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="truncate text-gray-300 font-mono">{displayName}</span>
          </button>
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md border border-gray-600 px-3 py-1 text-[11px] text-gray-400 hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <OwnProfileModal
        isOpen={isOwnProfileOpen}
        username={displayName}
        email={ownEmail ?? ""}
        avatarDataUrl={ownAvatarDataUrl}
        loading={profileLoading}
        error={profileError}
        onClose={() => setIsOwnProfileOpen(false)}
        onSave={onSaveProfile}
      />

      <PeerProfileModal
        isOpen={Boolean(peerProfileUsername)}
        username={peerProfileUsername ?? ""}
        token={token}
        onClose={() => setPeerProfileUsername(null)}
      />

      <AddFriendModal
        isOpen={isAddUserModalOpen}
        allUsers={allUsers}
        friends={friends}
        incomingRequests={incomingRequests}
        outgoingRequests={outgoingRequests}
        displayName={displayName}
        userId={userId}
        allUsersLoading={allUsersLoading}
        allUsersError={allUsersError}
        actionLoading={friendActionLoading}
        actionError={friendActionError}
        onClose={onCloseAddUserModal}
        onSendFriendRequest={onSendFriendRequest}
      />

      <CreateGroupModal
        isOpen={isCreateGroupModalOpen}
        friends={friends}
        displayName={displayName}
        userId={userId}
        loading={createGroupLoading}
        error={groupsError}
        onClose={() => setIsCreateGroupModalOpen(false)}
        onSubmit={async (name, memberUsernames) => {
          setCreateGroupLoading(true)
          try {
            return await onCreateGroup(name, memberUsernames)
          } finally {
            setCreateGroupLoading(false)
          }
        }}
      />

      <GroupMembersModal
        isOpen={isGroupMembersModalOpen && Boolean(selectedGroup)}
        groupName={selectedGroup?.name ?? "Group"}
        groupId={selectedGroup?.group_id ?? ""}
        currentUserRole={selectedGroup?.role ?? "member"}
        friends={friends}
        detail={groupMembersDetail}
        loading={groupMembersLoading}
        error={groupsError}
        actionLoading={groupMembersActionLoading}
        onClose={() => setIsGroupMembersModalOpen(false)}
        onAddMember={async (groupId, username) => {
          setGroupMembersActionLoading(true)
          try {
            const ok = await onAddGroupMember(groupId, username)
            if (ok) {
              await refreshGroupMembersDetail()
            }
            return ok
          } finally {
            setGroupMembersActionLoading(false)
          }
        }}
        onGrantInvite={async (groupId, username) => {
          setGroupMembersActionLoading(true)
          try {
            const ok = await onGrantInvitePermission(groupId, username)
            if (ok) {
              await refreshGroupMembersDetail()
            }
            return ok
          } finally {
            setGroupMembersActionLoading(false)
          }
        }}
        onPromoteLeader={async (groupId, username) => {
          setGroupMembersActionLoading(true)
          try {
            const ok = await onPromoteLeader(groupId, username)
            if (ok) {
              await refreshGroupMembersDetail()
            }
            return ok
          } finally {
            setGroupMembersActionLoading(false)
          }
        }}
      />

      <FriendListModal
        isOpen={isFriendListModalOpen}
        friends={friends}
        onlineUsers={onlineUsers}
        displayName={displayName}
        userId={userId}
        targetUser={targetUser}
        onClose={onCloseFriendListModal}
        onStartChat={onStartChat}
      />

      <ConfirmModal
        isOpen={Boolean(friendToRemove)}
        title="Delete friend?"
        description={
          friendToRemove
            ? `Are you sure you want to delete ${friendToRemove}? This removes the friendship and clears chat on this device.`
            : undefined
        }
        confirmText="Delete friend"
        cancelText="Keep"
        intent="danger"
        onConfirm={onConfirmRemoveFriend}
        onCancel={onCancelRemoveFriend}
      />

      <div className="flex-1 flex flex-col">
        {targetUser ? (
          <>
            <div className="p-4 border-b border-gray-700 bg-gray-800 flex items-center shadow-sm">
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!targetUser.startsWith("group:")) {
                        setPeerProfileUsername(targetUser)
                      }
                    }}
                    className="font-bold text-lg hover:underline text-left"
                  >
                    Chat: <span className="text-blue-400">{selectedGroup ? selectedGroup.name : targetUser}</span>
                  </button>
                  {selectedGroup ? (
                    <button
                      type="button"
                      title="Group members and permissions"
                      aria-label="Group members and permissions"
                      onClick={() => {
                        void openGroupMembersModal()
                      }}
                      className="h-7 rounded-md border border-teal-600/60 px-2.5 text-xs text-teal-200 transition hover:bg-teal-700/30"
                    >
                      Members
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative h-7 w-[360px]">
                    <div
                      className={`absolute right-0 top-0 flex h-7 items-center gap-2 rounded-md border border-gray-600 bg-gray-700/60 px-2 transition-all duration-300 ease-in-out ${
                        isSearchOpen
                          ? "translate-x-0 opacity-100"
                          : "translate-x-3 opacity-0 pointer-events-none"
                      }`}
                    >
                      <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search messages"
                        className="h-full w-44 bg-transparent text-xs text-white placeholder-gray-400 outline-none"
                      />
                      <span className="min-w-12 text-center text-[11px] text-gray-300">
                        {totalSearchResults > 0 && activeSearchResultIndex >= 0
                          ? `${activeSearchResultIndex + 1}/${totalSearchResults}`
                          : `0/${totalSearchResults}`}
                      </span>
                      <button
                        type="button"
                        onClick={onSearchPrevious}
                        disabled={totalSearchResults === 0}
                        className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-gray-200 transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Previous search result"
                        title="Previous"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={onSearchNext}
                        disabled={totalSearchResults === 0}
                        className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-gray-200 transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Next search result"
                        title="Next"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={onCloseSearch}
                        className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-gray-200 transition hover:bg-gray-600"
                        aria-label="Close search"
                        title="Close search"
                      >
                        x
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenSearch}
                      className={`absolute right-0 top-0 flex h-7 items-center justify-center rounded-md border border-gray-600 px-2 text-xs text-gray-300 transition-all duration-300 ease-in-out hover:bg-gray-700 hover:text-white ${
                        isSearchOpen
                          ? "translate-x-2 opacity-0 pointer-events-none"
                          : "translate-x-0 opacity-100"
                      }`}
                      aria-label="Open message search"
                      title="Search messages"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="M20 20L16.65 16.65" />
                      </svg>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onClearChat}
                    className="flex h-7 items-center rounded-md border border-gray-600 px-3 text-xs text-gray-300 transition hover:bg-gray-700 hover:text-white"
                  >
                    Clear Chat
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-gray-900 space-y-4">
              {currentMessages.length === 0 && (
                <div className="text-center text-gray-600 mt-10 text-sm">No messages.</div>
              )}
              {groupedMessages.map((group, index) => (
                <div key={`${group.fromUserId}-${group.createdAt}-${index}`} className={`flex ${group.fromUserId === userId ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] p-3 rounded-2xl wrap-break-word ${
                    group.fromUserId === userId && group.deliveryStatus === "failed"
                      ? "bg-red-700/80 border border-red-400/50 rounded-br-none"
                      : group.fromUserId === userId
                        ? "bg-blue-600 rounded-br-none"
                        : "bg-gray-700 rounded-bl-none"
                  }`}>
                    <div className="space-y-1.5">
                      {group.messages.map((messagePart) => (
                        <div
                          key={messagePart.id}
                          ref={(node) => {
                            messageElementRefs.current[messagePart.id] = node
                          }}
                          onDoubleClick={() => onHeartMessage(targetUser, messagePart.id)}
                          title="Double-click to heart"
                          className={`space-y-2 rounded-md transition-colors ${(() => {
                            const matchedResultIndex = searchResultIndexByMessageId[messagePart.id]
                            if (matchedResultIndex === undefined) {
                              return ""
                            }

                            if (matchedResultIndex === activeSearchResultIndex) {
                              return "bg-yellow-300/45 ring-2 ring-yellow-200 px-1 py-0.5"
                            }

                            return "bg-yellow-300/25 ring-1 ring-yellow-300/40 px-1 py-0.5"
                          })()}`}
                        >
                          {messagePart.text ? (
                            <p className="text-sm leading-5 whitespace-pre-wrap wrap-break-word">{messagePart.text}</p>
                          ) : null}
                          {messagePart.imageDataUrl ? (
                            <Image
                              src={messagePart.imageDataUrl}
                              alt="Shared image"
                              width={720}
                              height={720}
                              unoptimized
                              className="max-h-72 w-auto max-w-full rounded-lg border border-black/20 object-contain"
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] mt-1 opacity-50 text-right flex items-center justify-end gap-1">
                      {new Date(group.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {group.fromUserId === userId && renderOutgoingStatusTick(group.deliveryStatus)}
                    </p>
                    {group.fromUserId === userId && (
                      <div className="mt-1 space-y-1">
                        {group.messages
                          .filter((messagePart) => messagePart.deliveryStatus === "failed")
                          .map((messagePart) => (
                            <div key={`failed-${messagePart.id}`} className="flex flex-wrap items-center justify-end gap-2">
                              <span className="text-[11px] text-red-200">
                                {messagePart.errorMessage?.trim() || "Message could not be sent."}
                              </span>
                              <button
                                type="button"
                                onClick={() => onRetryMessage(messagePart.id)}
                                className="rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/25"
                              >
                                Retry
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteMessage(messagePart.id)}
                                className="rounded-md bg-red-950/60 px-2 py-0.5 text-[11px] font-semibold text-red-100 hover:bg-red-900/70"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5">
                      {group.messages.map((messagePart) => {
                        const heartUsers = messagePart.reactions?.["❤️"] ?? []
                        if (heartUsers.length === 0) {
                          return null
                        }

                        return (
                          <button
                            key={`reaction-${messagePart.id}`}
                            type="button"
                            onClick={() => onHeartMessage(targetUser, messagePart.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[11px] text-gray-100 cursor-pointer hover:bg-black/30"
                            title={`Hearted by: ${heartUsers.join(", ")}`}
                            aria-label="Toggle heart reaction"
                          >
                            <span aria-label="hearted message" role="img">❤️</span>
                            <span>{heartUsers.length}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={onSendMessage} className="p-4 bg-gray-800 border-t border-gray-700 flex gap-4">
              <div className="relative flex-1">
                <input
                  value={message}
                  onChange={(e) => onMessageChange(e.target.value)}
                  placeholder="Type a message..."
                  className="w-full bg-gray-700 border-none rounded-full pl-6 pr-14 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
                />
                <button
                  type="button"
                  onClick={onImagePickerClick}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-gray-600 text-lg font-semibold leading-none hover:bg-gray-500 transition"
                  aria-label="Add photo"
                  title="Add photo"
                >
                  +
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onImageInputChange}
                />
              </div>
              <button
                type="submit"
                disabled={!message.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-full font-bold transition"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">👋</span>
            </div>
            <p>Select a friend or a group from the left to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  )
}
