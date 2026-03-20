import { GenericModal } from "@/app/components/chat/GenericModal"

type AddFriendModalProps = {
  isOpen: boolean
  allUsers: string[]
  friends: string[]
  displayName: string
  userId: string
  allUsersLoading: boolean
  allUsersError: string | null
  onClose: () => void
  onAddFriend: (userId: string) => void
}

function normalizeIdentity(value: string) {
  return value.trim().toLowerCase()
}

export function AddFriendModal({
  isOpen,
  allUsers,
  friends,
  displayName,
  userId,
  allUsersLoading,
  allUsersError,
  onClose,
  onAddFriend,
}: AddFriendModalProps) {
  const normalizedDisplayName = normalizeIdentity(displayName)
  const normalizedUserId = normalizeIdentity(userId)

  const visibleFriends = friends.filter((friend) => {
    const normalized = normalizeIdentity(friend)
    return normalized && normalized !== normalizedDisplayName && normalized !== normalizedUserId
  })

  const addableUsers = allUsers.filter((candidate) => {
    const normalizedCandidate = normalizeIdentity(candidate)
    if (!normalizedCandidate) {
      return false
    }

    if (normalizedCandidate === normalizedDisplayName || normalizedCandidate === normalizedUserId) {
      return false
    }

    return !visibleFriends.some((friend) => normalizeIdentity(friend) === normalizedCandidate)
  })

  return (
    <GenericModal isOpen={isOpen} title="Add Friend" onClose={onClose}>
      {allUsersLoading && <p className="text-sm text-gray-400">Loading users...</p>}

      {!allUsersLoading && allUsersError && (
        <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">{allUsersError}</p>
      )}

      {!allUsersLoading && !allUsersError && addableUsers.length === 0 && (
        <p className="text-sm text-gray-400">No users available to add right now.</p>
      )}

      {!allUsersLoading && !allUsersError && addableUsers.length > 0 && (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {addableUsers.map((candidate) => (
            <div key={candidate} className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2">
              <span className="truncate text-sm text-gray-100">{candidate}</span>
              <button
                type="button"
                onClick={() => onAddFriend(candidate)}
                className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold hover:bg-emerald-500"
              >
                Add
              </button>
            </div>
          ))}
        </div>
      )}
    </GenericModal>
  )
}
