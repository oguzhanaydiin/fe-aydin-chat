import { createListenerMiddleware, isRejectedWithValue } from "@reduxjs/toolkit"
import { clearAuthState } from "@/store/features/authSlice"
import { SESSION_EXPIRED_MESSAGE } from "@/utils/authApiError"

export const sessionExpiredListener = createListenerMiddleware()

sessionExpiredListener.startListening({
  predicate: (action) =>
    isRejectedWithValue(action) && action.payload === SESSION_EXPIRED_MESSAGE,
  effect: (_action, listenerApi) => {
    listenerApi.dispatch(clearAuthState())
  },
})
