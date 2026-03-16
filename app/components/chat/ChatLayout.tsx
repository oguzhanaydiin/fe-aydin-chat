import type { FormEvent, RefObject } from "react"
import type { ChatMessage } from "@/lib/chat/types"

type MessageGroup = {
  fromUserId: string
  createdAt: string
  deliveryStatus?: "sending" | "sent" | "delivered"
  messages: Array<{
    id: string
    text: string
  }>
}

type ChatLayoutProps = {
  onlineUsers: string[]
  targetUser: string | null
  displayName: string
  userId: string
  message: string
  currentMessages: ChatMessage[]
  messagesEndRef: RefObject<HTMLDivElement | null>
  onStartChat: (otherId: string) => void
  onClearChat: () => void
  onLogout: () => void
  onMessageChange: (value: string) => void
  onSendMessage: (e: FormEvent) => void
}

function renderOutgoingStatusTick(status?: "sending" | "sent" | "delivered") {
  if (!status || status === "sending") {
    return <span className="text-gray-200 font-semibold tracking-tight">...</span>
  }

  if (status === "delivered") {
    return <span className="text-emerald-300 text-[11px] font-black leading-none">&#10003;</span>
  }

  return <span className="text-gray-200 text-[11px] font-black leading-none">&#10003;</span>
}

function groupMessages(currentMessages: ChatMessage[]) {
  return currentMessages.reduce<MessageGroup[]>((groups, msg) => {
    const createdAt = new Date(msg.created_at)
    const minuteKey = `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}-${createdAt.getHours()}-${createdAt.getMinutes()}`
    const lastGroup = groups[groups.length - 1]
    const lastGroupMinute = lastGroup ? new Date(lastGroup.createdAt) : null
    const lastMinuteKey = lastGroupMinute
      ? `${lastGroupMinute.getFullYear()}-${lastGroupMinute.getMonth()}-${lastGroupMinute.getDate()}-${lastGroupMinute.getHours()}-${lastGroupMinute.getMinutes()}`
      : null

    if (lastGroup && lastGroup.fromUserId === msg.from_user_id && lastMinuteKey === minuteKey) {
      lastGroup.messages.push({ id: msg.id, text: msg.text })
      lastGroup.createdAt = msg.created_at
      lastGroup.deliveryStatus = msg.delivery_status
      return groups
    }

    groups.push({
      fromUserId: msg.from_user_id,
      createdAt: msg.created_at,
      deliveryStatus: msg.delivery_status,
      messages: [{ id: msg.id, text: msg.text }],
    })

    return groups
  }, [])
}

export function ChatLayout({
  onlineUsers,
  targetUser,
  displayName,
  userId,
  message,
  currentMessages,
  messagesEndRef,
  onStartChat,
  onClearChat,
  onLogout,
  onMessageChange,
  onSendMessage,
}: ChatLayoutProps) {
  const groupedMessages = groupMessages(currentMessages)

  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans">
      <div className="w-1/4 border-r border-gray-700 p-4 overflow-y-auto bg-gray-800 flex flex-col">
        <h2 className="text-xl font-bold mb-6 text-blue-400">Active Users</h2>
        <div className="space-y-2 flex-1">
          {onlineUsers.length === 0 && <p className="text-gray-500 text-sm">No one is online...</p>}
          {onlineUsers.map((u) => (
            <button
              key={u}
              onClick={() => onStartChat(u)}
              className={`w-full text-left p-3 rounded-lg transition ${
                targetUser === u ? "bg-blue-600 shadow-lg" : "hover:bg-gray-700 bg-gray-750"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${targetUser === u ? "bg-white" : "bg-green-500"}`}></div>
                <span className="truncate">{u}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700 opacity-50 text-xs text-center">
          You: <span className="font-mono text-blue-300">{displayName}</span>
          <div className="mt-3">
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md border border-gray-600 px-3 py-1 text-[11px] hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {targetUser ? (
          <>
            <div className="p-4 border-b border-gray-700 bg-gray-800 flex items-center shadow-sm">
              <div className="flex w-full items-center justify-between gap-4">
                <h3 className="font-bold text-lg">Chat: <span className="text-blue-400">{targetUser}</span></h3>
                <button
                  type="button"
                  onClick={onClearChat}
                  className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-300 transition hover:bg-gray-700 hover:text-white"
                >
                  Clear Chat
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-gray-900 space-y-4">
              {currentMessages.length === 0 && (
                <div className="text-center text-gray-600 mt-10 text-sm">No messages.</div>
              )}
              {groupedMessages.map((group, index) => (
                <div key={`${group.fromUserId}-${group.createdAt}-${index}`} className={`flex ${group.fromUserId === userId ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] p-3 rounded-2xl wrap-break-word ${
                    group.fromUserId === userId ? "bg-blue-600 rounded-br-none" : "bg-gray-700 rounded-bl-none"
                  }`}>
                    <div className="space-y-1.5">
                      {group.messages.map((messagePart) => (
                        <p key={messagePart.id} className="text-sm leading-5">
                          {messagePart.text}
                        </p>
                      ))}
                    </div>
                    <p className="text-[10px] mt-1 opacity-50 text-right flex items-center justify-end gap-1">
                      {new Date(group.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {group.fromUserId === userId && renderOutgoingStatusTick(group.deliveryStatus)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={onSendMessage} className="p-4 bg-gray-800 border-t border-gray-700 flex gap-4">
              <input
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-gray-700 border-none rounded-full px-6 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
              />
              <button
                type="submit"
                disabled={!message.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-full font-bold transition"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">👋</span>
            </div>
            <p>Select a person from the left to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  )
}
