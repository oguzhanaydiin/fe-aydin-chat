import { GenericModal } from "@/app/components/ui/modals/GenericModal"

type AddFriendModalProps = {
  isOpen: boolean
  allUsers: string[]
  friends: string[]
  incomingRequests: string[]
  outgoingRequests: string[]
  displayName: string
  userId: string
  allUsersLoading: boolean
  allUsersError: string | null
  actionLoading: boolean
  actionError: string | null
  onClose: () => void
  onSendFriendRequest: (userId: string) => void
}

function normalizeIdentity(value: string) {
  return value.trim().toLowerCase()
}

export function AddFriendModal({
  isOpen,
  allUsers,
  friends,
  incomingRequests,
  outgoingRequests,
  displayName,
  userId,
  allUsersLoading,
  allUsersError,
  actionLoading,
  actionError,
  onClose,
  onSendFriendRequest,
}: AddFriendModalProps) {
  const normalizedDisplayName = normalizeIdentity(displayName)
  const normalizedUserId = normalizeIdentity(userId)

  const visibleFriends = friends.filter((friend) => {
    const normalized = normalizeIdentity(friend)
    return normalized && normalized !== normalizedDisplayName && normalized !== normalizedUserId
  })

  const incomingSet = new Set(incomingRequests.map((candidate) => normalizeIdentity(candidate)))
  const outgoingSet = new Set(outgoingRequests.map((candidate) => normalizeIdentity(candidate)))

  const addableUsers = allUsers.filter((candidate) => {
    const normalizedCandidate = normalizeIdentity(candidate)
    if (!normalizedCandidate) {
      return false
    }

    if (normalizedCandidate === normalizedDisplayName || normalizedCandidate === normalizedUserId) {
      return false
    }

    const isFriend = visibleFriends.some((friend) => normalizeIdentity(friend) === normalizedCandidate)

    return !isFriend
  })

  return (
    <GenericModal
      isOpen={isOpen}
      title="Add Friend"
      onClose={onClose}
      panelClassName="max-w-lg"
      bodyClassName="min-h-[320px]"
    >
      {allUsersLoading && <p className="pt-2 text-sm text-gray-400">Loading users...</p>}

      {!allUsersLoading && actionError && (
        <p className="mb-3 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">{actionError}</p>
      )}

      {!allUsersLoading && allUsersError && (
        <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">{allUsersError}</p>
      )}

      {!allUsersLoading && !allUsersError && addableUsers.length === 0 && (
        <p className="pt-2 text-sm text-gray-400">No users available to add right now.</p>
      )}

      {!allUsersLoading && !allUsersError && addableUsers.length > 0 && (
        <div className="h-72 space-y-2 overflow-y-auto pr-1">
          {addableUsers.map((candidate) => (
            <div key={candidate} className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2">
              <span className="truncate text-sm text-gray-100">{candidate}</span>

              {incomingSet.has(normalizeIdentity(candidate)) ? (
                <span className="rounded-md border border-amber-500/40 bg-amber-900/40 px-2 py-1 text-xs font-semibold text-amber-200">
                  Incoming request
                </span>
              ) : outgoingSet.has(normalizeIdentity(candidate)) ? (
                <span className="rounded-md border border-blue-500/40 bg-blue-900/40 px-2 py-1 text-xs font-semibold text-blue-200">
                  Request sent
                </span>
              ) : (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => onSendFriendRequest(candidate)}
                  className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-500"
                >
                  Send Request
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </GenericModal>
  )
}
