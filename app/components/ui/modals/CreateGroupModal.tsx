import { useEffect, useMemo, useState } from "react"
import { GenericModal } from "@/app/components/ui/modals/GenericModal"
import { normalizeIdentity } from "@/utils/identity"

type CreateGroupModalProps = {
  isOpen: boolean
  friends: string[]
  displayName: string
  userId: string
  loading: boolean
  error: string | null
  onClose: () => void
  onSubmit: (name: string, memberUsernames: string[]) => Promise<boolean>
}

export function CreateGroupModal({
  isOpen,
  friends,
  displayName,
  userId,
  loading,
  error,
  onClose,
  onSubmit,
}: CreateGroupModalProps) {
  const [name, setName] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [localError, setLocalError] = useState<string | null>(null)

  const normalizedDisplayName = normalizeIdentity(displayName)
  const normalizedUserId = normalizeIdentity(userId)

  const selectableFriends = useMemo(() => {
    return friends
      .map((friend) => normalizeIdentity(friend))
      .filter((friend) => friend && friend !== normalizedDisplayName && friend !== normalizedUserId)
      .filter((friend, index, arr) => arr.indexOf(friend) === index)
      .sort((a, b) => a.localeCompare(b))
  }, [friends, normalizedDisplayName, normalizedUserId])

  useEffect(() => {
    let cancelled = false

    if (!isOpen) {
      cancelled = true
      return
    }

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setName("")
      setSelectedMembers([])
      setLocalError(null)
    })

    return () => {
      cancelled = true
    }
  }, [isOpen])

  const toggleMember = (username: string) => {
    setSelectedMembers((prev) => {
      if (prev.includes(username)) {
        return prev.filter((item) => item !== username)
      }

      return [...prev, username]
    })
  }

  const selectAll = () => {
    setSelectedMembers(selectableFriends)
  }

  const clearSelection = () => {
    setSelectedMembers([])
  }

  const onCreateClick = async () => {
    const normalizedName = name.trim()
    if (!normalizedName) {
      setLocalError("Group name is required")
      return
    }

    if (selectedMembers.length === 0) {
      setLocalError("Pick at least one friend")
      return
    }

    setLocalError(null)
    const ok = await onSubmit(normalizedName, selectedMembers)
    if (ok) {
      onClose()
    }
  }

  return (
    <GenericModal
      isOpen={isOpen}
      title="Create Group"
      onClose={onClose}
      panelClassName="max-w-xl"
      bodyClassName="space-y-3"
    >
      {error ? (
        <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}
      {localError ? (
        <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">{localError}</p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">Group Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Weekend Team"
          maxLength={120}
          className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />
      </label>

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">Choose Friends</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-800"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-800"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-gray-700 bg-gray-850 p-2">
        {selectableFriends.length === 0 ? (
          <p className="px-1 py-2 text-sm text-gray-400">No friends available to add.</p>
        ) : (
          selectableFriends.map((friend) => {
            const isSelected = selectedMembers.includes(friend)
            return (
              <label
                key={friend}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition ${
                  isSelected
                    ? "border-blue-500/60 bg-blue-900/20 text-blue-100"
                    : "border-gray-700 bg-gray-800 text-gray-100 hover:border-gray-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleMember(friend)}
                  className="h-4 w-4 accent-blue-500"
                />
                <span className="truncate">{friend}</span>
              </label>
            )
          })
        )}
      </div>

      <div className="flex items-center justify-between pt-1 text-xs text-gray-400">
        <span>{selectedMembers.length} selected</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-600 px-3 py-1.5 text-gray-200 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              void onCreateClick()
            }}
            className="rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Group"}
          </button>
        </div>
      </div>
    </GenericModal>
  )
}
