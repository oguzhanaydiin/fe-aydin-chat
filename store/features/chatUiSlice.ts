import { createSlice, PayloadAction } from "@reduxjs/toolkit"

type ChatUiState = {
  targetUser: string | null
  message: string
}

const initialState: ChatUiState = {
  targetUser: null,
  message: "",
}

const chatUiSlice = createSlice({
  name: "chatUi",
  initialState,
  reducers: {
    setTargetUser(state, action: PayloadAction<string | null>) {
      state.targetUser = action.payload
    },
    setMessage(state, action: PayloadAction<string>) {
      state.message = action.payload
    },
    resetChatUi() {
      return initialState
    },
  },
})

export const { setTargetUser, setMessage, resetChatUi } = chatUiSlice.actions
export default chatUiSlice.reducer
