import { useMemo, useState } from "react"
import { GenericModal } from "@/app/components/ui/modals/GenericModal"
import type { GroupDetail } from "@/utils/chatTypes"
import { normalizeIdentity } from "@/utils/identity"

type GroupMembersModalProps = {
  isOpen: boolean
  groupName: string
  groupId: string
  currentUserRole: "leader" | "member"
  friends: string[]
  detail: GroupDetail | null
  loading: boolean
  error: string | null
  actionLoading: boolean
  onClose: () => void
  onAddMember: (groupId: string, username: string) => Promise<boolean>
  onGrantInvite: (groupId: string, username: string) => Promise<boolean>
  onPromoteLeader: (groupId: string, username: string) => Promise<boolean>
}

export function GroupMembersModal({
  isOpen,
  groupName,
  groupId,
  currentUserRole,
  friends,
  detail,
  loading,
  error,
  actionLoading,
  onClose,
  onAddMember,
  onGrantInvite,
  onPromoteLeader,
}: GroupMembersModalProps) {
  const [selectedFriend, setSelectedFriend] = useState("")
  const canManage = currentUserRole === "leader"

  const memberUsernames = useMemo(() => {
    return new Set((detail?.members ?? []).map((member) => normalizeIdentity(member.username)))
  }, [detail?.members])

  const addableFriends = useMemo(() => {
    return friends
      .map((friend) => normalizeIdentity(friend))
      .filter((friend) => friend && !memberUsernames.has(friend))
      .filter((friend, index, arr) => arr.indexOf(friend) === index)
      .sort((a, b) => a.localeCompare(b))
  }, [friends, memberUsernames])

  const onAddClick = async () => {
    if (!selectedFriend || !groupId) {
      return
    }

    const ok = await onAddMember(groupId, selectedFriend)
    if (ok) {
      setSelectedFriend("")
    }
  }

  return (
    <GenericModal
      isOpen={isOpen}
      title={`Members - ${groupName}`}
      onClose={onClose}
      panelClassName="max-w-2xl"
      bodyClassName="space-y-3"
    >
      {error ? (
        <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}

      {canManage ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Add Member</p>
          <div className="flex items-center gap-2">
            <select
              value={selectedFriend}
              onChange={(event) => setSelectedFriend(event.target.value)}
              className="flex-1 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            >
              <option value="">Choose a friend</option>
              {addableFriends.map((friend) => (
                <option key={friend} value={friend}>{friend}</option>
              ))}
            </select>
            <button
              type="button"
              title="Add selected friend to this group"
              aria-label="Add selected friend"
              disabled={!selectedFriend || actionLoading}
              onClick={() => {
                void onAddClick()
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-teal-500/50 bg-teal-900/30 text-teal-100 transition hover:bg-teal-800/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {loading ? <p className="text-sm text-gray-400">Loading members...</p> : null}
        {!loading && (detail?.members.length ?? 0) === 0 ? <p className="text-sm text-gray-400">No members found.</p> : null}

        {(detail?.members ?? []).map((member) => {
          const normalizedUsername = normalizeIdentity(member.username)
          const isLeader = member.role === "leader"
          const hasInvite = member.can_invite

          return (
            <div
              key={member.username}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-100">{member.username}</p>
                <p className="text-xs text-gray-400">
                  {isLeader ? "Leader" : "Member"}
                  {hasInvite ? " \u2022 Can invite" : ""}
                </p>
              </div>

              {canManage ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    title="Grant invite permission"
                    aria-label="Grant invite permission"
                    disabled={actionLoading || hasInvite}
                    onClick={() => {
                      void onGrantInvite(groupId, normalizedUsername)
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/50 bg-amber-900/30 text-amber-100 transition hover:bg-amber-800/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                      <path d="M4 11h11" />
                      <path d="M10 17l5-6-5-6" />
                      <path d="M15 11h5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Promote to leader"
                    aria-label="Promote to leader"
                    disabled={actionLoading || isLeader}
                    onClick={() => {
                      void onPromoteLeader(groupId, normalizedUsername)
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-fuchsia-500/50 bg-fuchsia-900/30 text-fuchsia-100 transition hover:bg-fuchsia-800/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                      <path d="M4 18h16" />
                      <path d="M6 18l2-9 4 4 4-7 2 12" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </GenericModal>
  )
}
