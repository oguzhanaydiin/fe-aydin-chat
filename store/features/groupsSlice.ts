import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit"
import { addGroupMember, createGroup, fetchGroups, updateGroupMemberPermissions } from "@/utils/chatApi"
import type { GroupSummary } from "@/utils/chatTypes"

type GroupsState = {
  groups: GroupSummary[]
  groupsLoading: boolean
  groupsError: string | null
}

const initialState: GroupsState = {
  groups: [],
  groupsLoading: false,
  groupsError: null,
}

export const fetchGroupsRequest = createAsyncThunk<
  GroupSummary[],
  string,
  { rejectValue: string }
>("groups/fetchGroupsRequest", async (token, { rejectWithValue }) => {
  try {
    return await fetchGroups(token)
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "Could not load groups")
  }
})

export const createGroupAction = createAsyncThunk<
  { groups: GroupSummary[], createdGroupId: string },
  { token: string, name: string, initialMembers: string[] },
  { rejectValue: string }
>("groups/createGroupAction", async ({ token, name, initialMembers }, { rejectWithValue }) => {
  try {
    const createdGroup = await createGroup(token, name, initialMembers)
    const groups = await fetchGroups(token)
    return { groups, createdGroupId: createdGroup.group_id }
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "Could not create group")
  }
})

export const addGroupMemberAction = createAsyncThunk<
  GroupSummary[],
  { token: string, groupId: string, username: string },
  { rejectValue: string }
>("groups/addGroupMemberAction", async ({ token, groupId, username }, { rejectWithValue }) => {
  try {
    await addGroupMember(token, groupId, username)
    return await fetchGroups(token)
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "Could not add member")
  }
})

export const grantInvitePermissionAction = createAsyncThunk<
  GroupSummary[],
  { token: string, groupId: string, username: string },
  { rejectValue: string }
>("groups/grantInvitePermissionAction", async ({ token, groupId, username }, { rejectWithValue }) => {
  try {
    await updateGroupMemberPermissions(token, groupId, username, {
      can_invite: true,
    })
    return await fetchGroups(token)
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "Could not update invite permission")
  }
})

export const promoteGroupLeaderAction = createAsyncThunk<
  GroupSummary[],
  { token: string, groupId: string, username: string },
  { rejectValue: string }
>("groups/promoteGroupLeaderAction", async ({ token, groupId, username }, { rejectWithValue }) => {
  try {
    await updateGroupMemberPermissions(token, groupId, username, {
      role: "leader",
    })
    return await fetchGroups(token)
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "Could not promote member")
  }
})

const groupsSlice = createSlice({
  name: "groups",
  initialState,
  reducers: {
    setGroupsError(state, action: PayloadAction<string | null>) {
      state.groupsError = action.payload
    },
    resetGroupsState() {
      return initialState
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchGroupsRequest.pending, (state) => {
        state.groupsLoading = true
        state.groupsError = null
      })
      .addCase(fetchGroupsRequest.fulfilled, (state, action) => {
        state.groupsLoading = false
        state.groups = action.payload
      })
      .addCase(fetchGroupsRequest.rejected, (state, action) => {
        state.groupsLoading = false
        state.groupsError = action.payload ?? "Could not load groups"
      })
      .addCase(createGroupAction.pending, (state) => {
        state.groupsLoading = true
        state.groupsError = null
      })
      .addCase(createGroupAction.fulfilled, (state, action) => {
        state.groupsLoading = false
        state.groups = action.payload.groups
      })
      .addCase(createGroupAction.rejected, (state, action) => {
        state.groupsLoading = false
        state.groupsError = action.payload ?? "Could not create group"
      })
      .addCase(addGroupMemberAction.pending, (state) => {
        state.groupsLoading = true
        state.groupsError = null
      })
      .addCase(addGroupMemberAction.fulfilled, (state, action) => {
        state.groupsLoading = false
        state.groups = action.payload
      })
      .addCase(addGroupMemberAction.rejected, (state, action) => {
        state.groupsLoading = false
        state.groupsError = action.payload ?? "Could not add member"
      })
      .addCase(grantInvitePermissionAction.pending, (state) => {
        state.groupsLoading = true
        state.groupsError = null
      })
      .addCase(grantInvitePermissionAction.fulfilled, (state, action) => {
        state.groupsLoading = false
        state.groups = action.payload
      })
      .addCase(grantInvitePermissionAction.rejected, (state, action) => {
        state.groupsLoading = false
        state.groupsError = action.payload ?? "Could not update invite permission"
      })
      .addCase(promoteGroupLeaderAction.pending, (state) => {
        state.groupsLoading = true
        state.groupsError = null
      })
      .addCase(promoteGroupLeaderAction.fulfilled, (state, action) => {
        state.groupsLoading = false
        state.groups = action.payload
      })
      .addCase(promoteGroupLeaderAction.rejected, (state, action) => {
        state.groupsLoading = false
        state.groupsError = action.payload ?? "Could not promote member"
      })
  },
})

export const { setGroupsError, resetGroupsState } = groupsSlice.actions

export default groupsSlice.reducer
