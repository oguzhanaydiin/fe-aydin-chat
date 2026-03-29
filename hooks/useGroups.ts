import { useCallback, useEffect, useState } from "react"
import { addGroupMember, createGroup, fetchGroupDetail, fetchGroups, updateGroupMemberPermissions } from "@/utils/chatApi"
import type { GroupDetail, GroupSummary } from "@/utils/chatTypes"

interface UseGroupsOptions {
  token: string
  isAuthenticated: boolean
}

export function useGroups({ token, isAuthenticated }: UseGroupsOptions) {
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupsError, setGroupsError] = useState<string | null>(null)

  const reloadGroups = useCallback(async () => {
    if (!token || !isAuthenticated) {
      setGroups([])
      return
    }

    setGroupsLoading(true)
    setGroupsError(null)

    try {
      const nextGroups = await fetchGroups(token)
      setGroups(nextGroups)
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : "Could not load groups")
    } finally {
      setGroupsLoading(false)
    }
  }, [isAuthenticated, token])

  useEffect(() => {
    void reloadGroups()
  }, [reloadGroups])

  const onCreateGroup = useCallback(async (name: string, initialMembers: string[]) => {
    if (!token) {
      return null
    }

    const normalizedName = name.trim()
    if (!normalizedName) {
      return null
    }

    try {
      const createdGroup = await createGroup(token, normalizedName, initialMembers)
      await reloadGroups()
      return createdGroup.group_id
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : "Could not create group")
      return null
    }
  }, [reloadGroups, token])

  const onAddGroupMember = useCallback(async (groupId: string, username: string) => {
    if (!token) {
      return false
    }

    const normalizedGroupId = groupId.trim()
    const normalizedUsername = username.trim().toLowerCase()
    if (!normalizedGroupId || !normalizedUsername) {
      return false
    }

    try {
      await addGroupMember(token, normalizedGroupId, normalizedUsername)
      await reloadGroups()
      return true
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : "Could not add member")
      return false
    }
  }, [reloadGroups, token])

  const onGrantInvitePermission = useCallback(async (groupId: string, username: string) => {
    if (!token) {
      return false
    }

    const normalizedGroupId = groupId.trim()
    const normalizedUsername = username.trim().toLowerCase()
    if (!normalizedGroupId || !normalizedUsername) {
      return false
    }

    try {
      await updateGroupMemberPermissions(token, normalizedGroupId, normalizedUsername, {
        can_invite: true,
      })
      await reloadGroups()
      return true
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : "Could not update invite permission")
      return false
    }
  }, [reloadGroups, token])

  const onPromoteGroupLeader = useCallback(async (groupId: string, username: string) => {
    if (!token) {
      return false
    }

    const normalizedGroupId = groupId.trim()
    const normalizedUsername = username.trim().toLowerCase()
    if (!normalizedGroupId || !normalizedUsername) {
      return false
    }

    try {
      await updateGroupMemberPermissions(token, normalizedGroupId, normalizedUsername, {
        role: "leader",
      })
      await reloadGroups()
      return true
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : "Could not promote member")
      return false
    }
  }, [reloadGroups, token])

  const onGetGroupDetail = useCallback(async (groupId: string): Promise<GroupDetail | null> => {
    if (!token) {
      return null
    }

    const normalizedGroupId = groupId.trim()
    if (!normalizedGroupId) {
      return null
    }

    try {
      return await fetchGroupDetail(token, normalizedGroupId)
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : "Could not load group details")
      return null
    }
  }, [token])

  const resetGroupsState = useCallback(() => {
    setGroups([])
    setGroupsLoading(false)
    setGroupsError(null)
  }, [])

  return {
    groups,
    groupsLoading,
    groupsError,
    reloadGroups,
    onCreateGroup,
    onGetGroupDetail,
    onAddGroupMember,
    onGrantInvitePermission,
    onPromoteGroupLeader,
    resetGroupsState,
  }
}
