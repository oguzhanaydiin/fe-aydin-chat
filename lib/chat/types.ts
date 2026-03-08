export interface ChatMessage {
  id: string
  from_user_id: string
  to_user_id: string
  text: string
  created_at: string
}

export type WsClientEvent =
  | { type: "register"; user_id: string }
  | { type: "get_online_users" }
  | { type: "ack"; message_ids: string[] }
  | { type: "send_message"; to_user_id: string; text: string; client_message_id?: string }

export type ConnectionStatus = "idle" | "connecting" | "open" | "closed" | "error"

export type WsServerEvent =
  | { type: "registered"; user_id: string }
  | { type: "online_users"; users: string[] }
  | { type: "inbox"; messages: ChatMessage[] }
  | { type: "new_message"; message: ChatMessage }
  | { type: "message_queued"; message_id: string; client_message_id?: string }
  | { type: "ack_result"; removed_count: number }
  | { type: "error"; message: string }
