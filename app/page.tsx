"use client";
import { useEffect, useState, useRef } from "react";
import { useChatSocket } from "@/hooks/useChatSocket";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "";

export default function ChatPage() {
  const [userId] = useState<string>(
    () => `User-${Math.floor(Math.random() * 1000)}`,
  );

  useEffect(() => {
    if (userId) {
      document.title = `Chat - ${userId}`;
    } else {
      document.title = "Chat";
    }
  }, [userId]);
  const [targetUser, setTargetUser] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { onlineUsers, messagesByPeer, sendMessage: sendChatMessage } = useChatSocket({
    userId,
    wsUrl: WS_URL,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messagesByPeer, targetUser]);

  const startChat = (otherId: string) => {
    setTargetUser(otherId);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && targetUser && userId) {
      sendChatMessage(targetUser, message);

      setMessage("");
    }
  };

  const currentMessages = targetUser ? messagesByPeer[targetUser] || [] : [];

  if (!userId) {
    return <div className="flex h-screen items-center justify-center bg-gray-900 text-white">Loading Chat...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans">
      {/* SIDEBAR */}
      <div className="w-1/4 border-r border-gray-700 p-4 overflow-y-auto bg-gray-800 flex flex-col">
        <h2 className="text-xl font-bold mb-6 text-blue-400">Active Users</h2>
        <div className="space-y-2 flex-1">
          {onlineUsers.length === 0 && <p className="text-gray-500 text-sm">No one is online...</p>}
          {onlineUsers.map((u) => (
            <button
              key={u}
              onClick={() => startChat(u)}
              className={`w-full text-left p-3 rounded-lg transition ${
                targetUser === u ? "bg-blue-600 shadow-lg" : "hover:bg-gray-700 bg-gray-750"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${targetUser === u ? 'bg-white' : 'bg-green-500'}`}></div>
                <span className="truncate">{u}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700 opacity-50 text-xs text-center">
          Senin ID: <span className="font-mono text-blue-300">{userId}</span>
        </div>
      </div>

      {/* CHAT */}
      <div className="flex-1 flex flex-col">
        {targetUser ? (
          <>
            <div className="p-4 border-b border-gray-700 bg-gray-800 flex items-center shadow-sm">
              <h3 className="font-bold text-lg">Chat: <span className="text-blue-400">{targetUser}</span></h3>
            </div>
            
            <div className="flex-1 p-6 overflow-y-auto bg-gray-900 space-y-4">
              {currentMessages.length === 0 && (
                <div className="text-center text-gray-600 mt-10 text-sm">No messages.</div>
              )}
              {currentMessages.map((msg, i) => (
                <div key={msg.id || i} className={`flex ${msg.from_user_id === userId ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] p-3 rounded-2xl break-words ${
                    msg.from_user_id === userId ? "bg-blue-600 rounded-br-none" : "bg-gray-700 rounded-bl-none"
                  }`}>
                    <p className="text-sm">{msg.text}</p>
                    <p className="text-[10px] mt-1 opacity-50 text-right">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-4 bg-gray-800 border-t border-gray-700 flex gap-4">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
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
  );
}