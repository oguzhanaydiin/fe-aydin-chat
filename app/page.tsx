"use client"
import { useEffect, useState, useRef } from "react"
import { useChatSocket } from "@/hooks/useChatSocket"
import { useAuthFlow } from "@/hooks/useAuthFlow"
import { useFriendship } from "@/hooks/useFriendship"
import { useImageMessage } from "@/hooks/useImageMessage"
import { useChatActivity } from "@/hooks/useChatActivity"
import {
  WS_URL,
  resolveMaxWsTextLength,
} from "@/lib/chat/constants"
import { LoginView } from "@/app/components/chat/LoginView"
import { UsernameSetupView } from "@/app/components/chat/UsernameSetupView"
import { ChatLayout } from "@/app/components/chat/ChatLayout"

export default function ChatPage() {
  const maxWsTextLength = resolveMaxWsTextLength()
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

  const [targetUser, setTargetUser] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const {
    onlineUsers,
    messagesByPeer,
    sendMessage: sendChatMessage,
    sendImageMessage,
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

      sendChatMessage(targetUser, trimmed)

      setMessage("")
    }
  }

  const { onSendImage } = useImageMessage({
    targetUser,
    userId,
    sendImageMessage,
  })

  const currentMessages = targetUser ? messagesByPeer[targetUser] || [] : []

  const onLogout = () => {
    onLogoutAuth()
    setTargetUser(null)
    setMessage("")
    resetFriendshipState()
    resetChatActivityState()
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
      onCloseAddUserModal={onCloseAddUserModal}
      onSendFriendRequest={onSendFriendRequest}
      onAcceptFriendRequest={onAcceptFriendRequest}
      onRemoveFriend={onRemoveFriend}
      onClearChat={onClearChat}
      onLogout={onLogout}
      onMessageChange={setMessage}
      onSendMessage={sendMessage}
      onHeartMessage={sendHeartMessage}
      onSendImage={onSendImage}
      onSaveProfile={onUpdateProfile}
    />
  )
}