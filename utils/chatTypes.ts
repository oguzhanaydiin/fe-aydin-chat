export interface ChatMessage {
  id: string
  from_user_id: string
  to_user_id: string
  text: string
  group_id?: string
  image_data_url?: string
  reactions?: Record<string, string[]>
  created_at: string
  client_message_id?: string
  delivery_status?: "sending" | "sent" | "delivered" | "failed"
  error_message?: string
}

export interface UserProfile {
  username: string
  email: string
  avatar_data_url?: string | null
}

export interface PublicProfile {
  username: string
  avatar_data_url?: string | null
}

export interface UpdateProfilePayload {
  avatar_data_url?: string
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

export interface UserDirectoryEntry {
  user_id?: string | null
  username?: string | null
  email?: string | null
}

export interface FriendSnapshot {
  accepted_friends: string[]
  incoming_requests: string[]
  outgoing_requests: string[]
}

export type GroupRole = "leader" | "member"

export interface GroupSummary {
  group_id: string
  name: string
  role: GroupRole
  can_invite: boolean
  member_count: number
}

export interface GroupMember {
  username: string
  role: GroupRole
  can_invite: boolean
}

export interface GroupDetail {
  group_id: string
  name: string
  created_by: string
  members: GroupMember[]
}

export type WsClientEvent =
  | { type: "register", token: string }
  | { type: "get_online_users" }
  | { type: "ack", message_ids: string[] }
  | { type: "ack_group", message_ids: string[] }
  | { type: "react_message", message_id: string, to_username: string, reaction: string, to_user_id?: string }
  | { type: "react_group_message", message_id: string, group_id: string, reaction: string }
  | {
    type: "send_message"
    to_user_id: string
    text: string
    image_data_url?: string
    client_message_id?: string
  }
  | {
    type: "send_group_message"
    group_id: string
    text: string
    image_data_url?: string
    client_message_id?: string
  }

export type ConnectionStatus = "idle" | "connecting" | "open" | "closed" | "error"

export type WsServerEvent =
  | { type: "registered", username: string }
  | { type: "online_users", users: string[] }
  | { type: "inbox", messages: ChatMessage[] }
  | { type: "group_inbox", messages: ChatMessage[] }
  | { type: "new_message", message: ChatMessage }
  | { type: "new_group_message", message: ChatMessage }
  | { type: "message_reactions_updated", message_id: string, reactions: Record<string, string[]> }
  | { type: "group_message_reactions_updated", message_id: string, group_id: string, reactions: Record<string, string[]> }
  | { type: "message_queued", message_id: string, client_message_id?: string }
  | { type: "group_message_queued", message_id: string, group_id: string, client_message_id?: string }
  | { type: "ack_result", removed_count: number, message_ids?: string[] }
  | { type: "ack_group_result", removed_count: number, message_ids?: string[] }
  | { type: "message_delivered", message_id: string, client_message_id?: string }
  | { type: "group_message_delivered", message_id: string, group_id: string, client_message_id?: string }
  | { type: "error", message: string, client_message_id?: string, message_id?: string }
