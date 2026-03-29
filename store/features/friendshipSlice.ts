import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit"
import { acceptFriendRequest, fetchAllUsers, fetchFriendSnapshot, removeFriend, sendFriendRequest } from "@/utils/chatApi"
import { normalizeIdentity } from "@/utils/identity"

type FriendshipSnapshotData = {
  friends: string[]
  incomingRequests: string[]
  outgoingRequests: string[]
}

type FriendshipState = FriendshipSnapshotData & {
  friendActionLoading: boolean
  friendActionError: string | null
  isAddUserModalOpen: boolean
  allUsers: string[]
  allUsersLoading: boolean
  allUsersError: string | null
}

const initialState: FriendshipState = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  friendActionLoading: false,
  friendActionError: null,
  isAddUserModalOpen: false,
  allUsers: [],
  allUsersLoading: false,
  allUsersError: null,
}

function normalizeSnapshot(snapshot: { accepted_friends: string[], incoming_requests: string[], outgoing_requests: string[] }): FriendshipSnapshotData {
  return {
    friends: Array.from(new Set(snapshot.accepted_friends.map((item) => normalizeIdentity(item)))),
    incomingRequests: Array.from(new Set(snapshot.incoming_requests.map((item) => normalizeIdentity(item)))),
    outgoingRequests: Array.from(new Set(snapshot.outgoing_requests.map((item) => normalizeIdentity(item)))),
  }
}

export const fetchFriendSnapshotRequest = createAsyncThunk<
  FriendshipSnapshotData,
  string,
  { rejectValue: string }
>("friendship/fetchFriendSnapshotRequest", async (token, { rejectWithValue }) => {
  try {
    const snapshot = await fetchFriendSnapshot(token)
    return normalizeSnapshot(snapshot)
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "Could not load friends")
  }
})

export const fetchAllUsersRequest = createAsyncThunk<
  string[],
  { token: string, userId: string, displayName: string },
  { rejectValue: string }
>("friendship/fetchAllUsersRequest", async ({ token, userId, displayName }, { rejectWithValue }) => {
  try {
    const users = await fetchAllUsers(token)
    const normalizedSelf = normalizeIdentity(displayName || userId)
    return Array.from(new Set(users)).filter((candidate) => normalizeIdentity(candidate) !== normalizedSelf)
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "Could not load users")
  }
})

export const sendFriendRequestAction = createAsyncThunk<
  FriendshipSnapshotData,
  { token: string, friendId: string },
  { rejectValue: string }
>("friendship/sendFriendRequestAction", async ({ token, friendId }, { rejectWithValue }) => {
  try {
    await sendFriendRequest(token, friendId)
    const snapshot = await fetchFriendSnapshot(token)
    return normalizeSnapshot(snapshot)
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "Could not send friend request")
  }
})

export const acceptFriendRequestAction = createAsyncThunk<
  FriendshipSnapshotData,
  { token: string, fromUsername: string },
  { rejectValue: string }
>("friendship/acceptFriendRequestAction", async ({ token, fromUsername }, { rejectWithValue }) => {
  try {
    await acceptFriendRequest(token, fromUsername)
    const snapshot = await fetchFriendSnapshot(token)
    return normalizeSnapshot(snapshot)
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "Could not accept friend request")
  }
})

export const removeFriendAction = createAsyncThunk<
  FriendshipSnapshotData,
  { token: string, friendUsername: string },
  { rejectValue: string }
>("friendship/removeFriendAction", async ({ token, friendUsername }, { rejectWithValue }) => {
  try {
    await removeFriend(token, friendUsername)
    const snapshot = await fetchFriendSnapshot(token)
    return normalizeSnapshot(snapshot)
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : "Could not remove friend")
  }
})

const friendshipSlice = createSlice({
  name: "friendship",
  initialState,
  reducers: {
    setAddUserModalOpen(state, action: PayloadAction<boolean>) {
      state.isAddUserModalOpen = action.payload
    },
    clearFriendActionError(state) {
      state.friendActionError = null
    },
    clearAllUsersError(state) {
      state.allUsersError = null
    },
    resetFriendshipState() {
      return initialState
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFriendSnapshotRequest.fulfilled, (state, action) => {
        state.friends = action.payload.friends
        state.incomingRequests = action.payload.incomingRequests
        state.outgoingRequests = action.payload.outgoingRequests
      })
      .addCase(fetchFriendSnapshotRequest.rejected, (state, action) => {
        state.friendActionError = action.payload ?? "Could not load friends"
      })
      .addCase(fetchAllUsersRequest.pending, (state) => {
        state.allUsersLoading = true
        state.allUsersError = null
      })
      .addCase(fetchAllUsersRequest.fulfilled, (state, action) => {
        state.allUsersLoading = false
        state.allUsers = action.payload
      })
      .addCase(fetchAllUsersRequest.rejected, (state, action) => {
        state.allUsersLoading = false
        state.allUsers = []
        state.allUsersError = action.payload ?? "Could not load users"
      })
      .addCase(sendFriendRequestAction.pending, (state) => {
        state.friendActionLoading = true
        state.friendActionError = null
      })
      .addCase(sendFriendRequestAction.fulfilled, (state, action) => {
        state.friendActionLoading = false
        state.friends = action.payload.friends
        state.incomingRequests = action.payload.incomingRequests
        state.outgoingRequests = action.payload.outgoingRequests
        state.isAddUserModalOpen = false
      })
      .addCase(sendFriendRequestAction.rejected, (state, action) => {
        state.friendActionLoading = false
        state.friendActionError = action.payload ?? "Could not send friend request"
      })
      .addCase(acceptFriendRequestAction.pending, (state) => {
        state.friendActionLoading = true
        state.friendActionError = null
      })
      .addCase(acceptFriendRequestAction.fulfilled, (state, action) => {
        state.friendActionLoading = false
        state.friends = action.payload.friends
        state.incomingRequests = action.payload.incomingRequests
        state.outgoingRequests = action.payload.outgoingRequests
      })
      .addCase(acceptFriendRequestAction.rejected, (state, action) => {
        state.friendActionLoading = false
        state.friendActionError = action.payload ?? "Could not accept friend request"
      })
      .addCase(removeFriendAction.pending, (state) => {
        state.friendActionLoading = true
        state.friendActionError = null
      })
      .addCase(removeFriendAction.fulfilled, (state, action) => {
        state.friendActionLoading = false
        state.friends = action.payload.friends
        state.incomingRequests = action.payload.incomingRequests
        state.outgoingRequests = action.payload.outgoingRequests
      })
      .addCase(removeFriendAction.rejected, (state, action) => {
        state.friendActionLoading = false
        state.friendActionError = action.payload ?? "Could not remove friend"
      })
  },
})

export const {
  setAddUserModalOpen,
  clearFriendActionError,
  clearAllUsersError,
  resetFriendshipState,
} = friendshipSlice.actions

export default friendshipSlice.reducer
