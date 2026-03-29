import { useCallback, useEffect } from "react"
import { fetchGroupDetail } from "@/utils/chatApi"
import type { GroupDetail } from "@/utils/chatTypes"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import {
  addGroupMemberAction,
  createGroupAction,
  fetchGroupsRequest,
  grantInvitePermissionAction,
  promoteGroupLeaderAction,
  resetGroupsState as resetGroupsStateAction,
  setGroupsError,
} from "@/store/features/groupsSlice"

interface UseGroupsOptions {
  token: string
  isAuthenticated: boolean
}

export function useGroups({ token, isAuthenticated }: UseGroupsOptions) {
  const dispatch = useAppDispatch()
  const { groups, groupsLoading, groupsError } = useAppSelector((state) => state.groups)

  const reloadGroups = useCallback(async () => {
    if (!token || !isAuthenticated) {
      dispatch(resetGroupsStateAction())
      return
    }

    await dispatch(fetchGroupsRequest(token))
  }, [dispatch, isAuthenticated, token])

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

    const action = await dispatch(createGroupAction({
      token,
      name: normalizedName,
      initialMembers,
    }))

    if (createGroupAction.fulfilled.match(action)) {
      return action.payload.createdGroupId
    }

    return null
  }, [dispatch, token])

  const onAddGroupMember = useCallback(async (groupId: string, username: string) => {
    if (!token) {
      return false
    }

    const normalizedGroupId = groupId.trim()
    const normalizedUsername = username.trim().toLowerCase()
    if (!normalizedGroupId || !normalizedUsername) {
      return false
    }

    const action = await dispatch(addGroupMemberAction({
      token,
      groupId: normalizedGroupId,
      username: normalizedUsername,
    }))

    return addGroupMemberAction.fulfilled.match(action)
  }, [dispatch, token])

  const onGrantInvitePermission = useCallback(async (groupId: string, username: string) => {
    if (!token) {
      return false
    }

    const normalizedGroupId = groupId.trim()
    const normalizedUsername = username.trim().toLowerCase()
    if (!normalizedGroupId || !normalizedUsername) {
      return false
    }

    const action = await dispatch(grantInvitePermissionAction({
      token,
      groupId: normalizedGroupId,
      username: normalizedUsername,
    }))

    return grantInvitePermissionAction.fulfilled.match(action)
  }, [dispatch, token])

  const onPromoteGroupLeader = useCallback(async (groupId: string, username: string) => {
    if (!token) {
      return false
    }

    const normalizedGroupId = groupId.trim()
    const normalizedUsername = username.trim().toLowerCase()
    if (!normalizedGroupId || !normalizedUsername) {
      return false
    }

    const action = await dispatch(promoteGroupLeaderAction({
      token,
      groupId: normalizedGroupId,
      username: normalizedUsername,
    }))

    return promoteGroupLeaderAction.fulfilled.match(action)
  }, [dispatch, token])

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
      dispatch(setGroupsError(err instanceof Error ? err.message : "Could not load group details"))
      return null
    }
  }, [dispatch, token])

  const resetGroupsState = useCallback(() => {
    dispatch(resetGroupsStateAction())
  }, [dispatch])

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
