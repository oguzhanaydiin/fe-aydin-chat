"use client"
import { useEffect, useState, useRef } from "react"
import { useChatSocket } from "@/hooks/useChatSocket"
import type { AuthSessionResponse, SendOtpResponse } from "@/lib/chat/types"

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8080/ws"
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080"
const SESSION_STORAGE_KEY = "chat_auth_session"

type AuthSession = {
  token: string
  userId: string
  email: string
}

async function requestOtp(email: string): Promise<SendOtpResponse> {
  const response = await fetch(`${API_URL}/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to send OTP")
  }

  return (await response.json()) as SendOtpResponse
}

async function verifyOtp(email: string, otp: string): Promise<AuthSessionResponse> {
  const response = await fetch(`${API_URL}/otp/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to verify OTP")
  }

  return (await response.json()) as AuthSessionResponse
}

export default function ChatPage() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [emailInput, setEmailInput] = useState("")
  const [otpInput, setOtpInput] = useState("")
  const [otpEmail, setOtpEmail] = useState<string | null>(null)
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) {
      return
    }

    try {
      const parsed = JSON.parse(raw) as AuthSession
      if (parsed.token && parsed.userId && parsed.email) {
        setAuthSession(parsed)
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY)
      }
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  }, [])

  const userId = authSession?.userId || ""
  const token = authSession?.token || ""

  useEffect(() => {
    if (authSession?.userId) {
      document.title = `Chat - ${authSession.userId}`
    } else {
      document.title = "Chat Login"
    }
  }, [authSession?.userId])

  const [targetUser, setTargetUser] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const { onlineUsers, messagesByPeer, sendMessage: sendChatMessage } = useChatSocket({
    userId,
    token,
    wsUrl: WS_URL,
  })

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messagesByPeer, targetUser])

  const startChat = (otherId: string) => {
    setTargetUser(otherId)
  }

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && targetUser && userId) {
      sendChatMessage(targetUser, message)

      setMessage("")
    }
  }

  const currentMessages = targetUser ? messagesByPeer[targetUser] || [] : []

  const onSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = emailInput.trim().toLowerCase()

    if (!email) {
      setAuthError("Email is required.")
      return
    }

    setAuthLoading(true)
    setAuthError(null)

    try {
      const result = await requestOtp(email)
      setOtpEmail(email)
      setDevOtpHint(result.otp)
      setOtpInput("")
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "OTP send error")
    } finally {
      setAuthLoading(false)
    }
  }

  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpEmail) {
      setAuthError("Request OTP with email first.")
      return
    }

    const otp = otpInput.trim()
    if (!otp) {
      setAuthError("Enter the OTP code.")
      return
    }

    setAuthLoading(true)
    setAuthError(null)

    try {
      const result = await verifyOtp(otpEmail, otp)
      if (!result.valid || !result.token || !result.user_id || !result.email) {
        setAuthError("OTP is invalid or expired.")
        return
      }

      const session: AuthSession = {
        token: result.token,
        userId: result.user_id,
        email: result.email,
      }

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
      setAuthSession(session)
      setTargetUser(null)
      setMessage("")
      setAuthError(null)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "OTP verification error")
    } finally {
      setAuthLoading(false)
    }
  }

  const onLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    setAuthSession(null)
    setEmailInput("")
    setOtpInput("")
    setOtpEmail(null)
    setDevOtpHint(null)
    setTargetUser(null)
    setMessage("")
    setAuthError(null)
  }

  if (!authSession) {
    return (
      <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
          <h1 className="text-2xl font-bold text-blue-400">Aydin Chat Login</h1>
          <p className="mt-2 text-sm text-gray-400">Step one asks for email, step two verifies OTP.</p>

          <form onSubmit={onSendOtp} className="mt-6 space-y-3">
            <label className="text-sm text-gray-300 block">Email</label>
            <input
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              type="email"
              placeholder="sample@mail.com"
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              disabled={authLoading}
            />
            <button
              type="submit"
              disabled={authLoading}
              className="w-full rounded-lg bg-blue-600 py-2 font-semibold hover:bg-blue-500 disabled:opacity-60"
            >
              {authLoading ? "Sending..." : "Send OTP"}
            </button>
          </form>

          <form onSubmit={onVerifyOtp} className="mt-6 space-y-3">
            <label className="text-sm text-gray-300 block">OTP Code</label>
            <input
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value)}
              inputMode="numeric"
              placeholder="6 digit code"
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              disabled={authLoading || !otpEmail}
            />
            <button
              type="submit"
              disabled={authLoading || !otpEmail}
              className="w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-60"
            >
              {authLoading ? "Verifying..." : "Verify OTP"}
            </button>
          </form>

          {devOtpHint && (
            <p className="mt-4 rounded-lg border border-amber-700 bg-amber-950 px-3 py-2 text-xs text-amber-300">
              Development OTP: {devOtpHint}
            </p>
          )}

          {authError && (
            <p className="mt-4 rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
              {authError}
            </p>
          )}
        </section>
      </main>
    )
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
          Your ID: <span className="font-mono text-blue-300">{userId}</span>
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
  )
}