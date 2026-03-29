import { GenericModal } from "@/app/components/ui/modals/GenericModal"

type FriendListModalProps = {
  isOpen: boolean
  friends: string[]
  onlineUsers: string[]
  displayName: string
  userId: string
  targetUser: string | null
  onClose: () => void
  onStartChat: (otherId: string) => void
}

function normalizeIdentity(value: string) {
  return value.trim().toLowerCase()
}

export function FriendListModal({
  isOpen,
  friends,
  onlineUsers,
  displayName,
  userId,
  targetUser,
  onClose,
  onStartChat,
}: FriendListModalProps) {
  const normalizedDisplayName = normalizeIdentity(displayName)
  const normalizedUserId = normalizeIdentity(userId)
  const onlineUsersSet = new Set(onlineUsers.map((candidate) => normalizeIdentity(candidate)))

  const visibleFriends = friends.filter((friend) => {
    const normalized = normalizeIdentity(friend)
    return normalized && normalized !== normalizedDisplayName && normalized !== normalizedUserId
  })

  return (
    <GenericModal
      isOpen={isOpen}
      title="Friend List"
      onClose={onClose}
      panelClassName="max-w-lg"
      bodyClassName="min-h-[320px]"
    >
      <p className="mb-3 text-xs text-gray-400">Total friends: {visibleFriends.length}</p>

      {visibleFriends.length === 0 ? (
        <p className="pt-2 text-sm text-gray-400">No friends added yet.</p>
      ) : (
        <div className="h-72 space-y-2 overflow-y-auto pr-1">
          {visibleFriends.map((friend) => {
            const normalizedFriend = normalizeIdentity(friend)
            const isOnline = onlineUsersSet.has(normalizedFriend)
            const isActive = targetUser ? normalizeIdentity(targetUser) === normalizedFriend : false

            return (
              <div
                key={friend}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                  isActive
                    ? "border-blue-500 bg-blue-950/60"
                    : "border-gray-700 bg-gray-800"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-gray-500"}`}></div>
                  <span className="truncate text-sm text-gray-100">{friend}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onStartChat(friend)
                    onClose()
                  }}
                  className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  Open chat
                </button>
              </div>
            )
          })}
        </div>
      )}
    </GenericModal>
  )
}