import type { RootState } from "@/store"

export const selectAuthState = (state: RootState) => state.auth
export const selectChatUiState = (state: RootState) => state.chatUi
export const selectFriendshipState = (state: RootState) => state.friendship
export const selectGroupsState = (state: RootState) => state.groups
