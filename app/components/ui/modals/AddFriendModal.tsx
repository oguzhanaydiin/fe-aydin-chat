"use client"

import { FormEvent, useState } from "react"
import { GenericModal } from "@/app/components/ui/modals/GenericModal"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { selectAuthState, selectFriendshipState } from "@/store/selectors"
import { clearFriendActionError, sendFriendRequestAction } from "@/store/features/friendshipSlice"
import { resolveChatUsername, resolveDisplayName } from "@/store/features/authSlice"
import { normalizeIdentity } from "@/utils/identity"

type AddFriendModalProps = {
  isOpen: boolean
  onClose: () => void
}

export function AddFriendModal({
  isOpen,
  onClose,
}: AddFriendModalProps) {
  const dispatch = useAppDispatch()
  const { authSession } = useAppSelector(selectAuthState)
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    friendActionLoading,
    friendActionError,
  } = useAppSelector(selectFriendshipState)

  const [usernameInput, setUsernameInput] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  const displayName = resolveDisplayName(authSession)
  const userId = resolveChatUsername(authSession)
  const token = authSession?.token || ""
  const normalizedSelf = normalizeIdentity(displayName || userId)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)
    dispatch(clearFriendActionError())

    if (!token) {
      return
    }

    const candidate = usernameInput.trim()
    const normalizedCandidate = normalizeIdentity(candidate)
    if (!normalizedCandidate) {
      setLocalError("Enter a username.")
      return
    }

    if (normalizedCandidate === normalizedSelf) {
      setLocalError("You cannot add yourself.")
      return
    }

    if (friends.some((friend) => normalizeIdentity(friend) === normalizedCandidate)) {
      setLocalError("You are already friends.")
      return
    }

    if (outgoingRequests.some((name) => normalizeIdentity(name) === normalizedCandidate)) {
      setLocalError("Friend request already sent.")
      return
    }

    if (incomingRequests.some((name) => normalizeIdentity(name) === normalizedCandidate)) {
      setLocalError("This user already sent you a request. Accept it from your friends list.")
      return
    }

    const action = await dispatch(sendFriendRequestAction({ token, friendId: candidate }))
    if (sendFriendRequestAction.fulfilled.match(action)) {
      setUsernameInput("")
    }
  }

  const handleClose = () => {
    setUsernameInput("")
    setLocalError(null)
    dispatch(clearFriendActionError())
    onClose()
  }

  const errorMessage = localError || friendActionError

  return (
    <GenericModal
      isOpen={isOpen}
      title="Add Friend"
      onClose={handleClose}
      panelClassName="max-w-lg"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3 pt-1">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-gray-300">Username</span>
          <input
            type="text"
            value={usernameInput}
            onChange={(event) => {
              setUsernameInput(event.target.value)
              if (localError) {
                setLocalError(null)
              }
            }}
            placeholder="Enter exact username"
            autoComplete="off"
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500"
          />
        </label>

        {errorMessage && (
          <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={friendActionLoading}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {friendActionLoading ? "Sending..." : "Send Request"}
        </button>
      </form>
    </GenericModal>
  )
}
