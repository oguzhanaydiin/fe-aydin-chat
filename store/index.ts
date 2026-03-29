import { configureStore } from "@reduxjs/toolkit"
import authReducer from "@/store/features/authSlice"
import chatUiReducer from "@/store/features/chatUiSlice"
import friendshipReducer from "@/store/features/friendshipSlice"
import groupsReducer from "@/store/features/groupsSlice"

export const makeStore = () => {
  return configureStore({
    reducer: {
      auth: authReducer,
      chatUi: chatUiReducer,
      friendship: friendshipReducer,
      groups: groupsReducer,
    },
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore["getState"]>
export type AppDispatch = AppStore["dispatch"]
