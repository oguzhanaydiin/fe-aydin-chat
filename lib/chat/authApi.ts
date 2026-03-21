import type {
  AuthSessionResponse,
  FriendSnapshot,
  SaveUsernameResponse,
  SendOtpResponse,
  UserDirectoryEntry,
} from "@/lib/chat/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080"

export async function requestOtp(email: string): Promise<SendOtpResponse> {
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

export async function verifyOtp(email: string, otp: string): Promise<AuthSessionResponse> {
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

export async function saveUsername(token: string, username: string): Promise<SaveUsernameResponse> {
  const response = await fetch(`${API_URL}/users/username`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to save username")
  }

  return (await response.json()) as SaveUsernameResponse
}

function normalizeUsersPayload(payload: unknown): string[] {
  const rawItems: unknown[] = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === "object" && Array.isArray((payload as { users?: unknown[] }).users)
      ? (payload as { users: unknown[] }).users
      : [])

  const mapped = rawItems
    .map((entry) => {
      if (typeof entry === "string") {
        return entry
      }

      if (!entry || typeof entry !== "object") {
        return ""
      }

      const user = entry as UserDirectoryEntry
      return (user.username || user.user_id || user.email || "").trim()
    })
    .filter((item): item is string => Boolean(item))

  return Array.from(new Set(mapped))
}

export async function fetchAllUsers(token: string): Promise<string[]> {
  const response = await fetch(`${API_URL}/users`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to fetch users")
  }

  const payload = (await response.json()) as unknown
  return normalizeUsersPayload(payload)
}

function normalizeFriendSnapshot(payload: unknown): FriendSnapshot {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}

  const normalizeList = (value: unknown) => {
    if (!Array.isArray(value)) {
      return [] as string[]
    }

    return Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    )
  }

  return {
    accepted_friends: normalizeList(source.accepted_friends),
    incoming_requests: normalizeList(source.incoming_requests),
    outgoing_requests: normalizeList(source.outgoing_requests),
  }
}

export async function fetchFriendSnapshot(token: string): Promise<FriendSnapshot> {
  const response = await fetch(`${API_URL}/friends`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to fetch friend snapshot")
  }

  const payload = (await response.json()) as unknown
  return normalizeFriendSnapshot(payload)
}

export async function sendFriendRequest(token: string, toUsername: string): Promise<void> {
  const response = await fetch(`${API_URL}/friends/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to_username: toUsername }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to send friend request")
  }
}

export async function acceptFriendRequest(token: string, fromUsername: string): Promise<void> {
  const response = await fetch(`${API_URL}/friends/requests/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ from_username: fromUsername }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to accept friend request")
  }
}
