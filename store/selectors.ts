import type { RootState } from "@/store"
import {
  resolveAccountUserId,
  resolveChatUsername,
  resolveDisplayName,
} from "@/store/features/authSlice"

export const selectAuthState = (state: RootState) => state.auth
export const selectAuthSession = (state: RootState) => state.auth.authSession
export const selectAccountUserId = (state: RootState) => resolveAccountUserId(state.auth.authSession)
export const selectChatUsername = (state: RootState) => resolveChatUsername(state.auth.authSession)
export const selectDisplayName = (state: RootState) => resolveDisplayName(state.auth.authSession)
export const selectChatUiState = (state: RootState) => state.chatUi
export const selectFriendshipState = (state: RootState) => state.friendship
export const selectGroupsState = (state: RootState) => state.groups
