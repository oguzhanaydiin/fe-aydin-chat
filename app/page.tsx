"use client"
import { useCallback, useEffect, useRef } from "react"
import { useChatSocket } from "@/hooks/useChatSocket"
import { useAuthFlow } from "@/hooks/useAuthFlow"
import { useFriendship } from "@/hooks/useFriendship"
import { useGroups } from "@/hooks/useGroups"
import { useImageMessage } from "@/hooks/useImageMessage"
import { useChatActivity } from "@/hooks/useChatActivity"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { selectChatUiState } from "@/store/selectors"
import {
  resetChatUi,
  setMessage as setMessageAction,
  setTargetUser as setTargetUserAction,
} from "@/store/features/chatUiSlice"
import {
  WS_URL,
  resolveMaxWsTextLength,
} from "@/utils/chatConfig"
import { LoginView } from "@/app/components/layout/LoginView"
import { UsernameSetupView } from "@/app/components/layout/UsernameSetupView"
import { ChatLayout } from "@/app/components/layout/ChatLayout"

export default function ChatPage() {
  const maxWsTextLength = resolveMaxWsTextLength()
  const dispatch = useAppDispatch()
  const { targetUser, message } = useAppSelector(selectChatUiState)

  const {
    authSession,
    userId,
    token,
    displayName,
    emailInput,
    otpInput,
    otpEmail,
    devOtpHint,
    authLoading,
    authError,
    usernameInput,
    usernameLoading,
    usernameError,
    profileLoading,
    profileError,
    setEmailInput,
    setOtpInput,
    setUsernameInput,
    onSendOtp,
    onVerifyOtp,
    onSaveUsername,
    onLogoutAuth,
    onUpdateProfile,
  } = useAuthFlow()

  const setTargetUser = useCallback((value: string | null) => {
    dispatch(setTargetUserAction(value))
  }, [dispatch])

  const setMessage = useCallback((value: string) => {
    dispatch(setMessageAction(value))
  }, [dispatch])

  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const {
    onlineUsers,
    messagesByPeer,
    sendMessage: sendChatMessage,
    sendImageMessage,
    sendGroupMessage,
    sendGroupImageMessage,
    retryMessage,
    deleteMessage,
    sendHeartMessage,
    clearChat,
    status: wsStatus,
  } = useChatSocket({
    userId,
    token,
    wsUrl: WS_URL,
  })

  const {
    friends,
    incomingRequests,
    outgoingRequests,
    friendActionLoading,
    friendActionError,
    isAddUserModalOpen,
    allUsers,
    allUsersLoading,
    allUsersError,
    onOpenAddUserModal,
    onCloseAddUserModal,
    onSendFriendRequest,
    onAcceptFriendRequest,
    onRemoveFriend,
    resetFriendshipState,
  } = useFriendship({
    token,
    userId,
    displayName,
    wsStatus,
    targetUser,
    setTargetUser,
    setMessage,
    clearChat,
  })

  const {
    groups,
    groupsError,
    onCreateGroup,
    onGetGroupDetail,
    onAddGroupMember,
    onGrantInvitePermission,
    onPromoteGroupLeader,
    resetGroupsState,
  } = useGroups({
    token,
    isAuthenticated: Boolean(authSession),
  })

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messagesByPeer, targetUser])

  const { unreadCountsByPeer, resetChatActivityState } = useChatActivity({
    messagesByPeer,
    userId,
    targetUser,
    wsStatus,
    isAuthenticated: Boolean(authSession),
  })

  const startChat = (otherId: string) => {
    setTargetUser(otherId)
  }

  const onClearChat = () => {
    if (!targetUser) {
      return
    }

    clearChat(targetUser)
  }

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = message.trim()
    if (trimmed && targetUser && userId) {
      if (trimmed.length > maxWsTextLength) {
        window.alert(`Message is too long. Max ${maxWsTextLength} characters.`)
        return
      }

      if (targetUser.startsWith("group:")) {
        const groupId = targetUser.slice("group:".length)
        if (!groupId) {
          return
        }

        sendGroupMessage(groupId, trimmed)
      } else {
        sendChatMessage(targetUser, trimmed)
      }

      setMessage("")
    }
  }

  const { onSendImage } = useImageMessage({
    targetConversation: targetUser,
    userId,
    sendImageMessage,
    sendGroupImageMessage,
  })

  const currentMessages = targetUser ? messagesByPeer[targetUser] || [] : []

  const onLogout = () => {
    onLogoutAuth()
    dispatch(resetChatUi())
    resetFriendshipState()
    resetGroupsState()
    resetChatActivityState()
  }

  const onCreateGroupClick = async (name: string, memberUsernames: string[]) => {
    const createdGroupId = await onCreateGroup(name, memberUsernames)
    if (!createdGroupId) {
      return false
    }

    setTargetUser(`group:${createdGroupId}`)
    return true
  }

  if (!authSession) {
    return (
      <LoginView
        emailInput={emailInput}
        otpInput={otpInput}
        otpEmail={otpEmail}
        authLoading={authLoading}
        devOtpHint={devOtpHint}
        authError={authError}
        onEmailChange={setEmailInput}
        onOtpChange={setOtpInput}
        onSendOtp={onSendOtp}
        onVerifyOtp={onVerifyOtp}
      />
    )
  }

  if (authSession.needsUsernameSetup) {
    return (
      <UsernameSetupView
        usernameInput={usernameInput}
        usernameLoading={usernameLoading}
        usernameError={usernameError}
        onUsernameChange={setUsernameInput}
        onSaveUsername={onSaveUsername}
        onLogout={onLogout}
      />
    )
  }

  return (
    <ChatLayout
      friends={friends}
      incomingRequests={incomingRequests}
      outgoingRequests={outgoingRequests}
      onlineUsers={onlineUsers}
      targetUser={targetUser}
      displayName={displayName}
      userId={userId}
      token={token}
      ownAvatarDataUrl={authSession?.avatar_data_url}
      ownEmail={authSession?.email}
      profileLoading={profileLoading}
      profileError={profileError}
      message={message}
      currentMessages={currentMessages}
      isAddUserModalOpen={isAddUserModalOpen}
      allUsers={allUsers}
      allUsersLoading={allUsersLoading}
      allUsersError={allUsersError}
      friendActionLoading={friendActionLoading}
      friendActionError={friendActionError}
      unreadCountsByPeer={unreadCountsByPeer}
      messagesEndRef={messagesEndRef}
      onStartChat={startChat}
      onOpenAddUserModal={onOpenAddUserModal}
      groups={groups}
      groupsError={groupsError}
      onStartGroupChat={(groupId) => setTargetUser(`group:${groupId}`)}
      onCreateGroup={onCreateGroupClick}
      onGetGroupDetail={onGetGroupDetail}
      onAddGroupMember={onAddGroupMember}
      onGrantInvitePermission={onGrantInvitePermission}
      onPromoteLeader={onPromoteGroupLeader}
      onCloseAddUserModal={onCloseAddUserModal}
      onSendFriendRequest={onSendFriendRequest}
      onAcceptFriendRequest={onAcceptFriendRequest}
      onRemoveFriend={onRemoveFriend}
      onClearChat={onClearChat}
      onLogout={onLogout}
      onMessageChange={setMessage}
      onSendMessage={sendMessage}
      onHeartMessage={sendHeartMessage}
      onRetryMessage={retryMessage}
      onDeleteMessage={deleteMessage}
      onSendImage={onSendImage}
      onSaveProfile={onUpdateProfile}
    />
  )
}