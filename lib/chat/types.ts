export interface ChatMessage {
  id: string
  from_user_id: string
  to_user_id: string
  text: string
  created_at: string
  client_message_id?: string
  delivery_status?: "sending" | "sent" | "delivered"
}

export interface SendOtpResponse {
  message: string
  otp: string
  expires_in_seconds: number
}

export interface AuthSessionResponse {
  valid: boolean
  token: string | null
  user_id: string | null
  email: string | null
  username?: string | null
}

export interface SaveUsernameResponse {
  username: string
}

export type WsClientEvent =
  | { type: "register", token: string }
  | { type: "get_online_users" }
  | { type: "ack", message_ids: string[] }
  | { type: "send_message", to_user_id: string, text: string, client_message_id?: string }

export type ConnectionStatus = "idle" | "connecting" | "open" | "closed" | "error"

export type WsServerEvent =
  | { type: "registered", user_id: string }
  | { type: "online_users", users: string[] }
  | { type: "inbox", messages: ChatMessage[] }
  | { type: "new_message", message: ChatMessage }
  | { type: "message_queued", message_id: string, client_message_id?: string }
  | { type: "ack_result", removed_count: number, message_ids?: string[] }
  | { type: "message_delivered", message_id: string, client_message_id?: string }
  | { type: "error", message: string }
